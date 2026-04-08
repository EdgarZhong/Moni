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
import { SnapshotManager } from '../services/SnapshotManager';
import { ExampleStore } from '../services/ExampleStore';
import { LLMClient } from '../llm/LLMClient';
import { ConfigManager } from '@system/config/ConfigManager';
import type { ExampleEntry } from '../services/ExampleStore';

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

export class LearningSession {
  private static readonly DEFAULT_CONFIG: LearningConfig = {
    threshold: 5,
    autoLearn: true
  };

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

    return `You are a pattern analyst for Moni, a personal finance app. Your task is to analyze the user's classification corrections and extract generalizable rules and preferences.

### Your Role
The user has been correcting the AI classifier's mistakes. Each correction record shows what the AI predicted, what the user changed it to, and optionally why. Your job is to identify patterns in these corrections and update the memory file accordingly.

### Category System
The following categories are currently defined:
${JSON.stringify(categories, null, 2)}

Only reference categories that exist in this list. If a correction references a category not in this list, it may be outdated — do not create rules for non-existent categories.
${memorySection}
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
4. If corrections contradict an existing memory entry, MODIFY or DELETE it.
5. Focus on generalizable patterns, not individual transactions. "杨国福 at 45 yuan was meal" is a correction; "Fast food restaurants under 70 yuan during meal hours → meal" is a pattern.
6. If the corrections don't reveal any new pattern, return an empty operations array: \`{"operations": []}\`
7. Write entries in the same language the user uses (typically Chinese).
`;
  }

  /**
   * 构建 User Message
   */
  private static buildLearningUserMessage(corrections: ExampleEntry[]): string {
    // 简化 corrections，只保留必要字段
    const simplified = corrections.map(ex => ({
      counterparty: ex.counterparty,
      description: ex.description,
      amount: ex.amount,
      time: ex.time,
      category: ex.category,
      ai_reason: ex.ai_reason,
      user_reason: ex.user_reason
    }));

    return `以下是用户最近的分类修正记录：

${JSON.stringify(simplified, null, 2)}

请分析这些修正，输出你建议的记忆更新操作。`;
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
      // 1. 加载实例库（用户修正记录）
      const examples = await ExampleStore.load(ledgerName);

      // 如果没有修正记录，跳过学习
      if (examples.length === 0) {
        console.log('[LearningSession] No corrections to learn from');
        return {
          success: true,
          operations: [],
          summary: '无修正记录，无需学习'
        };
      }

      // 2. 加载当前记忆
      const currentMemory = await MemoryManager.load(ledgerName);

      // 3. 构建 Prompt
      const systemPrompt = this.generateLearningSystemPrompt(categories, currentMemory);
      const userMessage = this.buildLearningUserMessage(examples);

      // 4. 调用 LLM
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

      // 5. 解析操作指令
      let operations: MemoryOperation[] = [];
      try {
        // 尝试提取 JSON（处理可能的 markdown 代码块）
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

      // 6. 执行操作（v6：自动创建快照）
      if (operations.length > 0) {
        console.log(`[LearningSession] Executing ${operations.length} operations...`);
        const result = await MemoryManager.applyOperations(
          ledgerName,
          operations,
          'ai_learn',
          `学习会话：基于 ${examples.length} 条修正记录`
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

      // 7. 获取当前快照 ID（v6：由 applyOperations 自动创建）
      const snapshotId = await SnapshotManager.getCurrentId(ledgerName);

      // 8. 生成摘要
      const summary = this.generateSummary(operations);
      console.log(`[LearningSession] Complete: ${summary}`);

      return {
        success: true,
        operations,
        summary,
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
  private static generateSummary(operations: MemoryOperation[]): string {
    if (operations.length === 0) {
      return '无更新';
    }

    const adds = operations.filter(o => o.type === 'ADD').length;
    const modifies = operations.filter(o => o.type === 'MODIFY').length;
    const deletes = operations.filter(o => o.type === 'DELETE').length;

    const parts: string[] = [];
    if (adds > 0) parts.push(`新增 ${adds} 条`);
    if (modifies > 0) parts.push(`修改 ${modifies} 条`);
    if (deletes > 0) parts.push(`删除 ${deletes} 条`);

    return parts.join('，');
  }

  /**
   * 检查是否应该触发学习（累计阈值）
   * @param pendingCount 当前待学习计数
   * @param config 学习配置
   */
  public static shouldTrigger(pendingCount: number, config?: Partial<LearningConfig>): boolean {
    const threshold = config?.threshold ?? this.DEFAULT_CONFIG.threshold;
    return pendingCount >= threshold;
  }

  /**
   * 获取默认配置
   */
  public static getDefaultConfig(): LearningConfig {
    return { ...this.DEFAULT_CONFIG };
  }
}
