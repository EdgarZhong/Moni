import { AsyncMutex } from '@shared/utils/AsyncMutex';
import { LLMClient } from '../llm/LLMClient';
import { ConfigManager } from '@system/config/ConfigManager';
import { PromptBuilder } from '../llm/prompt/PromptBuilder';
import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterDirectory, AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
import type { FullTransactionRecord, LedgerMemory } from '@shared/types/metadata';
import type { Proposal } from '@logic/domain/plugin/types';
import type { AIStatus, AIProgress, ProcessingResult } from './types';
import { parse } from 'date-fns';
import { classifyQueue } from './ClassifyQueue';
import { LedgerManager } from '../services/LedgerManager';
import { normalizeToDateKey } from './DateNormalizer';

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

export class BatchProcessor {
  private static instance: BatchProcessor;
  private mutex = new AsyncMutex();
  private status: AIStatus = 'IDLE';
  private progress: AIProgress = { total: 0, current: 0, currentDate: '' };
  private eventListeners: { [K in keyof BatchProcessorEventMap]?: ((data: BatchProcessorEventMap[K]) => void)[] } = {};
  private shouldStop = false;
  private proposalHandler?: (txId: string, proposal: Proposal) => void;

  private constructor() {}

  /**
   * 通过适配器层直接读取账本数据（替代旧的文件句柄模式）
   */
  private async readLedgerMemory(ledgerName: string): Promise<LedgerMemory> {
    const fs = FilesystemService.getInstance();
    const data = await fs.readFile({
      path: `Moni/${ledgerName}.moni.json`,
      directory: AdapterDirectory.Documents,
      encoding: AdapterEncoding.UTF8
    });
    return JSON.parse(data) as LedgerMemory;
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
    if (this.status === 'ANALYZING') {
      throw new Error('Processor is already running');
    }

    this.shouldStop = false;
    this.updateState('ANALYZING', { total: 0, current: 0, currentDate: '' });

    return this.mutex.dispatch(async () => {
      try {
        const configManager = ConfigManager.getInstance();
        const llmConfig = await configManager.getActiveModelConfig();

        const apiKey = llmConfig.apiKey;
        const baseUrl = llmConfig.baseUrl || 'https://api.deepseek.com';
        const model = llmConfig.model || 'deepseek-chat';

        if (!apiKey) {
          console.warn('[BatchProcessor] API Key not configured for active model:', model);
          throw new Error('API Key not configured');
        }

        /**
         * v5.1 约束：
         * 1) 仅消费当前选中账本；
         * 2) 队列任务业务语义仅 { date }，账本由消费上下文决定。
         */
        const ledgerName = LedgerManager.getInstance().getActiveLedgerName();

        // 在循环开始前读取队列总量，用于进度显示
        const initialTotal = await classifyQueue.size(ledgerName);
        if (initialTotal === 0) {
          this.updateState('IDLE', { total: 0, current: 0, currentDate: '' });
          return { success: true, processedCount: 0, errors: [] };
        }

        const client = new LLMClient({
          apiKey,
          baseUrl,
          model,
          temperature: llmConfig.temperature
        });

        /**
         * 循环消费：逐日处理队列中所有任务，直到队列清空或用户主动停止。
         * 单日失败时记录错误并跳过（任务保留在队列中等待重试），不中断整个循环。
         */
        let processedCount = 0;
        let currentIndex = 0;
        const allErrors: string[] = [];

        while (!this.shouldStop) {
          const peekSnapshot = await classifyQueue.peekWithRevision(ledgerName);
          if (!peekSnapshot) {
            // 队列已消费完毕
            break;
          }

          const { task, revision } = peekSnapshot;

          if (task.ledger !== ledgerName) {
            throw new Error(`Peeked task ledger mismatch: ${task.ledger} !== ${ledgerName}`);
          }

          currentIndex++;
          // 动态更新进度（total 使用初始量，不随消费缩减，便于 UI 展示完整进度条）
          this.updateState('ANALYZING', {
            total: initialTotal,
            current: currentIndex,
            currentDate: task.date
          });

          // 读取该日交易
          const memory = await this.readLedgerMemory(ledgerName);
          const txs = Object.values(memory.records) as FullTransactionRecord[];
          const dayTxs = txs.filter(tx => normalizeToDateKey(tx.time) === task.date);

          if (dayTxs.length === 0) {
            /**
             * 空任务处理：
             * - 通过 revision CAS 删除，避免并发重入时误删新任务；
             * - 仅在成功删除后累计 emptyTask 指标。
             */
            const removedByCas = await classifyQueue.removeIfRevisionMatch(ledgerName, task.date, revision);
            if (removedByCas) {
              const emptyCount = await classifyQueue.incrementEmptyTaskConsumed(ledgerName, task.date);
              console.log(`[BatchProcessor] Empty task consumed for ${ledgerName}/${task.date}, count=${emptyCount}`);
            }
            this.emit('dayCompleted', {
              date: task.date,
              processedTxsCount: 0,
              success: true
            });
            processedCount++;
            continue;
          }

          try {
            const dayDate = parse(task.date, 'yyyy-MM-dd', new Date());
            const messages = await PromptBuilder.build(dayTxs, dayDate, ledgerName);
            const responseText = await client.chat(messages);

            const aiResult = JSON.parse(responseText);
            if (!aiResult.results || !Array.isArray(aiResult.results)) {
              throw new Error('Invalid AI response structure');
            }

            if (this.proposalHandler) {
              const timestamp = Date.now();
              // 写回前重新读取最新内存，确保 is_verified 二次校验基于最新状态
              const latestMemory = await this.readLedgerMemory(ledgerName);
              for (const item of aiResult.results as Array<{ id: string; category: string; reasoning?: string }>) {
                if (!item.id || !item.category) {
                  continue;
                }

                const existing = latestMemory.records[item.id] as FullTransactionRecord | undefined;
                // 锁定竞态保护：写回前二次校验 is_verified，已锁定则丢弃该条 proposal
                if (existing?.is_verified) {
                  continue;
                }

                const proposal: Proposal = {
                  source: 'AI_AGENT',
                  category: item.category,
                  reasoning: item.reasoning || '',
                  timestamp,
                  txId: item.id
                };
                this.proposalHandler(item.id, proposal);
              }
            } else {
              console.warn('[BatchProcessor] No proposal handler registered! Results are lost.');
            }

            this.emit('dayCompleted', {
              date: task.date,
              processedTxsCount: dayTxs.length,
              success: true
            });
            /**
             * 成功后按 CAS 出队，若 revision 已变化说明队列被并发更新，不应误删。
             */
            await classifyQueue.removeIfRevisionMatch(ledgerName, task.date, revision);
            processedCount++;
          } catch (e: unknown) {
            /**
             * 单日失败不出队：任务保留等后续重试，满足”失败不丢任务”约束。
             * 跳过该日继续处理下一任务，避免单日错误卡死整个消费循环。
             */
            const errorMessage = e instanceof Error ? e.message : String(e);
            allErrors.push(`${task.date}: ${errorMessage}`);
            this.emit('dayCompleted', {
              date: task.date,
              processedTxsCount: dayTxs.length,
              success: false,
              error: errorMessage
            });
            console.error(`[BatchProcessor] Day ${task.date} failed, kept in queue for retry:`, errorMessage);

            /**
             * 失败后将该任务移到队尾，避免同一失败任务反复阻塞队列头部。
             * 实现方式：先移除，再重新入队（入队会追加到队尾）。
             * 若移除或重新入队失败，任务仍保留在队头，下次 run 时再次尝试。
             */
            const movedToTail = await classifyQueue.removeIfRevisionMatch(ledgerName, task.date, revision);
            if (movedToTail) {
              await classifyQueue.enqueue({ ledger: ledgerName, date: task.date });
              console.log(`[BatchProcessor] Moved failed task to tail: ${ledgerName}/${task.date}`);
            }
            // 单日失败后退出循环，避免反复失败消耗资源；下次用户手动重试
            break;
          }
        }

        this.updateState('IDLE', { total: initialTotal, current: currentIndex, currentDate: '' });
        return {
          success: allErrors.length === 0,
          processedCount,
          errors: allErrors
        };
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        this.updateState('ERROR');
        return { success: false, processedCount: 0, errors: [errorMessage] };
      }
    });
  }
}
