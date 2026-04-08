/**
 * 账本级行为配置类型。
 *
 * 这层配置专门承载“账本行为参数”，避免学习阈值、收编阈值、
 * 收编压缩比例等继续散落在各服务私有常量、预算配置或账本主数据中。
 */

/**
 * 学习行为配置。
 */
export interface LedgerLearningPreferences {
  /** 触发学习所需的累计修正阈值。 */
  threshold: number;
  /** 是否允许自动学习。 */
  autoLearn: boolean;
}

/**
 * 收编行为配置。
 */
export interface LedgerCompressionPreferences {
  /** 当前记忆条目数超过该阈值时，允许触发收编。 */
  threshold: number;
  /**
   * 收编目标压缩比例。
   * 运行时计算为 floor(currentCount * ratio)，作为 Prompt 和结果校验的上限。
   */
  ratio: number;
}

/**
 * 账本行为配置总结构。
 */
export interface LedgerPreferences {
  learning: LedgerLearningPreferences;
  compression: LedgerCompressionPreferences;
}
