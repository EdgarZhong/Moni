import { AsyncMutex } from '@shared/utils/AsyncMutex';
import { LLMClient } from '../llm/LLMClient';
import { ConfigManager } from '@system/config/ConfigManager';
import { PromptBuilder, type PromptDayBatch } from '../llm/prompt/PromptBuilder';
import { parse } from 'date-fns';
import { classifyQueue } from './ClassifyQueue';
import { LedgerManager } from '../services/LedgerManager';
import { LedgerService } from '../services/LedgerService';
import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
import { getLedgerStorageDirectory } from '@system/filesystem/fs-storage';
import { getLedgerFilePath } from '@system/filesystem/persistence-paths';
import type { LedgerMemory } from '@shared/types/metadata';
import type { Proposal } from '@logic/domain/plugin/types';
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
}

/**
 * 当前阶段先用内部常量冻结“单次最多并行消费几天”。
 * 设置入口后续再接，不在本轮迁移里暴露到 UI。
 */
const DEFAULT_MAX_PARALLEL_DAYS = 3;
const AI_REASONING_MAX_CHARS = 20;

/**
 * 判断日期键是否落在当前消费范围内。
 * 注意这里故意只服务“消费端过滤”：
 * - dirtyDates 生产不看这个范围
 * - 队列持久化不看这个范围
 * - 只有 BatchProcessor 真正出手消费时才受限
 */
function isDateWithinConsumptionRange(
  dateKey: string,
  range: { start: Date | null; end: Date | null }
): boolean {
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
  private getConsumptionRange(): { start: Date | null; end: Date | null } {
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
    const snapshot = await classifyQueue.getPendingWithRevision(ledgerName);
    const range = this.getConsumptionRange();
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
    const snapshot = await classifyQueue.getPendingWithRevision(ledgerName);
    const range = this.getConsumptionRange();
    return snapshot.tasks.filter((task) => isDateWithinConsumptionRange(task.date, range)).length;
  }

  /**
   * 将当前账本内待分类交易按“日期”分桶，并按照传入日期顺序返回。
   * 这里会自动跳过：
   * - 非 SUCCESS
   * - 非支出
   * - 已锁定
   * - 已有最终分类的记录
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
        .filter(([, record]) => record.time.startsWith(date) && record.transactionStatus === 'SUCCESS' && record.direction === 'out')
        .filter(([, record]) => !record.is_verified && (!record.user_category && (!record.ai_category || record.ai_category === 'uncategorized')))
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
        const candidate = item as { id: string; category?: unknown; reasoning?: unknown };
        return {
          id: candidate.id,
          category: typeof candidate.category === 'string' ? candidate.category : 'uncategorized',
          reasoning: clampAiReasoning(typeof candidate.reasoning === 'string' ? candidate.reasoning : '')
        };
      });
  }

  /**
   * 判断当前账本是否仍存在“需要 AI 继续处理”的交易。
   */
  public hasPendingUnclassified(memory: LedgerMemory): boolean {
    return Object.values(memory.records).some((record) => {
      if (record.transactionStatus !== 'SUCCESS' || record.direction !== 'out' || record.is_verified) {
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
        const model = llmConfig.model || 'deepseek-chat';

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
        const initialTotal = await this.getConsumableTaskCount(ledgerName);
        console.log(`[MONI_AI_DEBUG][BatchProcessor] Ledger: ${ledgerName}, Consumable queue size: ${initialTotal}`);

        if (initialTotal === 0) {
          console.log('[MONI_AI_DEBUG][BatchProcessor] No in-range tasks to consume, returning IDLE.');
          this.updateState('IDLE', { total: 0, current: 0, currentDate: '', currentDates: [] });
          return { success: true, processedCount: 0, errors: [] };
        }

        const client = new LLMClient({
          apiKey,
          baseUrl,
          model,
          temperature: llmConfig.temperature
        });

        let processedCount = 0;
        let currentIndex = 0;
        const allErrors: string[] = [];

        while (!this.shouldStop) {
          console.log(`[MONI_AI_DEBUG][BatchProcessor] Loop start. current: ${currentIndex}, shouldStop: ${this.shouldStop}`);
          const taskBatch = await this.getConsumableTaskBatch(ledgerName);
          if (!taskBatch) {
            console.log('[MONI_AI_DEBUG][BatchProcessor] No more in-range tasks in queue.');
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
            const removed = await classifyQueue.removeBatchIfRevisionMatch(ledgerName, batchDates, taskBatch.revision);
            if (!removed) {
              allErrors.push(`queue changed during empty batch removal: ${batchDates.join(', ')}`);
              break;
            }
            continue;
          }

          try {
            console.log(
              `[MONI_AI_DEBUG][BatchProcessor] Building prompt for ${txCount} items across ${dayBatches.length} days`
            );
            const messages = await PromptBuilder.build(dayBatches, ledgerName);
            
            console.log(`[MONI_AI_DEBUG][BatchProcessor] Calling LLMClient.chat...`);
            const responseText = await client.chat(messages);
            console.log(`[MONI_AI_DEBUG][BatchProcessor] LLM Response received (length: ${responseText.length})`);

            const aiResults = this.parseAiResults(responseText);
            const proposals: Proposal[] = aiResults.map(item => ({
              source: 'AI_AGENT',
              category: item.category,
              reasoning: item.reasoning,
              timestamp: Date.now(),
              txId: item.id
            }));

            console.log(`[MONI_AI_DEBUG][BatchProcessor] Generated ${proposals.length} proposals`);

            for (const proposal of proposals) {
              if (this.proposalHandler && proposal.txId) {
                this.proposalHandler(proposal.txId, proposal);
              }
            }

            processedCount += txCount;
            const removed = await classifyQueue.removeBatchIfRevisionMatch(ledgerName, batchDates, taskBatch.revision);
            if (!removed) {
              allErrors.push(`queue changed during batch removal: ${batchDates.join(', ')}`);
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
