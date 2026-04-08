import { generateSystemPrompt } from './SystemPrompt';
import { LedgerLoader } from './LedgerLoader';
import { ConfigManager } from '@system/config/ConfigManager';
import { ExampleStore } from '../../services/ExampleStore';
import { MemoryManager } from '../../services/MemoryManager';
import type { ChatMessage } from '../types';
import type { TransactionBase } from '@shared/types/metadata';
import { format } from 'date-fns';

export class PromptBuilder {
  public static async build(
    transactions: TransactionBase[],
    date: Date,
    ledgerName: string = 'default',
    language: string = 'Chinese'
  ): Promise<ChatMessage[]> {
    const categoryList = await LedgerLoader.loadCategories(ledgerName);

    const configManager = ConfigManager.getInstance();
    const selfDescription = await configManager.getUserContext();

    const memory = await MemoryManager.load(ledgerName);
    const memoryText = memory.length > 0 ? memory.join('\n') : undefined;

    const pendingTxs = transactions.map(tx => ({
      id: tx.id,
      counterparty: tx.counterparty,
      description: tx.product || tx.remark || '',
      amount: tx.amount,
      time: tx.time.split(' ')[1] || tx.time
    }));
    const referenceCorrections = await ExampleStore.retrieveRelevant(ledgerName, pendingTxs);

    const txData = transactions.map(tx => ({
      id: tx.id,
      time: tx.time,
      amount: tx.amount,
      currency: 'CNY',
      direction: tx.direction,
      counterparty: tx.counterparty,
      description: tx.product || tx.remark,
      source: tx.sourceType,
      raw_category: tx.rawClass
    }));

    const payload = {
      category_list: categoryList,
      reference_corrections: referenceCorrections,
      days: [
        {
          date: format(date, 'yyyy-MM-dd'),
          weekday: format(date, 'EEEE'),
          transactions: txData
        }
      ]
    };

    const userContent = JSON.stringify(payload, null, 2);

    return [
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
    ];
  }
}
