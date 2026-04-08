import { format, parse, differenceInMinutes } from 'date-fns';
import type { CategoryType, FullTransactionRecord } from '@shared/types/metadata';
import { TransactionStatus } from '@shared/types/metadata';
import { LedgerService } from './LedgerService';
import { ExampleStore } from './ExampleStore';
import { LearningAutomationService } from '../ai/LearningAutomationService';

export interface ManualEntryInput {
  amount: number;
  direction: 'in' | 'out';
  category: CategoryType;
  subject?: string;
  description?: string;
  date?: string;
}

export interface DedupCandidatePair {
  pair_id: string;
  tx_ids: [string, string];
  confidence: number;
  match_reasons: string[];
  discovered_at: string;
  status: 'pending' | 'resolved';
}

type DedupResolution = 'merged' | 'confirmed_unique';

export class ManualEntryManager {
  private static instance: ManualEntryManager;
  private readonly ledgerService = LedgerService.getInstance();

  public static getInstance(): ManualEntryManager {
    if (!ManualEntryManager.instance) {
      ManualEntryManager.instance = new ManualEntryManager();
    }
    return ManualEntryManager.instance;
  }

  public async addEntry(ledgerName: string, input: ManualEntryInput): Promise<string> {
    const memory = this.assertLedgerReady(ledgerName);
    this.validateInput(memory.defined_categories, input);

    const record = await this.buildRecord(input);
    await this.ledgerService.ingestSingleRecord(record);

    if (record.product.trim()) {
      await ExampleStore.addOrUpdate(ledgerName, record, false);
      /**
       * D 类手记样本成功入库后，异步检查是否达到自动学习阈值。
       * 这里不阻塞手记保存结果。
       */
      void LearningAutomationService.evaluateAndRun(ledgerName, this.ledgerService.getCategories());
    }

    return record.id;
  }

  public async deleteEntry(ledgerName: string, id: string): Promise<void> {
    this.assertLedgerReady(ledgerName);

    const existingRecord = this.ledgerService.getState().ledgerMemory?.records[id];
    if (!existingRecord) {
      return;
    }
    if (existingRecord.sourceType !== 'manual') {
      throw new Error(`Record is not a manual entry: ${id}`);
    }

    const linkedId = existingRecord.linked_tx_id;
    const linkedStatus = existingRecord.dedup_status;

    await this.ledgerService.deleteSingleRecord(id);

    if (existingRecord.sourceType === 'manual') {
      await ExampleStore.deleteByTxId(ledgerName, id);
      /**
       * 手记样本删除会改变学习窗口的净变更集，
       * 因此删除后也应重新评估自动学习触发条件。
       */
      void LearningAutomationService.evaluateAndRun(ledgerName, this.ledgerService.getCategories());
    }

    if (linkedId && linkedStatus === 'merged') {
      await this.ledgerService.patchRecord(linkedId, {
        dedup_status: undefined,
        linked_tx_id: undefined,
        updated_at: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
      });
    }
  }

  public async findDedupCandidates(
    ledgerName: string,
    targetRecord: FullTransactionRecord
  ): Promise<DedupCandidatePair[]> {
    const memory = this.assertLedgerReady(ledgerName);
    const targetDateKey = this.getDateKey(targetRecord.time);
    const now = new Date().toISOString();

    return Object.values(memory.records)
      .filter((record) => record.id !== targetRecord.id)
      .filter((record) => record.direction === targetRecord.direction)
      .filter((record) => this.getDateKey(record.time) === targetDateKey)
      .map((record) => {
        const score = this.calculateDedupScore(targetRecord, record);
        return {
          pair_id: this.buildPairId(targetRecord.id, record.id),
          tx_ids: [targetRecord.id, record.id] as [string, string],
          confidence: Number(score.confidence.toFixed(2)),
          match_reasons: score.reasons,
          discovered_at: now,
          status: 'pending' as const
        };
      })
      .filter((candidate) => candidate.confidence >= 0.5)
      .sort((a, b) => b.confidence - a.confidence);
  }

  public async resolveDedupPair(
    ledgerName: string,
    primaryId: string,
    secondaryId: string,
    resolution: DedupResolution
  ): Promise<void> {
    const memory = this.assertLedgerReady(ledgerName);
    const primary = memory.records[primaryId];
    const secondary = memory.records[secondaryId];

    if (!primary || !secondary) {
      throw new Error('Cannot resolve dedup pair: record not found');
    }

    const updatedAt = format(new Date(), 'yyyy-MM-dd HH:mm:ss');

    if (resolution === 'merged') {
      await this.ledgerService.patchRecord(primaryId, {
        dedup_status: 'merged',
        linked_tx_id: secondaryId,
        updated_at: updatedAt
      });
      await this.ledgerService.patchRecord(secondaryId, {
        dedup_status: 'superseded',
        linked_tx_id: primaryId,
        updated_at: updatedAt
      });
      return;
    }

    await this.ledgerService.patchRecord(primaryId, {
      dedup_status: 'confirmed_unique',
      linked_tx_id: secondaryId,
      updated_at: updatedAt
    });
    await this.ledgerService.patchRecord(secondaryId, {
      dedup_status: 'confirmed_unique',
      linked_tx_id: primaryId,
      updated_at: updatedAt
    });
  }

  private assertLedgerReady(ledgerName: string) {
    const currentLedgerName = this.ledgerService.getCurrentLedgerName();
    if (!currentLedgerName || currentLedgerName !== ledgerName) {
      throw new Error(`Ledger is not loaded: ${ledgerName}`);
    }

    const memory = this.ledgerService.getState().ledgerMemory;
    if (!memory) {
      throw new Error(`Ledger memory is not ready: ${ledgerName}`);
    }

    return memory;
  }

  private validateInput(
    definedCategories: Record<string, string>,
    input: ManualEntryInput
  ): void {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error('Manual entry amount must be a positive number');
    }

    if (input.direction !== 'in' && input.direction !== 'out') {
      throw new Error('Manual entry direction must be "in" or "out"');
    }

    const category = input.category?.trim();
    if (!category || !Object.prototype.hasOwnProperty.call(definedCategories, category)) {
      throw new Error(`Manual entry category is invalid: ${input.category}`);
    }
  }

  private async buildRecord(input: ManualEntryInput): Promise<FullTransactionRecord> {
    const date = this.normalizeDate(input.date);
    const time = format(date, 'yyyy-MM-dd HH:mm:ss');
    const subject = input.subject?.trim() ?? '';
    const description = input.description?.trim() ?? '';
    const id = await this.generateId([
      'manual',
      time,
      input.direction,
      input.category.trim(),
      input.amount.toFixed(2),
      subject,
      description,
      crypto.randomUUID()
    ].join('|'));

    return {
      id,
      time,
      sourceType: 'manual',
      category: input.category.trim(),
      rawClass: '',
      counterparty: '',
      product: subject,
      amount: input.amount,
      direction: input.direction,
      paymentMethod: '',
      transactionStatus: TransactionStatus.SUCCESS,
      remark: '',
      ai_category: '',
      ai_reasoning: '',
      user_category: input.category.trim(),
      user_note: description,
      is_verified: true,
      updated_at: time
    };
  }

  private normalizeDate(value?: string): Date {
    if (!value) {
      return new Date();
    }

    const parsed = parse(value, 'yyyy-MM-dd HH:mm:ss', new Date());
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Manual entry date must use YYYY-MM-DD HH:mm:ss: ${value}`);
    }

    return parsed;
  }

  private async generateId(payload: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((item) => item.toString(16).padStart(2, '0')).join('').slice(0, 16);
  }

  private calculateDedupScore(
    targetRecord: FullTransactionRecord,
    candidateRecord: FullTransactionRecord
  ): { confidence: number; reasons: string[] } {
    let confidence = 0;
    const reasons: string[] = [];
    const amountDelta = Math.abs(targetRecord.amount - candidateRecord.amount);

    if (amountDelta === 0) {
      confidence += 0.4;
      reasons.push('金额精确相等');
    } else if (amountDelta <= 1) {
      confidence += 0.25;
      reasons.push('金额差值 <= 1 元');
    } else if (amountDelta <= 5) {
      confidence += 0.08;
      reasons.push('金额差值 <= 5 元');
    }

    const minuteDelta = Math.abs(
      differenceInMinutes(
        parse(targetRecord.time, 'yyyy-MM-dd HH:mm:ss', new Date()),
        parse(candidateRecord.time, 'yyyy-MM-dd HH:mm:ss', new Date())
      )
    );

    if (minuteDelta <= 60) {
      confidence += 0.25;
      reasons.push('同一小时内');
    } else if (minuteDelta <= 120) {
      confidence += 0.15;
      reasons.push('两小时内');
    } else if (this.getHalfDay(targetRecord.time) === this.getHalfDay(candidateRecord.time)) {
      confidence += 0.08;
      reasons.push('同半天');
    }

    if (
      targetRecord.user_category === candidateRecord.user_category ||
      targetRecord.category === candidateRecord.category
    ) {
      confidence += 0.2;
      reasons.push('分类相同');
    }

    const keywordOverlap = this.getKeywordOverlap(
      [targetRecord.product, targetRecord.counterparty].join(' '),
      [candidateRecord.product, candidateRecord.counterparty].join(' ')
    );
    if (keywordOverlap.size > 0) {
      confidence += 0.1;
      reasons.push('文本关键词交集');
    }

    return { confidence, reasons };
  }

  private getDateKey(timeValue: string): string {
    return timeValue.slice(0, 10);
  }

  private getHalfDay(timeValue: string): 'morning' | 'afternoon' | 'evening' | 'unknown' {
    const date = parse(timeValue, 'yyyy-MM-dd HH:mm:ss', new Date());
    const hour = date.getHours();

    if (Number.isNaN(hour)) {
      return 'unknown';
    }
    if (hour < 12) {
      return 'morning';
    }
    if (hour < 18) {
      return 'afternoon';
    }
    return 'evening';
  }

  private getKeywordOverlap(left: string, right: string): Set<string> {
    const leftSet = this.extractKeywords(left);
    const rightSet = this.extractKeywords(right);
    return new Set([...leftSet].filter((word) => rightSet.has(word)));
  }

  private extractKeywords(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .split(/[^\u4e00-\u9fa5a-z0-9]+/)
        .filter((word) => word.length >= 2)
    );
  }

  private buildPairId(a: string, b: string): string {
    return [a, b].sort().join('__');
  }
}
