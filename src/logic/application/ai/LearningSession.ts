/**
 * LearningSession - 学习会话模块
 *
 * 职责：
 * 1. 学习会话编排：触发判断 → Prompt 构建 → 结果执行
 * 2. 学习 Prompt 生成（基于 SystemPrompt.ts）
 * 3. 调用 LLM 获取操作指令（ADD / MODIFY / DELETE）
 * 4. 执行操作：调用 MemoryManager 增量更新记忆文件
 * 5. 学习完成后的通知（轻量 Toast）
 *
 * 触发时机：
 * - 切换账本时（如果标记"待学习"）
 * - App 回到前台时
 * - 用户手动点击"立即学习"
 */

import { MemoryManager, type MemoryOperation } from '../services/MemoryManager';
import { LedgerPreferencesManager } from '../services/LedgerPreferencesManager';
import { SnapshotManager } from '../services/SnapshotManager';
import { ExampleStore } from '../services/ExampleStore';
import { LLMClient } from '../llm/LLMClient';
import { ConfigManager } from '@system/config/ConfigManager';
import type { ExampleEntry, LearningExampleDelta } from '../services/ExampleStore';
import { CompressionSession } from './CompressionSession';

/**
 * 学习会话配置
 */
export interface LearningConfig {
  /** 学习阈值：累计多少条修正后触发学习 */
  threshold: number;
  /** 是否启用自动学习 */
  autoLearn: boolean;
}

/**
 * 学习会话结果
 */
export interface LearningResult {
  success: boolean;
  operations: MemoryOperation[];
  summary: string;
  error?: string;
  /** 创建的快照 ID（学习结果对应的当前快照） */
  snapshotId?: string;
}

/**
 * 学习状态（存储在账本元数据中）
 */
export interface LearningStatus {
  /** 累计修正计数 */
  pendingCount: number;
  /** 是否标记为"待学习" */
  isPending: boolean;
  /** 上次学习时间 */
  lastLearnedAt: string | null;
}

/**
 * 学习阶段发给模型的 rich schema。
 * 这套结构与 v7 文档保持一致：
 * - 使用 from_revision / to_revision
 * - full_reconcile 时使用 current_examples
 * - 保留完整交易上下文，但不带 created_at
 */
export interface LearningCorrection {
  id: string;
  time: string;
  sourceType: ExampleEntry['sourceType'];
  rawClass: string;
  counterparty: string;
  product: string;
  amount: number;
  direction: ExampleEntry['direction'];
  paymentMethod: string;
  transactionStatus: ExampleEntry['transactionStatus'];
  remark: string;
  category: string;
  ai_category: string;
  ai_reasoning: string;
  is_verified: boolean;
  user_note: string;
}

export interface LearningDeltaPayload {
  mode: 'delta' | 'full_reconcile';
  from_revision: number;
  to_revision: number;
  upserts: LearningCorrection[];
  deletions: LearningCorrection[];
  current_examples?: LearningCorrection[];
}

export class LearningSession {
  /**
   * 生成学习 Prompt 的 System 部分
   */
  private static generateLearningSystemPrompt(
    categories: Record<string, string>,
    currentMemory: string[]
  ): string {
    const memorySection = currentMemory.length > 0
      ? `\n### Current Memory (Numbered List)\n${currentMemory.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n`
      : '\n### Current Memory\n(Empty — no learned preferences yet.)\n';

    return `You are a pattern analyst for Moni, a personal finance app. Your task is to analyze the example-store delta and update the user's learned memory with stable, generalizable rules.

### Your Role
The example store is the authoritative set of user-confirmed classification signals.
- B examples: AI predicted the wrong category. \`ai_category\` and \`ai_reasoning\` describe the wrong judgment, while \`category\` is the corrected answer.
- A / C / D examples: \`category\` is the user-confirmed answer directly.
- D examples come from manual entries. They often have empty \`counterparty\`, so rely more on \`product\`, amount, and context.

### Category System
The following categories are currently defined:
${JSON.stringify(categories, null, 2)}

Only reference categories that exist in this list. If a correction references a category not in this list, it may be outdated — do not create rules for non-existent categories.
${memorySection}
### Learning Window
The user message provides either:
- \`mode: "delta"\`: only net changes since the last successful learning baseline
- \`mode: "full_reconcile"\`: the change log cannot be trusted, so \`current_examples\` is the full current truth and should be treated as authoritative

When \`mode\` is \`full_reconcile\`, do not assume any removed pattern is still valid just because it exists in current memory.

### Output Format
You MUST return a strictly valid JSON object. No markdown formatting, no introductory text.

\`\`\`json
{
  "operations": [
    { "type": "ADD", "content": "..." },
    { "type": "MODIFY", "index": 3, "content": "..." },
    { "type": "DELETE", "index": 5 }
  ]
}
\`\`\`

### Operation Types
- **ADD**: Append a new insight. Provide \`content\` (a single information point in natural language).
- **MODIFY**: Update an existing entry. Provide \`index\` (the line number in the current memory) and \`content\` (the replacement text).
- **DELETE**: Remove an entry that is no longer accurate or has been superseded. Provide \`index\` (the line number).

### Rules
1. Each memory entry must be a single, self-contained information point. One entry = one insight.
2. Do not duplicate information already present in the current memory.
3. Prefer MODIFY over DELETE+ADD when updating an existing rule (e.g., changing a threshold).
4. If newer examples contradict an existing memory entry, MODIFY or DELETE it.
5. Focus on generalizable patterns, not individual transactions. "杨国福 at 45 yuan was meal" is a correction; "Fast food restaurants under 70 yuan during meal hours → meal" is a pattern.
6. B examples are the strongest signal because they expose both the wrong path and the corrected answer.
7. If the examples do not reveal any new or changed pattern, return an empty operations array: \`{"operations": []}\`
8. Write entries in the same language the user uses (typically Chinese).
`;
  }

  /**
   * 构建 User Message
   */
  private static buildLearningUserMessage(delta: LearningExampleDelta): string {
    const payload = this.buildLearningPayload(delta);

    return `以下是本次学习窗口的实例库数据：

${JSON.stringify(payload, null, 2)}

请基于这些样本变更输出记忆更新操作。`;
  }

  /**
   * 统一把内部 ExampleEntry 转成学习阶段 rich schema。
   * created_at 只属于存储层稳定性细节，不进入学习 Prompt。
   */
  private static simplifyExample(example: ExampleEntry): LearningCorrection {
    return {
      id: example.id,
      time: example.time,
      sourceType: example.sourceType,
      rawClass: example.rawClass,
      counterparty: example.counterparty,
      product: example.product,
      amount: example.amount,
      direction: example.direction,
      paymentMethod: example.paymentMethod,
      transactionStatus: example.transactionStatus,
      remark: example.remark,
      category: example.category,
      ai_category: example.ai_category,
      ai_reasoning: example.ai_reasoning,
      is_verified: example.is_verified,
      user_note: example.user_note
    };
  }

  /**
   * 供运行时和浏览器调试入口共用的学习 payload 构造器。
   * 这样 E2E 可以直接断言 rich schema，而不是只通过字符串猜测 Prompt 内容。
   */
  public static buildLearningPayload(delta: LearningExampleDelta): LearningDeltaPayload {
    return {
      mode: delta.mode === 'incremental' ? 'delta' : 'full_reconcile',
      from_revision: delta.lastLearnedRevision,
      to_revision: delta.currentRevision,
      upserts: delta.upserts.map(example => this.simplifyExample(example)),
      deletions: delta.deletions.map(example => this.simplifyExample(example)),
      current_examples:
        delta.mode === 'full_reconcile'
          ? (delta.allEntries ?? []).map(example => this.simplifyExample(example))
          : undefined
    };
  }

  /**
   * 执行学习会话
   *
   * @param ledgerName 账本名称
   * @param categories 当前分类体系（用于 Prompt）
   * @returns 学习结果
   */
  public static async run(
    ledgerName: string,
    categories: Record<string, string>
  ): Promise<LearningResult> {
    console.log(`[LearningSession] Starting learning for ${ledgerName}...`);

    try {
      const baselineRevision = await SnapshotManager.getLastLearnedExampleRevision(ledgerName);
      const delta = await ExampleStore.getLearningDelta(ledgerName, baselineRevision);

      if (delta.currentRevision === 0 && (delta.allEntries?.length ?? 0) === 0 && delta.upserts.length === 0) {
        console.log('[LearningSession] No corrections to learn from');
        return {
          success: true,
          operations: [],
          summary: '无修正记录，无需学习'
        };
      }

      const currentMemory = await MemoryManager.load(ledgerName);
      if (delta.mode === 'incremental' && delta.upserts.length === 0 && delta.deletions.length === 0) {
        await SnapshotManager.setLastLearnedExampleRevision(ledgerName, delta.currentRevision);
        return {
          success: true,
          operations: [],
          summary: '无新增实例变更，无需学习',
          snapshotId: await SnapshotManager.getCurrentId(ledgerName) || undefined
        };
      }

      const systemPrompt = this.generateLearningSystemPrompt(categories, currentMemory);
      const userMessage = this.buildLearningUserMessage(delta);

      const configManager = ConfigManager.getInstance();
      const llmConfig = await configManager.getActiveModelConfig();

      const client = new LLMClient({
        apiKey: llmConfig.apiKey,
        baseUrl: llmConfig.baseUrl,
        model: llmConfig.model
      });

      const messages = [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: userMessage }
      ];

      console.log('[LearningSession] Calling LLM...');
      const response = await client.chat(messages);

      let operations: MemoryOperation[] = [];
      try {
        const jsonMatch = response.match(/```json\s*([\s\S]*?)```/) ||
                         response.match(/```\s*([\s\S]*?)```/) ||
                         [null, response];
        const jsonStr = jsonMatch[1] || response;
        const parsed = JSON.parse(jsonStr);
        operations = parsed.operations || [];
      } catch (e) {
        console.error('[LearningSession] Failed to parse LLM response:', e);
        console.error('[LearningSession] Raw response:', response);
        return {
          success: false,
          operations: [],
          summary: '解析 LLM 响应失败',
          error: e instanceof Error ? e.message : String(e)
        };
      }

      if (operations.length > 0) {
        const result = await MemoryManager.applyOperations(
          ledgerName,
          operations,
          'ai_learn',
          delta.mode === 'full_reconcile'
            ? `学习会话：full_reconcile @ revision ${delta.currentRevision}`
            : `学习会话：revision ${delta.lastLearnedRevision} -> ${delta.currentRevision}`
        );

        if (!result.success) {
          return {
            success: false,
            operations,
            summary: '执行操作失败',
            error: result.error
          };
        }
      }

      await SnapshotManager.setLastLearnedExampleRevision(ledgerName, delta.currentRevision);
      const snapshotId = await SnapshotManager.getCurrentId(ledgerName);

      const summary = this.generateSummary(operations, delta);
      console.log(`[LearningSession] Complete: ${summary}`);

      /**
       * 学习成功后，按 v7 口径检查是否需要自动触发收编。
       * 收编失败不应反向污染学习结果，因此这里只是追加日志和摘要，不回滚 ai_learn 快照。
       */
      let finalSummary = summary;
      try {
        const prefs = await LedgerPreferencesManager.getInstance().getCompressionPreferences(ledgerName);
        const currentMemory = await MemoryManager.load(ledgerName);
        if (CompressionSession.shouldTrigger(currentMemory.length, prefs.threshold)) {
          const compression = await CompressionSession.run(ledgerName, categories);
          if (compression.success) {
            finalSummary = `${summary}；${compression.summary}`;
          } else {
            finalSummary = `${summary}；收编失败`;
            console.warn('[LearningSession] Compression failed after learning:', compression.error);
          }
        }
      } catch (compressionError) {
        console.warn('[LearningSession] Failed to evaluate compression after learning:', compressionError);
      }

      return {
        success: true,
        operations,
        summary: finalSummary,
        snapshotId: snapshotId || undefined
      };
    } catch (e) {
      console.error('[LearningSession] Learning failed:', e);
      return {
        success: false,
        operations: [],
        summary: '学习会话失败',
        error: e instanceof Error ? e.message : String(e)
      };
    }
  }

  /**
   * 生成操作摘要
   */
  private static generateSummary(operations: MemoryOperation[], delta: LearningExampleDelta): string {
    if (operations.length === 0) {
      return delta.mode === 'full_reconcile' ? 'full_reconcile，无记忆更新' : '无更新';
    }

    const adds = operations.filter(o => o.type === 'ADD').length;
    const modifies = operations.filter(o => o.type === 'MODIFY').length;
    const deletes = operations.filter(o => o.type === 'DELETE').length;

    const parts: string[] = [];
    if (adds > 0) parts.push(`新增 ${adds} 条`);
    if (modifies > 0) parts.push(`修改 ${modifies} 条`);
    if (deletes > 0) parts.push(`删除 ${deletes} 条`);
    if (delta.mode === 'full_reconcile') parts.push('full_reconcile');

    return parts.join('，');
  }

  /**
   * 检查是否应该触发学习（累计阈值）
   * @param pendingCount 当前待学习计数
   * @param config 学习配置
   */
  public static shouldTrigger(pendingCount: number, config?: Partial<LearningConfig>): boolean {
    if (config?.autoLearn === false) {
      return false;
    }
    const threshold = config?.threshold ?? LedgerPreferencesManager.getInstance().getDefaults().learning.threshold;
    return pendingCount >= threshold;
  }

  /**
   * 获取默认配置
   */
  public static getDefaultConfig(): LearningConfig {
    return { ...LedgerPreferencesManager.getInstance().getDefaults().learning };
  }
}
