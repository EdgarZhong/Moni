import { AsyncMutex } from '@shared/utils/AsyncMutex';
import { LLMClient } from '../llm/LLMClient';
import { ConfigManager } from '@system/config/ConfigManager';
import { PromptBuilder, type PromptDayBatch } from '../llm/prompt/PromptBuilder';
import { parse } from 'date-fns';
import { classifyIndex } from './ClassifyQueue';
import { LedgerManager } from '../services/LedgerManager';
import { LedgerService } from '../services/LedgerService';
import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
import { getLedgerStorageDirectory } from '@system/filesystem/fs-storage';
import { getLedgerFilePath } from '@system/filesystem/persistence-paths';
import type { LedgerMemory } from '@shared/types/metadata';
import type { Proposal } from '@logic/domain/plugin/types';
import type { AiConfidenceLevel } from '@shared/types/metadata';
import type { AIStatus, AIProgress, ProcessingResult } from './types';

export interface DayCompletedEvent {
  date: string;
  processedTxsCount: number;
  success: boolean;
  error?: string;
}

export type BatchProcessorEventMap = {
  'status': { status: AIStatus, progress: AIProgress };
  'dayCompleted': DayCompletedEvent;
};

interface ConsumableTaskBatch {
  revision: number;
  tasks: Array<{ date: string; enqueuedAt: number }>;
}

interface ParsedAiResultItem {
  id: string;
  category: string;
  reasoning: string;
  confidence: AiConfidenceLevel;
  uncertaintyReason: string;
  usedWeakEvidence: boolean;
  evidenceIds: string[];
}

interface ConsumptionRange {
  start: Date | null;
  end: Date | null;
  isEmpty?: boolean;
}

/**
 * 当前阶段先用内部常量冻结“单次最多并行消费几天”。
 * 设置入口后续再接，不在本轮迁移里暴露到 UI。
 */
const DEFAULT_MAX_PARALLEL_DAYS = 3;
const AI_REASONING_MAX_CHARS = 20;
const AI_UNCERTAINTY_REASON_MAX_CHARS = 60;
const AI_EVIDENCE_IDS_MAX = 3;
// ai_needs_review 金额阈值，先用常量跑 1–2 轮真实数据后再调
const NEEDS_REVIEW_AMOUNT_THRESHOLD = 100;
const VALID_CONFIDENCE_LEVELS: ReadonlySet<string> = new Set(['high', 'medium', 'low']);

/**
 * 判断日期键是否落在当前消费范围内。
 * 注意这里故意只服务“消费端过滤”：
 * - dirtyDates 生产不看这个范围
 * - 队列持久化不看这个范围
 * - 只有 BatchProcessor 真正出手消费时才受限
 */
function isDateWithinConsumptionRange(
  dateKey: string,
  range: ConsumptionRange
): boolean {
  if (range.isEmpty) {
    return false;
  }
  if (!range.start || !range.end) {
    return true;
  }
  const value = new Date(`${dateKey}T00:00:00`);
  return value.getTime() >= range.start.getTime() && value.getTime() <= range.end.getTime();
}

/**
 * 截断 AI 理由长度。
 * 使用字符级截断而不是字节级截断，避免中文被切坏。
 */
function clampAiReasoning(reasoning: string): string {
  return Array.from((reasoning || '').trim()).slice(0, AI_REASONING_MAX_CHARS).join('');
}

function clampUncertaintyReason(reason: string): string {
  return Array.from((reason || '').trim()).slice(0, AI_UNCERTAINTY_REASON_MAX_CHARS).join('');
}

/**
 * ai_needs_review 派生规则（§2.1-F）：
 * 1. confidence === 'low'
 * 2. confidence === 'medium' && amount >= 阈值
 * 3. 同 counterparty 历史分类不一致
 * 4. counterparty 在实例库首次出现且 confidence !== 'high'
 */
function deriveNeedsReview(
  confidence: AiConfidenceLevel,
  amount: number,
  counterparty: string,
  _usedWeakEvidence: boolean,
  memory: LedgerMemory,
  injectedExampleUserNotes: Map<string, string>
): boolean {
  // 条件 1: low 置信度
  if (confidence === 'low') return true;

  // 条件 2: medium + 高金额
  if (confidence === 'medium' && amount >= NEEDS_REVIEW_AMOUNT_THRESHOLD) return true;

  if (counterparty.trim()) {
    // 条件 3: 同 counterparty 历史分类不一致
    const historicalCategories = new Set<string>();
    for (const record of Object.values(memory.records)) {
      if (record.counterparty === counterparty) {
        const cat = record.user_category || record.ai_category;
        if (cat) historicalCategories.add(cat);
      }
    }
    if (historicalCategories.size > 1) return true;

    // 条件 4: counterparty 在实例库首次出现且 confidence !== 'high'
    if (confidence !== 'high') {
      const hasExampleWithSameCounterparty = Array.from(injectedExampleUserNotes.keys()).some((exId) => {
        const record = memory.records[exId];
        return record && record.counterparty === counterparty;
      });
      if (!hasExampleWithSameCounterparty) return true;
    }
  }

  return false;
}

/**
 * 将 Date 统一转回 YYYY-MM-DD。
 * PromptBuilder 负责把字符串日期转成 Date，这里再用同一格式映射回任务键。
 */
function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export class BatchProcessor {
  private static instance: BatchProcessor;
  private mutex = new AsyncMutex();
  private status: AIStatus = 'IDLE';
  private progress: AIProgress = { total: 0, current: 0, currentDate: '', currentDates: [] };
  private eventListeners: { [K in keyof BatchProcessorEventMap]?: ((data: BatchProcessorEventMap[K]) => void)[] } = {};
  private shouldStop = false;
  private proposalHandler?: (txId: string, proposal: Proposal) => void;

  private constructor() {}

  /**
   * 通过适配器层直接读取账本数据（替代旧的文件句柄模式）
   */
  private async readLedgerMemory(ledgerName: string): Promise<LedgerMemory> {
    const fs = FilesystemService.getInstance();
    const directory = getLedgerStorageDirectory();
    const path = getLedgerFilePath(ledgerName);
    
    console.log(`[MONI_AI_DEBUG][BatchProcessor] Reading ledger memory: ${path} from ${directory}`);
    
    const data = await fs.readFile({
      path,
      directory,
      encoding: AdapterEncoding.UTF8
    });
    return JSON.parse(data) as LedgerMemory;
  }

  /**
   * 读取当前首页 / 账本持有的消费范围。
   * 这里直接复用 LedgerService.state.dateRange，
   * 因为首页的 Data Range Picker 已经通过 AppFacade.setDateRange() 写回到这一层。
   */
  private getConsumptionRange(): ConsumptionRange {
    return LedgerService.getInstance().getState().dateRange;
  }

  /**
   * 读取当前账本“可消费”的多天批次。
   * 关键语义：
   * 1. 不改生产端顺序，直接从运行态快照取原始日期集
   * 2. 只按当前消费范围过滤
   * 3. 过滤后再按日期倒序取最近 N 天
   */
  private async getConsumableTaskBatch(ledgerName: string): Promise<ConsumableTaskBatch | null> {
    const snapshot = await classifyIndex.getPendingWithRevision(ledgerName);
    const range = this.getConsumptionRange();

    if (snapshot.tasks.length === 0) {
      return null;
    }

    const tasks = snapshot.tasks
      .filter((task) => isDateWithinConsumptionRange(task.date, range))
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, DEFAULT_MAX_PARALLEL_DAYS)
      .map((task) => ({
        date: task.date,
        enqueuedAt: task.enqueuedAt
      }));

    if (tasks.length === 0) {
      return null;
    }

    return {
      revision: snapshot.revision,
      tasks
    };
  }

  /**
   * 仅统计当前消费范围内还能处理多少天。
   * 进度条应反映“本次 run 能实际消费的任务量”，
   * 而不是把范围外 backlog 也算进来。
   */
  private async getConsumableTaskCount(ledgerName: string): Promise<number> {
    const snapshot = await classifyIndex.getPendingWithRevision(ledgerName);
    const range = this.getConsumptionRange();
    return snapshot.tasks.filter((task) => isDateWithinConsumptionRange(task.date, range)).length;
  }

  /**
   * 将当前账本内“已入索引日期”的当日消费交易按“日期”分桶，并按照传入日期顺序返回。
   * 当前冻结口径下，这里不再按 transactionStatus 裁掉记录；
   * 只要某天被判定为 dirty，对 AI 就继续注入当天完整消费上下文，包括：
   * - 已锁定交易
   * - 已有 AI / USER 分类结果的交易
   *
   * 这样可以保证：
   * 1. 任务生产边界仍由触发层按“未锁定且最终未分类条目”决定 dirtyDates
   * 2. 一旦某天已经入队，分类会话看到的仍是该天完整消费上下文
   * 3. 锁定保护留在仲裁 / 写回阶段，而不是提示词裁剪阶段
   */
  private buildPromptDayBatches(memory: LedgerMemory, dates: string[]): {
    dayBatches: PromptDayBatch[];
    emptyDates: string[];
    txCount: number;
  } {
    const dayBatches: PromptDayBatch[] = [];
    const emptyDates: string[] = [];
    let txCount = 0;

    for (const date of dates) {
      const transactions = Object.entries(memory.records)
        .filter(([, record]) => record.time.startsWith(date))
        .map(([id, record]) => ({ ...record, id }));

      if (transactions.length === 0) {
        emptyDates.push(date);
        continue;
      }

      dayBatches.push({
        date: parse(date, 'yyyy-MM-dd', new Date()),
        transactions
      });
      txCount += transactions.length;
    }

    return {
      dayBatches,
      emptyDates,
      txCount
    };
  }

  /**
   * 解析模型输出。
   * 当前优先支持新的扁平结构：
   *   { results: [{ id, category, reasoning }] }
   * 同时兼容模型偶尔返回的分天结构：
   *   { days: [{ date, results: [...] }] }
   */
  private parseAiResults(rawResponse: string): ParsedAiResultItem[] {
    const parsed = JSON.parse(rawResponse) as {
      results?: unknown;
      days?: Array<{ results?: unknown }>;
    };

    const flatResults = Array.isArray(parsed.results)
      ? parsed.results
      : Array.isArray(parsed.days)
        ? parsed.days.flatMap((day) => (Array.isArray(day?.results) ? day.results : []))
        : null;

    if (!flatResults) {
      throw new Error('Invalid AI response structure');
    }

    return flatResults
      .filter((item) => Boolean(item) && typeof (item as { id?: unknown }).id === 'string')
      .map((item) => {
        const candidate = item as {
          id: string;
          category?: unknown;
          reasoning?: unknown;
          confidence?: unknown;
          uncertaintyReason?: unknown;
          usedWeakEvidence?: unknown;
          evidenceIds?: unknown;
        };
        const rawConfidence = typeof candidate.confidence === 'string' ? candidate.confidence : '';
        const confidence: AiConfidenceLevel = VALID_CONFIDENCE_LEVELS.has(rawConfidence)
          ? rawConfidence as AiConfidenceLevel
          : 'low'; // 无法解析时保守降级为 low
        return {
          id: candidate.id,
          category: typeof candidate.category === 'string' ? candidate.category : 'uncategorized',
          reasoning: clampAiReasoning(typeof candidate.reasoning === 'string' ? candidate.reasoning : ''),
          confidence,
          uncertaintyReason: confidence === 'high'
            ? '' // high 时强制清空
            : clampUncertaintyReason(typeof candidate.uncertaintyReason === 'string' ? candidate.uncertaintyReason : ''),
          usedWeakEvidence: typeof candidate.usedWeakEvidence === 'boolean' ? candidate.usedWeakEvidence : false,
          evidenceIds: Array.isArray(candidate.evidenceIds)
            ? (candidate.evidenceIds as unknown[]).filter((eid): eid is string => typeof eid === 'string').slice(0, AI_EVIDENCE_IDS_MAX)
            : []
        };
      });
  }

  /**
   * 后处理 AI 分类结果：防幻觉校验 + 弱证据代码侧验证 + confidence 降级 + ai_needs_review 派生。
   * @param results 解析后的原始 AI 结果
   * @param injectedExampleUserNotes 注入到 prompt 的实例 ID → user_note 映射
   * @param dayTxIds 本次 days[] 中所有交易的 ID 集合
   * @param memory 当前账本数据（用于 counterparty 历史查询）
   */
  private postProcessAiResults(
    results: ParsedAiResultItem[],
    injectedExampleUserNotes: Map<string, string>,
    dayTxIds: Set<string>,
    memory: LedgerMemory
  ): Array<ParsedAiResultItem & { needsReview: boolean }> {
    // 合法 evidenceIds 来源 = 注入实例 + days[] 交易
    const validIds = new Set([...injectedExampleUserNotes.keys(), ...dayTxIds]);

    return results.map((item) => {
      // --- evidenceIds 防幻觉：剔除不在注入集合中的 ID ---
      const validatedEvidenceIds = item.evidenceIds.filter((eid) => {
        if (validIds.has(eid)) return true;
        console.warn(`[MONI_AI_DEBUG][PostProcess] 剔除幻觉 evidenceId: ${eid} (交易 ${item.id})`);
        return false;
      });

      // --- usedWeakEvidence 代码侧验证 ---
      const codeWeakEvidence = validatedEvidenceIds.some((eid) => {
        const userNote = injectedExampleUserNotes.get(eid);
        return userNote !== undefined && userNote.startsWith('[弱证据]');
      });
      if (codeWeakEvidence !== item.usedWeakEvidence) {
        console.warn(
          `[MONI_AI_DEBUG][PostProcess] usedWeakEvidence 模型/代码不一致: 模型=${item.usedWeakEvidence}, 代码=${codeWeakEvidence} (交易 ${item.id})`
        );
      }
      const finalUsedWeakEvidence = codeWeakEvidence;

      // --- confidence 降级：high 但 evidenceIds 全被剔除 → medium ---
      let finalConfidence = item.confidence;
      if (finalConfidence === 'high' && validatedEvidenceIds.length === 0) {
        console.warn(
          `[MONI_AI_DEBUG][PostProcess] confidence 从 high 降级为 medium: evidenceIds 全被剔除 (交易 ${item.id})`
        );
        finalConfidence = 'medium';
      }

      // --- uncertaintyReason 与 confidence 一致性 ---
      const finalUncertaintyReason = finalConfidence === 'high' ? '' : item.uncertaintyReason;

      // --- ai_needs_review 派生 ---
      const tx = memory.records[item.id];
      const amount = tx?.amount ?? 0;
      const counterparty = tx?.counterparty ?? '';
      const needsReview = deriveNeedsReview(
        finalConfidence,
        amount,
        counterparty,
        finalUsedWeakEvidence,
        memory,
        injectedExampleUserNotes
      );

      return {
        ...item,
        confidence: finalConfidence,
        uncertaintyReason: finalUncertaintyReason,
        usedWeakEvidence: finalUsedWeakEvidence,
        evidenceIds: validatedEvidenceIds,
        needsReview
      };
    });
  }

  /**
   * 判断当前账本是否仍存在”需要 AI 继续处理”的交易。
   * 冻结口径：dirty 只看”是否锁定 + 是否已有最终分类”，不再混入 transactionStatus / direction。
   */
  public hasPendingUnclassified(memory: LedgerMemory): boolean {
    return Object.values(memory.records).some((record) => {
      if (record.is_verified) {
        return false;
      }
      const finalCategory = record.user_category || record.ai_category || record.category;
      return !finalCategory || finalCategory === 'uncategorized';
    });
  }

  public static getInstance(): BatchProcessor {
    if (!BatchProcessor.instance) {
      BatchProcessor.instance = new BatchProcessor();
    }
    return BatchProcessor.instance;
  }

  public setProposalHandler(handler: (txId: string, proposal: Proposal) => void) {
    this.proposalHandler = handler;
  }

  public subscribe(listener: (status: AIStatus, progress: AIProgress) => void) {
    return this.on('status', (data) => {
      listener(data.status, data.progress);
    });
  }

  public on<K extends keyof BatchProcessorEventMap>(event: K, listener: (data: BatchProcessorEventMap[K]) => void) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event]!.push(listener);

    if (event === 'status') {
      (listener as (data: BatchProcessorEventMap['status']) => void)({ status: this.status, progress: this.progress });
    }

    return () => {
      const listeners = this.eventListeners[event];
      if (!listeners) {
        return;
      }
      this.eventListeners[event] = listeners.filter(l => l !== listener) as typeof listeners;
    };
  }

  private emit<K extends keyof BatchProcessorEventMap>(event: K, data: BatchProcessorEventMap[K]) {
    const listeners = this.eventListeners[event];
    if (listeners) {
      listeners.forEach(l => l(data));
    }
  }

  private updateState(status: AIStatus, progress?: Partial<AIProgress>) {
    this.status = status;
    if (progress) {
      this.progress = { ...this.progress, ...progress };
    }
    this.emit('status', { status: this.status, progress: this.progress });
  }

  public stop() {
    this.shouldStop = true;
  }

  public get isStopping() {
    return this.shouldStop;
  }

  public async run(): Promise<ProcessingResult> {
    console.log('[MONI_AI_DEBUG][BatchProcessor] Starting run(). Status:', this.status);
    if (this.status === 'ANALYZING') {
      console.warn('[MONI_AI_DEBUG][BatchProcessor] Already running, throwing error.');
      throw new Error('Processor is already running');
    }

    this.shouldStop = false;
    this.updateState('ANALYZING', { total: 0, current: 0, currentDate: '', currentDates: [] });

    return this.mutex.dispatch(async () => {
      try {
        const configManager = ConfigManager.getInstance();
        const llmConfig = await configManager.getActiveModelConfig();

        const apiKey = llmConfig.apiKey;
        const baseUrl = llmConfig.baseUrl || 'https://api.deepseek.com';
        const model = llmConfig.model || 'deepseek-v4-pro';

        console.log('[MONI_AI_DEBUG][BatchProcessor] Config loaded:', {
          model,
          baseUrl,
          hasApiKey: !!apiKey,
          temperature: llmConfig.temperature
        });

        if (!apiKey) {
          console.error('[MONI_AI_DEBUG][BatchProcessor] API Key missing!');
          throw new Error('API Key not configured');
        }

        const ledgerName = LedgerManager.getInstance().getActiveLedgerName();
        const needsRebuild = await classifyIndex.hasNeedsRebuild(ledgerName);
        if (needsRebuild) {
          console.warn('[MONI_AI_DEBUG][BatchProcessor] Dirty index marked as needs_rebuild, rebuilding before run...');
          const memory = await this.readLedgerMemory(ledgerName);
          await classifyIndex.rebuildFromRecords(ledgerName, memory.records, 'batchprocessor_preflight_rebuild');
        }
        const initialTotal = await this.getConsumableTaskCount(ledgerName);
        const pendingQueueSize = await classifyIndex.size(ledgerName);
        console.log(
          `[MONI_AI_DEBUG][BatchProcessor] Ledger: ${ledgerName}, Pending index size: ${pendingQueueSize}, Consumable pending size: ${initialTotal}`
        );

        if (initialTotal === 0) {
          console.log(
            pendingQueueSize === 0
              ? '[MONI_AI_DEBUG][BatchProcessor] Pending index empty, returning IDLE.'
              : '[MONI_AI_DEBUG][BatchProcessor] No consumable tasks in current range, returning IDLE while preserving pending index.'
          );
          this.updateState('IDLE', { total: 0, current: 0, currentDate: '', currentDates: [] });
          return { success: true, processedCount: 0, errors: [] };
        }

        const client = new LLMClient({
          apiKey,
          baseUrl,
          model,
          temperature: llmConfig.temperature,
          maxTokens: llmConfig.maxTokens,
          enableThinking: llmConfig.enableThinking,
        });

        let processedCount = 0;
        let currentIndex = 0;
        const allErrors: string[] = [];

        while (!this.shouldStop) {
          console.log(`[MONI_AI_DEBUG][BatchProcessor] Loop start. current: ${currentIndex}, shouldStop: ${this.shouldStop}`);
          const taskBatch = await this.getConsumableTaskBatch(ledgerName);
          if (!taskBatch) {
            const remainingQueueSize = await classifyIndex.size(ledgerName);
            console.log(
              remainingQueueSize === 0
                ? '[MONI_AI_DEBUG][BatchProcessor] Pending index empty after current loop.'
                : '[MONI_AI_DEBUG][BatchProcessor] No more consumable tasks in current range; pending index remains non-empty.'
            );
            break;
          }

          const batchDates = taskBatch.tasks.map((task) => task.date);
          console.log(`[MONI_AI_DEBUG][BatchProcessor] Processing task batch: ${batchDates.join(', ')}`);

          currentIndex += taskBatch.tasks.length;
          this.updateState('ANALYZING', {
            total: initialTotal,
            current: currentIndex,
            currentDate: batchDates[0],
            /**
             * 引擎层显式暴露“当前批次到底有哪些日期”。
             * UI 层后续应只消费这个正式接口，不要再根据 DEFAULT_MAX_PARALLEL_DAYS 或队列结构自行猜。
             */
            currentDates: batchDates
          });

          const memory = await this.readLedgerMemory(ledgerName);
          const { dayBatches, txCount } = this.buildPromptDayBatches(memory, batchDates);

          console.log(
            `[MONI_AI_DEBUG][BatchProcessor] Found ${txCount} candidate transactions across ${dayBatches.length} days`
          );

          if (dayBatches.length === 0) {
            console.log(`[MONI_AI_DEBUG][BatchProcessor] Skipping batch ${batchDates.join(', ')} (no unclassified txs)`);
            const removed = await classifyIndex.removeBatchIfRevisionMatch(ledgerName, batchDates, taskBatch.revision);
            if (!removed) {
              allErrors.push(`index changed during empty batch removal: ${batchDates.join(', ')}`);
              break;
            }
            continue;
          }

          try {
            console.log(
              `[MONI_AI_DEBUG][BatchProcessor] Building prompt for ${txCount} items across ${dayBatches.length} days`
            );
            const { messages, injectedExampleUserNotes } = await PromptBuilder.build(dayBatches, ledgerName);

            // 收集本次 days[] 中所有交易 ID（用于 evidenceIds 防幻觉校验）
            const dayTxIds = new Set(dayBatches.flatMap((batch) => batch.transactions.map((tx) => tx.id)));

            console.log(`[MONI_AI_DEBUG][BatchProcessor] Calling LLMClient.chat...`);
            const responseText = await client.chat(messages);
            console.log(`[MONI_AI_DEBUG][BatchProcessor] LLM Response received (length: ${responseText.length})`);

            const rawResults = this.parseAiResults(responseText);
            const aiResults = this.postProcessAiResults(rawResults, injectedExampleUserNotes, dayTxIds, memory);
            const now = Date.now();
            const proposals: Proposal[] = aiResults.map(item => ({
              source: 'AI_AGENT',
              category: item.category,
              reasoning: item.reasoning,
              timestamp: now,
              txId: item.id,
              aiMeta: {
                confidence: item.confidence,
                uncertaintyReason: item.uncertaintyReason,
                usedWeakEvidence: item.usedWeakEvidence,
                evidenceIds: item.evidenceIds,
                needsReview: item.needsReview
              }
            }));

            console.log(`[MONI_AI_DEBUG][BatchProcessor] Generated ${proposals.length} proposals`);

            for (const proposal of proposals) {
              if (this.proposalHandler && proposal.txId) {
                this.proposalHandler(proposal.txId, proposal);
              }
            }

            processedCount += txCount;
            const removed = await classifyIndex.removeBatchIfRevisionMatch(ledgerName, batchDates, taskBatch.revision);
            if (!removed) {
              allErrors.push(`index changed during batch removal: ${batchDates.join(', ')}`);
              break;
            }

            for (const date of batchDates) {
              this.emit('dayCompleted', {
                date,
                processedTxsCount: dayBatches.find((batch) => toDateKey(batch.date) === date)?.transactions.length ?? 0,
                success: true
              });
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error(`[MONI_AI_DEBUG][BatchProcessor] Task batch failed for ${batchDates.join(', ')}:`, errMsg);
            allErrors.push(`${batchDates.join(', ')}: ${errMsg}`);
            for (const date of batchDates) {
              this.emit('dayCompleted', {
                date,
                processedTxsCount: 0,
                success: false,
                error: errMsg
              });
            }
            break; 
          }
        }

        console.log(`[MONI_AI_DEBUG][BatchProcessor] Run completed. Processed: ${processedCount}, Errors: ${allErrors.length}`);
        this.updateState('IDLE', { currentDate: '', currentDates: [] });
        return { success: allErrors.length === 0, processedCount, errors: allErrors };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('[MONI_AI_DEBUG][BatchProcessor] Fatal error in run():', errMsg);
        this.updateState('ERROR', { currentDates: [] });
        return { success: false, processedCount: 0, errors: [errMsg] };
      }
    });
  }
}
