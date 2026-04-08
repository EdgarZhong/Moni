import { ConfigManager } from '@system/config/ConfigManager';
import { LLMClient } from '../llm/LLMClient';
import { ExampleStore } from '../services/ExampleStore';
import { LedgerPreferencesManager } from '../services/LedgerPreferencesManager';
import { MemoryManager } from '../services/MemoryManager';
import { SnapshotManager } from '../services/SnapshotManager';
import { type LearningCorrection, LearningSession } from './LearningSession';

/**
 * 收编会话结果。
 * 与学习会话类似，返回是否成功、摘要、压缩前后条目数，便于 UI 和调试入口消费。
 */
export interface CompressionResult {
  success: boolean;
  summary: string;
  beforeCount: number;
  afterCount: number;
  snapshotId?: string;
  error?: string;
}

/**
 * 收编上下文。
 * 这一层单独暴露出来，便于浏览器调试入口和 E2E 直接验证，
 * 不必通过真正调用 LLM 才知道当前构造出来的上下文是否符合规格。
 */
export interface CompressionContext {
  categories: Record<string, string>;
  currentMemory: string[];
  currentExamples: LearningCorrection[];
  currentCount: number;
  targetCount: number;
  threshold: number;
  ratio: number;
}

/**
 * CompressionSession - AI 记忆收编会话
 *
 * 职责：
 * 1. 读取当前记忆、账本分类体系、实例库全量
 * 2. 基于 ledger_prefs 计算收编阈值与目标上限
 * 3. 调用 LLM 产出压缩后的完整编号列表
 * 4. 校验结果不超过 targetCount，并写入 ai_compress 快照
 */
export class CompressionSession {
  /**
   * 根据当前条目数和账本行为配置计算目标上限。
   * 这里按文档冻结口径：floor(currentCount * ratio)。
   * 同时做最小保护，避免出现 0 条上限。
   */
  public static computeTargetCount(currentCount: number, ratio: number): number {
    return Math.max(1, Math.floor(currentCount * ratio));
  }

  /**
   * 判断当前是否应触发收编。
   */
  public static shouldTrigger(currentCount: number, threshold: number): boolean {
    return currentCount > threshold;
  }

  /**
   * 构造收编上下文。
   * force = true 时，即便未达到阈值也允许构造，便于手动调试入口直接触发。
   */
  public static async buildContext(
    ledgerName: string,
    categories: Record<string, string>,
    options?: { force?: boolean }
  ): Promise<CompressionContext> {
    const prefs = await LedgerPreferencesManager.getInstance().getCompressionPreferences(ledgerName);
    const currentMemory = await MemoryManager.load(ledgerName);
    const currentExamples = (await ExampleStore.load(ledgerName)).map((entry) =>
      LearningSession.buildLearningPayload({
        mode: 'full_reconcile',
        lastLearnedRevision: 0,
        currentRevision: 0,
        upserts: [],
        deletions: [],
        allEntries: [entry],
      }).current_examples?.[0]
    ).filter((entry): entry is LearningCorrection => entry !== undefined);

    const currentCount = currentMemory.length;
    const targetCount = this.computeTargetCount(currentCount, prefs.ratio);

    if (!options?.force && !this.shouldTrigger(currentCount, prefs.threshold)) {
      throw new Error(`Compression threshold not reached: ${currentCount} <= ${prefs.threshold}`);
    }

    return {
      categories,
      currentMemory,
      currentExamples,
      currentCount,
      targetCount,
      threshold: prefs.threshold,
      ratio: prefs.ratio,
    };
  }

  /**
   * 生成收编 System Prompt。
   * 文案直接按 v7 文档收敛，避免实现与规格漂移。
   */
  public static generateSystemPrompt(context: CompressionContext): string {
    return `You are a memory compressor for Moni, a personal finance app. Your task is to compress a numbered list of classification preferences while preserving all essential information.

### Category System
The following categories are currently defined:
${JSON.stringify(context.categories, null, 2)}

### Rules
1. The current memory has ${context.currentCount} entries. Compress it to no more than ${context.targetCount} entries.
2. Merge semantically similar entries into one. For example, multiple merchant-specific rules for the same pattern can be combined.
3. Preserve ALL key information — thresholds, exceptions, special cases. Do not silently drop rules.
4. You will also receive the FULL current example store. Use it as the ground truth context to avoid dropping still-valid patterns or preserving outdated ones.
5. If an entry references a category that does NOT exist in the category system above, it is outdated. Remove it and do not preserve its content.
6. If an entry is a "tag deleted" marker (e.g., "标签 xxx 已从分类体系中移除..."), check whether that tag now exists again in the category system. If it does, remove only the marker but KEEP any related rules. If it does not, remove both the marker and all related rules.
7. Each output entry must be a single, self-contained information point.
8. Write entries in the same language as the input (typically Chinese).

### Output Format
Output ONLY the compressed numbered list as plain text, one entry per line, with sequential numbers. No JSON, no markdown fences, no commentary.`;
  }

  /**
   * 生成收编 User Message。
   * 当前实例库必须以全量 rich schema 注入，而不是省略或仅给增量。
   */
  public static buildUserMessage(context: CompressionContext): string {
    return `以下是当前的分类记忆，请进行压缩：

${context.currentMemory.map((line, index) => `${index + 1}. ${line}`).join('\n')}

以下是当前实例库全量（必须视为仍然有效的现行上下文）：

${JSON.stringify(context.currentExamples, null, 2)}`;
  }

  /**
   * 解析并校验模型返回的纯文本编号列表。
   * 只有在：
   * 1. 能解析出至少 1 条非空内容
   * 2. 条目数不超过 targetCount
   * 3. 每条内容都是有效文本
   * 的情况下，才允许写入 ai_compress 快照。
   */
  public static parseOutput(raw: string, targetCount: number): string[] {
    const normalized = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const match = line.match(/^\d+[.)]\s*(.+)$/);
        return match ? match[1].trim() : line;
      })
      .filter((line) => line.length > 0);

    if (normalized.length === 0) {
      throw new Error('Compression output is empty');
    }

    if (normalized.length > targetCount) {
      throw new Error(`Compression output exceeds target count: ${normalized.length} > ${targetCount}`);
    }

    return normalized;
  }

  /**
   * 执行收编会话。
   * 成功后写入 ai_compress 快照；失败时保持当前快照不变。
   */
  public static async run(
    ledgerName: string,
    categories: Record<string, string>,
    options?: { force?: boolean }
  ): Promise<CompressionResult> {
    try {
      const context = await this.buildContext(ledgerName, categories, options);
      const configManager = ConfigManager.getInstance();
      const llmConfig = await configManager.getActiveModelConfig();
      const client = new LLMClient({
        apiKey: llmConfig.apiKey,
        baseUrl: llmConfig.baseUrl,
        model: llmConfig.model,
      });

      const response = await client.chat(
        [
          { role: 'system', content: this.generateSystemPrompt(context) },
          { role: 'user', content: this.buildUserMessage(context) },
        ],
        { responseFormat: 'text' }
      );
      const compressed = this.parseOutput(response, context.targetCount);
      await MemoryManager.save(
        ledgerName,
        compressed,
        'ai_compress',
        `收编：${context.currentCount}条 → ${compressed.length}条`
      );

      return {
        success: true,
        summary: `收编：${context.currentCount}条 → ${compressed.length}条`,
        beforeCount: context.currentCount,
        afterCount: compressed.length,
        snapshotId: await SnapshotManager.getCurrentId(ledgerName),
      };
    } catch (error) {
      return {
        success: false,
        summary: '收编失败',
        beforeCount: 0,
        afterCount: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
