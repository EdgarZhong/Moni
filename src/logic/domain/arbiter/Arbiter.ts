import type { ICategoryPlugin, Proposal, ProposalSource } from '../plugin/types';
import type { FullTransactionRecord, TransactionMeta } from '@shared/types/metadata';

interface ProposalCache {
  [transactionId: string]: {
    USER?: Proposal;
    RULE_ENGINE?: Proposal; // Reserved for future use
    AI_AGENT?: Proposal;
  }
}

export interface FinalDecision {
  category: string;
  source: ProposalSource | 'FALLBACK';
  reasoning?: string;
}

export interface PersistencePatch {
  id: string;
  updates: Partial<FullTransactionRecord>;
}

/**
 * 实例库写入请求
 * 用于通知外部将交易记录写入实例库
 */
export interface ExampleStoreRequest {
  txId: string;
  /**
   * 是否为修正（AI 分错用户纠正）
   * true: AI 分错，用户修正 - 丢弃 ai_reasoning
   * false: AI 分对，用户确认 - 保留 ai_reasoning
   */
  isCorrection: boolean;
}

export class Arbiter {
  private plugins: ICategoryPlugin[] = [];
  private proposalCache: ProposalCache = {};

  // Callback for persistence layer
  private onPatchGenerated?: (patch: PersistencePatch) => void;

  /**
   * 实例库写入回调
   * 当需要写入实例库时触发，由 LedgerService 监听并执行实际写入
   */
  private onExampleStoreWrite?: (request: ExampleStoreRequest) => void;

  constructor() {}

  public setPatchCallback(callback: (patch: PersistencePatch) => void) {
    this.onPatchGenerated = callback;
  }

  /**
   * 设置实例库写入回调
   * @param callback 回调函数，接收 ExampleStoreRequest
   */
  public setExampleStoreCallback(callback: (request: ExampleStoreRequest) => void) {
    this.onExampleStoreWrite = callback;
  }

  public registerPlugin(plugin: ICategoryPlugin) {
    const index = this.plugins.findIndex(p => p.name === plugin.name);
    if (index !== -1) {
      this.plugins[index] = plugin;
    } else {
      this.plugins.push(plugin);
    }
  }

  public clearProposals(txIds: string[]): void {
    txIds.forEach(txId => {
      if (this.proposalCache[txId]) {
        delete this.proposalCache[txId];
      }
    });
  }

  public clearAllProposals(): void {
    this.proposalCache = {};
  }

  /**
   * Hydrate cache from loaded metadata (No persistence trigger)
   */
  public hydrate(txId: string, meta: TransactionMeta) {
    if (!this.proposalCache[txId]) {
      this.proposalCache[txId] = {};
    }
    const entry = this.proposalCache[txId];

    // Use meta.updated_at as timestamp if available, else 0
    const timestamp = meta.updated_at ? new Date(meta.updated_at).getTime() : 0;

    if (meta.user_category && meta.user_category.trim() !== '') {
      entry.USER = {
        source: 'USER',
        category: meta.user_category,
        reasoning: meta.user_note || '',
        timestamp: timestamp
      };
    }

    if (meta.ai_category && meta.ai_category.trim() !== '') {
      entry.AI_AGENT = {
        source: 'AI_AGENT',
        category: meta.ai_category,
        reasoning: meta.ai_reasoning || '',
        timestamp: timestamp
      };
    }
  }

  /**
   * Ingest a proposal from any source
   */
  public ingest(txId: string, proposal: Proposal, skipPersistence = false) {
    if (!this.proposalCache[txId]) {
      this.proposalCache[txId] = {};
    }
    const entry = this.proposalCache[txId];

    // Timestamp Guard (Design 5.3.C)
    // Reject outdated proposals from the same source
    const existing = entry[proposal.source];
    if (existing && proposal.timestamp < existing.timestamp) {
      console.warn(`[Arbiter] Timestamp Guard: Rejected outdated proposal from ${proposal.source}. Existing: ${existing.timestamp}, New: ${proposal.timestamp}`);
      return;
    }

    // Update Cache
    entry[proposal.source] = proposal;

    // Trigger Persistence if needed
    if (!skipPersistence) {
      this.dispatchPersistence(txId, proposal);
    }
  }

  /**
   * Directly toggle verification status without affecting category
   */
  public toggleVerification(txId: string, isVerified: boolean) {
    if (!this.onPatchGenerated) return;

    const updates: Partial<FullTransactionRecord> = {
      is_verified: isVerified,
      updated_at: new Date().toISOString(),
      ...(isVerified ? {} : { category: this.decide(txId).category })
    };

    this.onPatchGenerated({ id: txId, updates });

    // 用户锁定确认时，写入实例库（作为高置信参考）
    // 不是修正（用户只是确认 AI 分类正确）
    if (isVerified && this.onExampleStoreWrite) {
      this.onExampleStoreWrite({ txId, isCorrection: false });
    }
  }

  public updateUserNote(txId: string, userNote: string) {
    // 仅更新用户备注，不改动用户分类与锁定状态，避免误写 user_category
    if (!this.onPatchGenerated) return;

    const cache = this.proposalCache[txId];
    if (cache?.USER) {
      // 同步缓存中的用户提案备注，确保仲裁结果的 reasoning 与持久化一致
      cache.USER = {
        ...cache.USER,
        reasoning: userNote
      };
    }

    const updates: Partial<FullTransactionRecord> = {
      // 只写入 user_note 与 updated_at，保持分类字段不变
      user_note: userNote,
      updated_at: new Date().toISOString()
    };

    this.onPatchGenerated({ id: txId, updates });
  }

  public updateRemark(txId: string, remark: string) {
    if (!this.onPatchGenerated) return;

    const updates: Partial<FullTransactionRecord> = {
      remark,
      updated_at: new Date().toISOString()
    };

    this.onPatchGenerated({ id: txId, updates });
  }

  private dispatchPersistence(txId: string, proposal: Proposal) {
    if (!this.onPatchGenerated) return;

    let updates: Partial<FullTransactionRecord> = {};

    // Dispatch Logic (Design 5.3.C)
    if (proposal.source === 'USER') {
      updates = {
        user_category: proposal.category,
        user_note: proposal.reasoning,
        updated_at: new Date().toISOString()
        // FIX: Do NOT auto-lock on edit. is_verified is handled separately.
      };

      // 触发实例库写入 - 用户修正分类
      // 判断是否为修正（AI 分错用户纠正）
      const cache = this.proposalCache[txId];
      const aiProposal = cache?.AI_AGENT;
      const isCorrection = aiProposal !== undefined && aiProposal.category !== proposal.category;

      if (this.onExampleStoreWrite) {
        this.onExampleStoreWrite({ txId, isCorrection });
      }
    } else if (proposal.source === 'AI_AGENT') {
      updates = {
        ai_category: proposal.category,
        ai_reasoning: proposal.reasoning,
        updated_at: new Date().toISOString()
      };
    } else if (proposal.source === 'RULE_ENGINE') {
        // TODO: Define Rule Engine persistence strategy
        // For now, we do NOT persist rule engine results to file,
        // they are runtime only or handled differently.
        return;
    }

    if (Object.keys(updates).length > 0) {
      // Calculate final decision to keep category in sync (View Model)
      const finalDecision = this.decide(txId);
      (updates as Partial<FullTransactionRecord> & { category?: string }).category = finalDecision.category;

      this.onPatchGenerated({ id: txId, updates });
    }
  }

  /**
   * Core Decision Logic
   * Purely based on ProposalCache
   * Priority: USER > RULE_ENGINE > AI_AGENT
   */
  public decide(txId: string): FinalDecision {
    const cache = this.proposalCache[txId];

    // Fallback if no cache (should be handled by hydration)
    if (!cache) {
      return {
        category: 'uncategorized',
        source: 'FALLBACK',
        reasoning: 'No proposals found'
      };
    }

    // Priority 1: USER
    if (cache.USER && cache.USER.category) {
      return {
        category: cache.USER.category,
        source: 'USER',
        reasoning: cache.USER.reasoning
      };
    }

    // Priority 2: RULE_ENGINE (Design 4.6.A)
    if (cache.RULE_ENGINE && cache.RULE_ENGINE.category) {
      return {
        category: cache.RULE_ENGINE.category,
        source: 'RULE_ENGINE',
        reasoning: cache.RULE_ENGINE.reasoning
      };
    }

    // Priority 3: AI_AGENT
    if (cache.AI_AGENT && cache.AI_AGENT.category) {
      return {
        category: cache.AI_AGENT.category,
        source: 'AI_AGENT',
        reasoning: cache.AI_AGENT.reasoning
      };
    }

    return {
      category: 'uncategorized',
      source: 'FALLBACK',
      reasoning: 'No valid proposals'
    };
  }
  
  /**
   * Legacy method support / Plugin Runner
   * Can be used to run plugins on new data
   */
  public async runPlugins(transactions: FullTransactionRecord[]) {
      for (const tx of transactions) {
          for (const plugin of this.plugins) {
              try {
                  const proposal = await plugin.analyze(tx);
                  if (proposal) {
                      this.ingest(tx.id, proposal, true); // Skip persistence for initial run? 
                      // Depends. If it's "New Data" and AI runs, we WANT persistence.
                      // If it's "Load", we use hydrate.
                      // So runPlugins implies "Active Analysis", so persistence should be ON?
                      // But wait, LocalAIMetaPlugin just reads file.
                      // If we use LocalAIMetaPlugin, we should skip persistence because it's already in file.
                      // But if we add a REAL AI plugin, we want persistence.
                      // TODO: Distinguish plugin types or let caller decide.
                      // For now, let's assume this is mostly for "Initial Analysis" or "Manual Trigger".
                      // I'll leave it simple for now.
                  }
              } catch (e) { console.error(e); }
          }
      }
  }

  // Debug stats
  public getStats() {
    return {
      cacheSize: Object.keys(this.proposalCache).length,
      pluginCount: this.plugins.length
    };
  }
}

export const globalArbiter = new Arbiter();
