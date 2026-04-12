import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterDirectory, AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
import {
  getLedgerExampleChangesPath,
  getLedgerExamplesPath,
} from '@system/filesystem/persistence-paths';
import type { FullTransactionRecord, SourceType, TransactionStatus } from '@shared/types/metadata';

export type ExampleKind = 'A' | 'B' | 'C' | 'D';

export interface ExampleEntry {
  id: string;
  created_at: string;
  time: string;
  sourceType: SourceType;
  rawClass: string;
  counterparty: string;
  product: string;
  amount: number;
  direction: 'in' | 'out';
  paymentMethod: string;
  transactionStatus: TransactionStatus;
  remark: string;
  category: string;
  ai_category: string;
  ai_reasoning: string;
  user_note: string;
  is_verified: boolean;
}

export interface ExampleStoreState {
  revision: number;
  entries: ExampleEntry[];
}

export interface ExampleChangeLogEntry {
  revision: number;
  type: 'upsert' | 'delete';
  id: string;
  before: ExampleEntry | null;
  after: ExampleEntry | null;
}

/**
 * 分类阶段注入给 Prompt 的基础案例字段。
 * 按 v7 文档要求，运行时注入不带 created_at，只保留分类真正需要理解的交易语义字段。
 */
interface InjectedReferenceBase {
  id: string;
  time: string;
  sourceType: SourceType;
  rawClass: string;
  counterparty: string;
  product: string;
  amount: number;
  direction: 'in' | 'out';
  paymentMethod: string;
  transactionStatus: TransactionStatus;
  remark: string;
  category: string;
  ai_reasoning: string;
  user_note: string;
  is_verified: boolean;
}

/**
 * B 类错误案例注入字段。
 * 运行时保留 ai_category，并给 ai_category / ai_reasoning 加错误前缀。
 */
export interface MisclassifiedReferenceCorrection extends InjectedReferenceBase {
  ai_category: string;
}

/**
 * A + C + D 类确认案例注入字段。
 * 运行时去掉 ai_category，但保留 ai_reasoning 字段，以与 v7 注入 schema 保持一致。
 */
export type ConfirmedReferenceCorrection = InjectedReferenceBase;

export interface ReferenceCorrectionBundle {
  misclassified_examples: MisclassifiedReferenceCorrection[];
  confirmed_examples: ConfirmedReferenceCorrection[];
}

export interface PendingTransaction {
  id: string;
  counterparty: string;
  description: string;
  amount: number;
  time: string;
}

export interface LearningExampleDelta {
  mode: 'incremental' | 'full_reconcile';
  lastLearnedRevision: number;
  currentRevision: number;
  upserts: ExampleEntry[];
  deletions: ExampleEntry[];
  allEntries?: ExampleEntry[];
  reason?: string;
}

type MealTime = 'breakfast' | 'lunch' | 'dinner' | 'other';

export class ExampleStore {
  private static readonly ERROR_PREFIX = '[错误判断] ';

  private static getFilePath(ledgerName: string): string {
    return getLedgerExamplesPath(ledgerName);
  }

  private static getChangeLogPath(ledgerName: string): string {
    return getLedgerExampleChangesPath(ledgerName);
  }

  public static async exists(ledgerName: string): Promise<boolean> {
    return await this.pathExists(this.getFilePath(ledgerName));
  }

  public static async load(ledgerName: string): Promise<ExampleEntry[]> {
    const state = await this.loadState(ledgerName);
    return state.entries;
  }

  public static async loadState(ledgerName: string): Promise<ExampleStoreState> {
    const raw = await this.readJsonFile<unknown>(this.getFilePath(ledgerName));
    return this.normalizeState(raw);
  }

  public static async save(ledgerName: string, entries: ExampleEntry[]): Promise<void> {
    const previous = await this.loadState(ledgerName);
    const nextEntries = this.sortEntries(
      this.deduplicateEntries(
        entries
          .map(entry => this.normalizeEntry(entry))
          .filter((entry): entry is ExampleEntry => entry !== null)
      )
    );
    const changes = this.buildChangeLog(previous.entries, nextEntries, previous.revision);
    const nextState: ExampleStoreState = {
      revision: changes.length > 0 ? changes[changes.length - 1].revision : previous.revision,
      entries: nextEntries
    };

    await this.writeJsonFile(this.getFilePath(ledgerName), nextState);
    if (changes.length > 0) {
      await this.appendChangeLog(ledgerName, changes);
    }
  }

  public static async loadChangeLog(ledgerName: string): Promise<ExampleChangeLogEntry[]> {
    const raw = await this.readJsonFile<unknown>(this.getChangeLogPath(ledgerName));
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .map(change => this.normalizeChangeLogEntry(change))
      .filter((change): change is ExampleChangeLogEntry => change !== null)
      .sort((a, b) => a.revision - b.revision);
  }

  public static async addOrUpdate(
    ledgerName: string,
    record: FullTransactionRecord,
    isCorrection: boolean
  ): Promise<void> {
    const state = await this.loadState(ledgerName);
    const filtered = state.entries.filter(entry => entry.id !== record.id);
    const nextEntry = this.buildExampleEntry(record, isCorrection);

    if (!nextEntry) {
      if (filtered.length !== state.entries.length) {
        await this.save(ledgerName, filtered);
      }
      return;
    }

    filtered.push(nextEntry);
    await this.save(ledgerName, filtered);
  }

  public static async deleteByTxId(ledgerName: string, txId: string): Promise<void> {
    const entries = await this.load(ledgerName);
    const filtered = entries.filter(entry => entry.id !== txId);

    if (filtered.length !== entries.length) {
      await this.save(ledgerName, filtered);
    }
  }

  public static async deleteByTxIds(ledgerName: string, txIds: Set<string>): Promise<void> {
    const entries = await this.load(ledgerName);
    const filtered = entries.filter(entry => !txIds.has(entry.id));

    if (filtered.length !== entries.length) {
      await this.save(ledgerName, filtered);
    }
  }

  public static async retrieveRelevant(
    ledgerName: string,
    transactions: PendingTransaction[]
  ): Promise<ReferenceCorrectionBundle | undefined> {
    const entries = await this.load(ledgerName);
    if (entries.length === 0 || transactions.length === 0) {
      return undefined;
    }

    const merged = new Map<string, ExampleEntry>();
    for (const tx of transactions) {
      const matches = this.findMatchesForTransaction(tx, entries);
      for (const entry of matches) {
        merged.set(entry.id, entry);
      }
    }

    const sorted = this.sortEntries(Array.from(merged.values()));
    const misclassified_examples = sorted
      .filter(entry => this.getEntryKind(entry) === 'B')
      .map(entry => this.toMisclassifiedReference(entry));
    const confirmed_examples = sorted
      .filter(entry => this.getEntryKind(entry) !== 'B')
      .map(entry => this.toConfirmedReference(entry));

    if (misclassified_examples.length === 0 && confirmed_examples.length === 0) {
      return undefined;
    }

    return {
      misclassified_examples,
      confirmed_examples
    };
  }

  public static async getLearningDelta(
    ledgerName: string,
    lastLearnedRevision: number
  ): Promise<LearningExampleDelta> {
    const state = await this.loadState(ledgerName);
    const currentRevision = state.revision;

    if (currentRevision < lastLearnedRevision) {
      return {
        mode: 'full_reconcile',
        lastLearnedRevision,
        currentRevision,
        upserts: [],
        deletions: [],
        allEntries: state.entries,
        reason: 'example_revision_rolled_back'
      };
    }

    if (currentRevision === lastLearnedRevision) {
      return {
        mode: 'incremental',
        lastLearnedRevision,
        currentRevision,
        upserts: [],
        deletions: []
      };
    }

    const changeLog = await this.loadChangeLog(ledgerName);
    if (changeLog.length === 0) {
      return {
        mode: 'full_reconcile',
        lastLearnedRevision,
        currentRevision,
        upserts: [],
        deletions: [],
        allEntries: state.entries,
        reason: 'missing_change_log'
      };
    }

    const window = changeLog.filter(
      change => change.revision > lastLearnedRevision && change.revision <= currentRevision
    );

    const expectedRevisions = currentRevision - lastLearnedRevision;
    if (window.length !== expectedRevisions) {
      return {
        mode: 'full_reconcile',
        lastLearnedRevision,
        currentRevision,
        upserts: [],
        deletions: [],
        allEntries: state.entries,
        reason: 'revision_window_incomplete'
      };
    }

    for (let i = 0; i < window.length; i++) {
      if (window[i].revision !== lastLearnedRevision + i + 1) {
        return {
          mode: 'full_reconcile',
          lastLearnedRevision,
          currentRevision,
          upserts: [],
          deletions: [],
          allEntries: state.entries,
          reason: 'revision_gap_detected'
        };
      }
    }

    const folded = new Map<string, { before: ExampleEntry | null; after: ExampleEntry | null }>();
    for (const change of window) {
      const current = folded.get(change.id);
      if (!current) {
        folded.set(change.id, {
          before: change.before,
          after: change.after
        });
        continue;
      }

      folded.set(change.id, {
        before: current.before,
        after: change.after
      });
    }

    const upserts: ExampleEntry[] = [];
    const deletions: ExampleEntry[] = [];

    for (const [, change] of folded) {
      if (change.before === null && change.after === null) {
        continue;
      }
      if (change.after !== null) {
        upserts.push(change.after);
        continue;
      }
      if (change.before !== null) {
        deletions.push(change.before);
      }
    }

    return {
      mode: 'incremental',
      lastLearnedRevision,
      currentRevision,
      upserts: this.sortEntries(upserts),
      deletions: this.sortEntries(deletions)
    };
  }

  public static async clear(ledgerName: string): Promise<void> {
    await this.save(ledgerName, []);
  }

  public static async getStats(ledgerName: string): Promise<{ count: number; revision: number }> {
    const state = await this.loadState(ledgerName);
    return {
      count: state.entries.length,
      revision: state.revision
    };
  }

  private static async appendChangeLog(ledgerName: string, changes: ExampleChangeLogEntry[]): Promise<void> {
    const existing = await this.loadChangeLog(ledgerName);
    await this.writeJsonFile(this.getChangeLogPath(ledgerName), [...existing, ...changes]);
  }

  private static buildChangeLog(
    previousEntries: ExampleEntry[],
    nextEntries: ExampleEntry[],
    baseRevision: number
  ): ExampleChangeLogEntry[] {
    const previousById = new Map(previousEntries.map(entry => [entry.id, entry]));
    const nextById = new Map(nextEntries.map(entry => [entry.id, entry]));
    const ids = Array.from(new Set([...previousById.keys(), ...nextById.keys()])).sort();

    let revision = baseRevision;
    const changes: ExampleChangeLogEntry[] = [];

    for (const id of ids) {
      const before = previousById.get(id) ?? null;
      const after = nextById.get(id) ?? null;

      if (before !== null && after !== null && this.areEntriesEqual(before, after)) {
        continue;
      }

      revision += 1;
      changes.push({
        revision,
        type: after === null ? 'delete' : 'upsert',
        id,
        before,
        after
      });
    }

    return changes;
  }

  private static buildExampleEntry(record: FullTransactionRecord, isCorrection: boolean): ExampleEntry | null {
    const kind = this.resolveExampleKind(record, isCorrection);
    if (!kind) {
      return null;
    }

    const finalCategory = this.getFinalCategory(record);
    if (!finalCategory) {
      return null;
    }

    if (kind === 'D' && !record.product.trim()) {
      return null;
    }

    /**
     * D 类手记样本单独走显式映射，避免“恰好与通用分支结果相同”的隐式实现继续漂移。
     * 这样更容易和随手记规格表逐项对照。
     */
    if (kind === 'D') {
      return {
        id: record.id,
        created_at: new Date().toISOString(),
        time: record.time,
        sourceType: 'manual',
        rawClass: '',
        counterparty: '',
        product: record.product.trim(),
        amount: record.amount,
        direction: record.direction,
        paymentMethod: '',
        transactionStatus: 'SUCCESS',
        remark: '',
        category: finalCategory,
        ai_category: '',
        ai_reasoning: '',
        user_note: record.user_note.trim(),
        is_verified: true
      };
    }

    return {
      id: record.id,
      created_at: new Date().toISOString(),
      time: record.time,
      sourceType: record.sourceType,
      rawClass: record.rawClass,
      counterparty: record.counterparty,
      product: record.product,
      amount: record.amount,
      direction: record.direction,
      paymentMethod: record.paymentMethod,
      transactionStatus: record.transactionStatus,
      remark: record.remark,
      category: finalCategory,
      ai_category: kind === 'B' || kind === 'A' ? record.ai_category.trim() : '',
      ai_reasoning: kind === 'B' || kind === 'A' ? record.ai_reasoning.trim() : '',
      user_note: record.user_note.trim(),
      is_verified: kind === 'B' ? record.is_verified : true
    };
  }

  private static resolveExampleKind(record: FullTransactionRecord, isCorrection: boolean): ExampleKind | null {
    const sourceType = record.sourceType;
    const aiCategory = record.ai_category.trim();
    const userCategory = record.user_category.trim();
    const finalCategory = this.getFinalCategory(record);

    if (sourceType === 'manual') {
      return record.product.trim() && finalCategory ? 'D' : null;
    }

    if ((isCorrection || (userCategory && aiCategory && userCategory !== aiCategory)) && finalCategory) {
      return 'B';
    }

    if (aiCategory && record.is_verified && (!userCategory || userCategory === aiCategory)) {
      return 'A';
    }

    if (!aiCategory && userCategory && record.is_verified) {
      return 'C';
    }

    return null;
  }

  private static getFinalCategory(record: FullTransactionRecord): string {
    return record.user_category.trim() || record.category.trim();
  }

  private static findMatchesForTransaction(
    tx: PendingTransaction,
    examples: ExampleEntry[]
  ): ExampleEntry[] {
    return examples
      .map(example => ({
        example,
        score: this.calculateMatchScore(tx, example)
      }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(item => item.example);
  }

  private static calculateMatchScore(tx: PendingTransaction, example: ExampleEntry): number {
    let score = 0;

    if (example.counterparty && this.isCounterpartyMatch(tx.counterparty, example.counterparty)) {
      score += 50;
    }

    const txKeywords = this.extractKeywords(`${tx.counterparty} ${tx.description}`);
    const exampleKeywords = this.extractKeywords(`${example.counterparty} ${example.product}`);
    const commonKeywords = [...txKeywords].filter(keyword => exampleKeywords.has(keyword));
    if (commonKeywords.length > 0) {
      score += Math.min(20, commonKeywords.length * 5);
    }

    const maxAmount = Math.max(tx.amount, example.amount);
    if (maxAmount > 0) {
      const amountRatio = Math.abs(tx.amount - example.amount) / maxAmount;
      if (amountRatio <= 0.5) {
        score += 15 * (1 - amountRatio * 2);
      }
    }

    if (this.getMealTime(tx.time) === this.getMealTime(example.time)) {
      score += 15;
    }

    return score;
  }

  private static isCounterpartyMatch(txCounterparty: string, exampleCounterparty: string): boolean {
    const left = txCounterparty.toLowerCase().trim();
    const right = exampleCounterparty.toLowerCase().trim();
    if (!left || !right) {
      return false;
    }

    return left === right || left.includes(right) || right.includes(left);
  }

  private static extractKeywords(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .split(/[^\u4e00-\u9fa5a-z0-9]+/)
        .filter(word => word.length >= 2)
    );
  }

  private static getMealTime(timeStr: string): MealTime {
    const timePart = timeStr.includes(' ') ? timeStr.split(' ')[1] : timeStr;
    const hour = Number.parseInt(timePart.split(':')[0] ?? '', 10);

    if (Number.isNaN(hour)) {
      return 'other';
    }
    if (hour >= 6 && hour < 10) {
      return 'breakfast';
    }
    if (hour >= 10 && hour < 15) {
      return 'lunch';
    }
    if (hour >= 15 && hour < 21) {
      return 'dinner';
    }
    return 'other';
  }

  private static getEntryKind(entry: ExampleEntry): ExampleKind {
    if (entry.sourceType === 'manual') {
      return 'D';
    }
    if (entry.ai_category && entry.ai_category !== entry.category) {
      return 'B';
    }
    if (entry.ai_category && entry.ai_category === entry.category) {
      return 'A';
    }
    return 'C';
  }

  private static toMisclassifiedReference(entry: ExampleEntry): MisclassifiedReferenceCorrection {
    return {
      id: entry.id,
      time: entry.time,
      sourceType: entry.sourceType,
      rawClass: entry.rawClass,
      counterparty: entry.counterparty,
      product: entry.product,
      amount: entry.amount,
      direction: entry.direction,
      paymentMethod: entry.paymentMethod,
      transactionStatus: entry.transactionStatus,
      remark: entry.remark,
      category: entry.category,
      ai_category: `${this.ERROR_PREFIX}${entry.ai_category}`,
      ai_reasoning: `${this.ERROR_PREFIX}${entry.ai_reasoning}`,
      user_note: entry.user_note,
      is_verified: entry.is_verified
    };
  }

  private static toConfirmedReference(entry: ExampleEntry): ConfirmedReferenceCorrection {
    return {
      id: entry.id,
      time: entry.time,
      sourceType: entry.sourceType,
      rawClass: entry.rawClass,
      counterparty: entry.counterparty,
      product: entry.product,
      amount: entry.amount,
      direction: entry.direction,
      paymentMethod: entry.paymentMethod,
      transactionStatus: entry.transactionStatus,
      remark: entry.remark,
      category: entry.category,
      ai_reasoning: entry.ai_reasoning,
      user_note: entry.user_note,
      is_verified: entry.is_verified
    };
  }

  private static sortEntries(entries: ExampleEntry[]): ExampleEntry[] {
    return [...entries].sort((left, right) => {
      const timeCompare = left.time.localeCompare(right.time);
      if (timeCompare !== 0) {
        return timeCompare;
      }
      const createdCompare = left.created_at.localeCompare(right.created_at);
      if (createdCompare !== 0) {
        return createdCompare;
      }
      return left.id.localeCompare(right.id);
    });
  }

  private static deduplicateEntries(entries: ExampleEntry[]): ExampleEntry[] {
    const byId = new Map<string, ExampleEntry>();
    for (const entry of entries) {
      byId.set(entry.id, entry);
    }
    return Array.from(byId.values());
  }

  private static areEntriesEqual(left: ExampleEntry, right: ExampleEntry): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  private static normalizeState(raw: unknown): ExampleStoreState {
    if (Array.isArray(raw)) {
      return {
        revision: 0,
        entries: this.sortEntries(
          raw
            .map(entry => this.normalizeLegacyEntry(entry))
            .filter((entry): entry is ExampleEntry => entry !== null)
        )
      };
    }

    if (!raw || typeof raw !== 'object') {
      return { revision: 0, entries: [] };
    }

    const candidate = raw as Partial<ExampleStoreState> & { entries?: unknown[] };
    return {
      revision: typeof candidate.revision === 'number' && candidate.revision >= 0 ? candidate.revision : 0,
      entries: this.sortEntries(
        (candidate.entries ?? [])
          .map(entry => this.normalizeEntry(entry))
          .filter((entry): entry is ExampleEntry => entry !== null)
      )
    };
  }

  private static normalizeChangeLogEntry(raw: unknown): ExampleChangeLogEntry | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const candidate = raw as Partial<ExampleChangeLogEntry>;
    if (
      typeof candidate.revision !== 'number' ||
      (candidate.type !== 'upsert' && candidate.type !== 'delete') ||
      typeof candidate.id !== 'string'
    ) {
      return null;
    }

    return {
      revision: candidate.revision,
      type: candidate.type,
      id: candidate.id,
      before: candidate.before ? this.normalizeEntry(candidate.before) : null,
      after: candidate.after ? this.normalizeEntry(candidate.after) : null
    };
  }

  private static normalizeEntry(raw: unknown): ExampleEntry | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const candidate = raw as Partial<ExampleEntry>;
    if (typeof candidate.id !== 'string' || typeof candidate.created_at !== 'string') {
      return null;
    }

    return {
      id: candidate.id,
      created_at: candidate.created_at,
      time: typeof candidate.time === 'string' ? candidate.time : '',
      sourceType: this.normalizeSourceType(candidate.sourceType),
      rawClass: typeof candidate.rawClass === 'string' ? candidate.rawClass : '',
      counterparty: typeof candidate.counterparty === 'string' ? candidate.counterparty : '',
      product: typeof candidate.product === 'string' ? candidate.product : '',
      amount: typeof candidate.amount === 'number' ? candidate.amount : 0,
      direction: candidate.direction === 'in' ? 'in' : 'out',
      paymentMethod: typeof candidate.paymentMethod === 'string' ? candidate.paymentMethod : '',
      transactionStatus: this.normalizeTransactionStatus(candidate.transactionStatus),
      remark: typeof candidate.remark === 'string' ? candidate.remark : '',
      category: typeof candidate.category === 'string' ? candidate.category : '',
      ai_category: typeof candidate.ai_category === 'string' ? candidate.ai_category : '',
      ai_reasoning: typeof candidate.ai_reasoning === 'string' ? candidate.ai_reasoning : '',
      user_note: typeof candidate.user_note === 'string' ? candidate.user_note : '',
      is_verified: candidate.is_verified === true
    };
  }

  private static normalizeLegacyEntry(raw: unknown): ExampleEntry | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const legacy = raw as Record<string, unknown>;
    if (typeof legacy.tx_id !== 'string' || typeof legacy.created_at !== 'string') {
      return null;
    }

    return {
      id: legacy.tx_id,
      created_at: legacy.created_at,
      time: typeof legacy.time === 'string' ? legacy.time : '',
      sourceType: this.normalizeSourceType(legacy.source),
      rawClass: '',
      counterparty: typeof legacy.counterparty === 'string' ? legacy.counterparty : '',
      product: typeof legacy.description === 'string' ? legacy.description : '',
      amount: typeof legacy.amount === 'number' ? legacy.amount : 0,
      direction: legacy.direction === 'in' ? 'in' : 'out',
      paymentMethod: '',
      transactionStatus: 'SUCCESS',
      remark: '',
      category: typeof legacy.category === 'string' ? legacy.category : '',
      ai_category: '',
      ai_reasoning: typeof legacy.ai_reason === 'string' ? legacy.ai_reason : '',
      user_note: typeof legacy.user_reason === 'string' ? legacy.user_reason : '',
      is_verified: true
    };
  }

  private static normalizeSourceType(value: unknown): SourceType {
    return value === 'alipay' || value === 'manual' ? value : 'wechat';
  }

  private static normalizeTransactionStatus(value: unknown): TransactionStatus {
    const normalized = typeof value === 'string' ? value : '';
    switch (normalized) {
      case 'SUCCESS':
      case 'REFUND':
      case 'CLOSED':
      case 'PROCESSING':
      case 'OTHER':
        return normalized;
      default:
        return 'SUCCESS';
    }
  }

  private static async pathExists(path: string): Promise<boolean> {
    try {
      await FilesystemService.getInstance().stat({
        path,
        directory: AdapterDirectory.Data
      });
      return true;
    } catch {
      return false;
    }
  }

  private static async readJsonFile<T>(path: string): Promise<T | null> {
    const exists = await this.pathExists(path);
    if (!exists) {
      return null;
    }

    try {
      const content = await FilesystemService.getInstance().readFile({
        path,
        directory: AdapterDirectory.Data,
        encoding: AdapterEncoding.UTF8
      });
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  private static async writeJsonFile(path: string, payload: unknown): Promise<void> {
    await FilesystemService.getInstance().writeFile({
      path,
      data: JSON.stringify(payload, null, 2),
      directory: AdapterDirectory.Data,
      encoding: AdapterEncoding.UTF8,
      recursive: true
    });
  }
}
