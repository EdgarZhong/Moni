import { CategoryPlugin } from './CategoryPlugin';
import type { Proposal } from './types';
import type { FullTransactionRecord } from '@shared/types/metadata';
import type { TransactionBase } from '@shared/types/metadata';

export class UserMetaPlugin extends CategoryPlugin {
  name = 'UserMetaPlugin';
  version = '1.0.0';

  async analyze(transaction: TransactionBase): Promise<Proposal | null> {
    const tx = transaction as FullTransactionRecord;
    
    // User Input has the highest priority and implicit 1.0 confidence
    if (tx.user_category && tx.user_category.trim() !== '') {
      return this.createProposal(
        'USER',
        tx.user_category,
        tx.user_note || 'User manual input'
      );
    }
    
    return null;
  }
}
