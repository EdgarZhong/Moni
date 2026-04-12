import { ConfigManager } from '@system/config/ConfigManager';
import { ExampleStore } from '../services/ExampleStore';
import { LedgerPreferencesManager } from '../services/LedgerPreferencesManager';
import { SnapshotManager } from '../services/SnapshotManager';
import { LearningSession, type LearningResult } from './LearningSession';

/**
 * 自动学习检查结果。
 * 这一层专门暴露“当前是否应该自动学习”的结构化状态，
 * 让设置页、调试入口、E2E 都可以直接消费，而不是各自重复拼判断逻辑。
 */
export interface AutoLearningStatus {
  ledgerName: string;
  mode: 'delta' | 'full_reconcile';
  pendingCount: number;
  threshold: number;
  autoLearn: boolean;
  shouldTrigger: boolean;
  lastLearnedRevision: number;
  currentRevision: number;
  reason?: string;
}

/**
 * 自动学习执行结果。
 * attempted 表示这次是否真的进入了 LearningSession.run()，
 * 用于区分“检查后跳过”和“已经尝试执行但执行失败”。
 */
export interface AutoLearningEvaluationResult extends AutoLearningStatus {
  attempted: boolean;
  success?: boolean;
  summary?: string;
  error?: string;
  skippedReason?: string;
}

/**
 * 自动学习事件。
 * 用于 UI 在“真实触发”时做轻量提示（例如弹窗/Toast）。
 */
export interface AutoLearningEvent {
  ledgerName: string;
  phase: 'triggered' | 'completed' | 'failed';
  summary?: string;
  error?: string;
}

/**
 * LearningAutomationService - 自动学习协调层
 *
 * 职责：
 * 1. 统一读取 ledgers/{ledger}/ai_prefs.json 中的 learning 配置
 * 2. 基于实例库 delta 与学习基线计算“当前待学习量”
 * 3. 避免多个入口在同一账本上重复并发触发学习
 * 4. 在真正调用 LearningSession 前做最基础的模型配置检查
 */
export class LearningAutomationService {
  /**
   * 记录当前正在自动学习的账本。
   * 自动学习可能被“用户修正分类”“锁定确认”“手记增删”等多条链路同时触发，
   * 这里用最小并发保护避免重复起多个学习会话。
   */
  private static readonly inFlightLedgers = new Set<string>();
  private static readonly listeners = new Set<(event: AutoLearningEvent) => void>();

  /**
   * 订阅自动学习事件。
   */
  public static subscribe(listener: (event: AutoLearningEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private static emit(event: AutoLearningEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.warn('[LearningAutomationService] listener failed:', error);
      }
    }
  }

  /**
   * 计算当前账本的自动学习状态。
   * 这里不触发任何副作用，只负责给调用方一个结构化判断。
   */
  public static async inspect(ledgerName: string): Promise<AutoLearningStatus> {
    const prefs = await LedgerPreferencesManager.getInstance().getLearningPreferences(ledgerName);
    const lastLearnedRevision = await SnapshotManager.getLastLearnedExampleRevision(ledgerName);
    const delta = await ExampleStore.getLearningDelta(ledgerName, lastLearnedRevision);

    /**
     * pendingCount 的口径说明：
     * - 增量模式：看净变更条目数（upserts + deletions）
     * - full_reconcile：change log 不可信，此时只能把当前实例库全量视作待重新审阅的学习窗口
     */
    const pendingCount =
      delta.mode === 'full_reconcile'
        ? (delta.allEntries?.length ?? 0)
        : delta.upserts.length + delta.deletions.length;

    return {
      ledgerName,
      mode: delta.mode === 'incremental' ? 'delta' : 'full_reconcile',
      pendingCount,
      threshold: prefs.threshold,
      autoLearn: prefs.autoLearn,
      shouldTrigger: prefs.autoLearn && LearningSession.shouldTrigger(pendingCount, prefs),
      lastLearnedRevision,
      currentRevision: delta.currentRevision,
      reason: delta.reason,
    };
  }

  /**
   * 自动评估并在需要时触发学习。
   * 这里不会抛异常给上层调用方，避免把用户修正/手记写入主流程一起打断。
   */
  public static async evaluateAndRun(
    ledgerName: string,
    categories: Record<string, string>
  ): Promise<AutoLearningEvaluationResult> {
    const status = await this.inspect(ledgerName);

    if (!status.autoLearn) {
      return {
        ...status,
        attempted: false,
        skippedReason: 'auto_learn_disabled',
      };
    }

    if (!status.shouldTrigger) {
      return {
        ...status,
        attempted: false,
        skippedReason: 'threshold_not_reached',
      };
    }

    if (this.inFlightLedgers.has(ledgerName)) {
      return {
        ...status,
        attempted: false,
        skippedReason: 'learning_already_in_flight',
      };
    }

    /**
     * 自动学习属于后台动作。
     * 若模型尚未配置，直接跳过，避免每次修正分类都制造噪音报错。
     */
    const llmConfig = await ConfigManager.getInstance().getActiveModelConfig();
    if (!llmConfig.apiKey || !llmConfig.baseUrl || !llmConfig.model) {
      return {
        ...status,
        attempted: false,
        skippedReason: 'llm_not_configured',
      };
    }

    this.inFlightLedgers.add(ledgerName);
    try {
      this.emit({
        ledgerName,
        phase: 'triggered',
      });

      const result: LearningResult = await LearningSession.run(ledgerName, categories);
      this.emit({
        ledgerName,
        phase: result.success ? 'completed' : 'failed',
        summary: result.summary,
        error: result.error,
      });
      return {
        ...status,
        attempted: true,
        success: result.success,
        summary: result.summary,
        error: result.error,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit({
        ledgerName,
        phase: 'failed',
        error: message,
      });
      return {
        ...status,
        attempted: true,
        success: false,
        summary: '自动学习执行失败',
        error: message,
      };
    } finally {
      this.inFlightLedgers.delete(ledgerName);
    }
  }
}
