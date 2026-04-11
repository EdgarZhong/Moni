import { AsyncMutex } from '@shared/utils/AsyncMutex';
import { LLMClient } from '../llm/LLMClient';
import { ConfigManager } from '@system/config/ConfigManager';
import { PromptBuilder } from '../llm/prompt/PromptBuilder';
import { parse } from 'date-fns';
import { classifyQueue } from './ClassifyQueue';
import { LedgerManager } from '../services/LedgerManager';
import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
import { getLedgerStorageDirectory } from '@system/filesystem/fs-storage';
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
    const directory = getLedgerStorageDirectory();
    const path = `Moni/${ledgerName}.moni.json`;
    
    console.log(`[MONI_AI_DEBUG][BatchProcessor] Reading ledger memory: ${path} from ${directory}`);
    
    const data = await fs.readFile({
      path,
      directory,
      encoding: AdapterEncoding.UTF8
    });
    return JSON.parse(data) as LedgerMemory;
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
    this.updateState('ANALYZING', { total: 0, current: 0, currentDate: '' });

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
        const initialTotal = await classifyQueue.size(ledgerName);
        console.log(`[MONI_AI_DEBUG][BatchProcessor] Ledger: ${ledgerName}, Initial queue size: ${initialTotal}`);

        if (initialTotal === 0) {
          console.log('[MONI_AI_DEBUG][BatchProcessor] Empty queue, returning IDLE.');
          this.updateState('IDLE', { total: 0, current: 0, currentDate: '' });
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
          const peekSnapshot = await classifyQueue.peekWithRevision(ledgerName);
          if (!peekSnapshot) {
            console.log('[MONI_AI_DEBUG][BatchProcessor] No more tasks in queue.');
            break;
          }

          const { task } = peekSnapshot;
          console.log(`[MONI_AI_DEBUG][BatchProcessor] Processing task: ${task.date}`);

          currentIndex++;
          this.updateState('ANALYZING', {
            total: initialTotal,
            current: currentIndex,
            currentDate: task.date
          });

          const memory = await this.readLedgerMemory(ledgerName);
          const dailyTxs = Object.entries(memory.records)
            .filter(([, r]) => r.time.startsWith(task.date) && r.transactionStatus === 'SUCCESS' && r.direction === 'out')
            .filter(([, r]) => !r.is_verified && (!r.user_category && (!r.ai_category || r.ai_category === 'uncategorized')))
            .map(([id, r]) => ({ ...r, id }));

          console.log(`[MONI_AI_DEBUG][BatchProcessor] Found ${dailyTxs.length} candidate transactions for ${task.date}`);

          if (dailyTxs.length === 0) {
            console.log(`[MONI_AI_DEBUG][BatchProcessor] Skipping ${task.date} (no unclassified txs)`);
            await classifyQueue.dequeue(ledgerName);
            continue;
          }

          try {
            console.log(`[MONI_AI_DEBUG][BatchProcessor] Building prompt for ${dailyTxs.length} items`);
            const dayDate = parse(task.date, 'yyyy-MM-dd', new Date());
            const messages = await PromptBuilder.build(dailyTxs, dayDate, ledgerName);
            
            console.log(`[MONI_AI_DEBUG][BatchProcessor] Calling LLMClient.chat...`);
            const responseText = await client.chat(messages);
            console.log(`[MONI_AI_DEBUG][BatchProcessor] LLM Response received (length: ${responseText.length})`);

            const aiResult = JSON.parse(responseText);
            if (!aiResult.results || !Array.isArray(aiResult.results)) {
              throw new Error('Invalid AI response structure');
            }

            const proposals: Proposal[] = (aiResult.results as any[]).map(item => ({
              source: 'AI_AGENT',
              category: item.category,
              reasoning: item.reasoning || '',
              timestamp: Date.now(),
              txId: item.id
            }));

            console.log(`[MONI_AI_DEBUG][BatchProcessor] Generated ${proposals.length} proposals`);

            for (const proposal of proposals) {
              if (this.proposalHandler && proposal.txId) {
                this.proposalHandler(proposal.txId, proposal);
              }
            }

            processedCount += dailyTxs.length;
            await classifyQueue.dequeue(ledgerName);
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error(`[MONI_AI_DEBUG][BatchProcessor] Task failed for ${task.date}:`, errMsg);
            allErrors.push(`${task.date}: ${errMsg}`);
            break; 
          }
        }

        console.log(`[MONI_AI_DEBUG][BatchProcessor] Run completed. Processed: ${processedCount}, Errors: ${allErrors.length}`);
        this.updateState('IDLE');
        return { success: allErrors.length === 0, processedCount, errors: allErrors };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error('[MONI_AI_DEBUG][BatchProcessor] Fatal error in run():', errMsg);
        this.updateState('ERROR');
        return { success: false, processedCount: 0, errors: [errMsg] };
      }
    });
  }
}
