/**
 * IHapticsAdapter - 触觉反馈适配器接口
 *
 * 目的：抽象触觉反馈操作，支持多平台部署
 * - Capacitor Haptics (Mobile/Native)
 * - Vibration API (Web)
 * - No-op (Desktop/不支持的平台)
 */

/**
 * 触觉反馈强度常量
 */
export const HapticImpactStyle = {
  /** 轻度反馈 */
  Light: 'LIGHT',
  /** 中度反馈 */
  Medium: 'MEDIUM',
  /** 重度反馈 */
  Heavy: 'HEAVY'
} as const;

export type HapticImpactStyle = typeof HapticImpactStyle[keyof typeof HapticImpactStyle];

/**
 * 触觉通知类型常量
 */
export const HapticNotificationType = {
  /** 成功通知 */
  Success: 'SUCCESS',
  /** 警告通知 */
  Warning: 'WARNING',
  /** 错误通知 */
  Error: 'ERROR'
} as const;

export type HapticNotificationType = typeof HapticNotificationType[keyof typeof HapticNotificationType];

/**
 * 触觉反馈适配器接口
 */
export interface IHapticsAdapter {
  /**
   * 适配器名称（用于调试和日志）
   */
  readonly name: string;

  /**
   * 触发冲击反馈
   * @param style 反馈强度
   */
  impact(style: HapticImpactStyle): Promise<void>;

  /**
   * 触发通知反馈
   * @param type 通知类型
   */
  notification(type: HapticNotificationType): Promise<void>;

  /**
   * 触发震动
   * @param duration 震动时长（毫秒），默认 100ms
   */
  vibrate(duration?: number): Promise<void>;

  /**
   * 检查是否支持触觉反馈
   */
  isSupported(): boolean;
}
