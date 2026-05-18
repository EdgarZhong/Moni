import { generateSystemPrompt } from './SystemPrompt';
import { LedgerLoader } from './LedgerLoader';
import { ConfigManager } from '@system/config/ConfigManager';
import { DEFAULT_LEDGER_NAME } from '@system/filesystem/fs-storage';
import { ExampleStore } from '../../services/ExampleStore';
import { MemoryManager } from '../../services/MemoryManager';
import type { ChatMessage } from '../types';
import type { TransactionBase } from '@shared/types/metadata';
import { format } from 'date-fns';

/**
 * Prompt 中的单日批次结构。
 * 之所以单独显式建模，是为了让 BatchProcessor 可以一次注入多天，
 * 同时继续复用既有的 reference correction / memory / self-description 组装逻辑。
 */
export interface PromptDayBatch {
  /** 该批交易对应的自然日 */
  date: Date;
  /** 当天待分类交易 */
  transactions: TransactionBase[];
}

// PromptBuilder 返回值：消息 + 注入的实例上下文（供后处理校验用）
export interface PromptBuildResult {
  messages: ChatMessage[];
  // 注入到 reference_corrections 中的所有实例 ID → user_note 映射
  injectedExampleUserNotes: Map<string, string>;
}

export class PromptBuilder {
  public static async build(
    dayBatches: PromptDayBatch[],
    ledgerName: string = DEFAULT_LEDGER_NAME,
    language: string = 'Chinese'
  ): Promise<PromptBuildResult> {
    const categoryList = await LedgerLoader.loadCategories(ledgerName);

    const configManager = ConfigManager.getInstance();
    const selfDescription = await configManager.getUserContext();

    const memory = await MemoryManager.load(ledgerName);
    const memoryText = memory.length > 0 ? memory.join('\n') : undefined;

    /**
     * 多天批次下，案例检索仍然使用“本次所有待分类交易”的并集，
     * 这样既能覆盖跨天相似商户，也避免为每一天单独重复检索。
     */
    const allTransactions = dayBatches.flatMap((batch) => batch.transactions);

    const pendingTxs = allTransactions.map(tx => ({
      id: tx.id,
      counterparty: tx.counterparty,
      description: tx.product || tx.remark || '',
      amount: tx.amount,
      time: tx.time.split(' ')[1] || tx.time
    }));
    const referenceCorrections = await ExampleStore.retrieveRelevant(ledgerName, pendingTxs);

    // 收集注入实例的 ID → user_note 映射，供 BatchProcessor 后处理校验
    const injectedExampleUserNotes = new Map<string, string>();
    if (referenceCorrections) {
      for (const block of [
        referenceCorrections.recent_misclassified_examples,
        referenceCorrections.recent_confirmed_examples,
        referenceCorrections.retrieved_misclassified_examples,
        referenceCorrections.retrieved_confirmed_examples,
      ]) {
        for (const ex of block) {
          injectedExampleUserNotes.set(ex.id, ex.user_note);
        }
      }
    }

    const payload = {
      category_list: categoryList,
      reference_corrections: referenceCorrections,
      /**
       * days 的顺序由上游 BatchProcessor 保证为“最近日期优先”。
       * 这里不再重复排序，避免提示词构造层偷改消费语义。
       */
      days: dayBatches.map((batch) => ({
        date: format(batch.date, 'yyyy-MM-dd'),
        weekday: format(batch.date, 'EEEE'),
        transactions: batch.transactions.map((tx) => ({
          id: tx.id,
          time: tx.time,
          amount: tx.amount,
          currency: 'CNY',
          direction: tx.direction,
          counterparty: tx.counterparty,
          description: tx.product || tx.remark,
          sourceType: tx.sourceType,
          raw_category: tx.rawClass
        }))
      }))
    };

    const userContent = JSON.stringify(payload, null, 2);

    return {
      messages: [
        {
          role: 'system',
          content: generateSystemPrompt({
            language,
            userContext: selfDescription,
            memory: memoryText
          })
        },
        {
          role: 'user',
          content: userContent
        }
      ],
      injectedExampleUserNotes
    };
  }
}
