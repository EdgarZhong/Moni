import { CategoryPlugin } from './CategoryPlugin';
import type { Proposal } from './types';
import type { FullTransactionRecord } from '@shared/types/metadata';
import type { TransactionBase } from '@shared/types/metadata';

/**
 * 本地 AI 元数据读取插件 (Local AI Metadata Reader)
 * 这是一个临时/过渡插件。
 * 逻辑：不直接调用 LLM，而是读取本地 JSON 中已存在的 `ai_category` 字段。
 * 场景：适用于通过外部脚本批量清洗数据后，让 App 感知并应用这些 AI 分类结果。
 */
export class LocalAIMetaPlugin extends CategoryPlugin {
  name = 'LocalAIMetaPlugin';
  version = '0.1.0';

  // Content Hash Check (Design 5.4.B)
  // Store hash to prevent reprocessing same content
  private processedHashes = new Set<string>();

  // Helper to generate hash
  private generateHash(tx: FullTransactionRecord): string {
    return `${tx.id}-${tx.ai_category}-${tx.ai_reasoning}`;
  }

  async analyze(transaction: TransactionBase): Promise<Proposal | null> {
    const tx = transaction as FullTransactionRecord;
    
    // 1. Validate Data
    if (!tx.ai_category || tx.ai_category.trim() === '') {
      return null;
    }

    // 2. Hash Check (Prevent False Updates)
    const currentHash = this.generateHash(tx);
    if (this.processedHashes.has(currentHash)) {
      return null; // Skip if already processed
    }

    // 3. Mark as processed
    this.processedHashes.add(currentHash);

    // 4. Create Proposal with Source Timestamp (from file mtime if available, else now)
    // Note: LocalAIMetaPlugin reads from JSON loaded in memory. 
    // The `updated_at` field in JSON is the best proxy for "when this AI result was generated".
    // If invalid, fallback to Date.now() but this might lose race against User.
    const timestamp = tx.updated_at ? new Date(tx.updated_at).getTime() : Date.now();

    return {
        source: 'AI_AGENT',
        category: tx.ai_category,
        reasoning: tx.ai_reasoning || 'AI prediction from metadata (Local)',
        timestamp: timestamp,
        txId: tx.id
    };
  }
}
