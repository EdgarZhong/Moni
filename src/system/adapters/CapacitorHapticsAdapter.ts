/**
 * CapacitorHapticsAdapter - Capacitor 触觉反馈适配器
 *
 * 包装 Capacitor Haptics API，实现 IHapticsAdapter 接口
 * 适用于：Android、iOS、Capacitor Web
 */

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import type {
  IHapticsAdapter,
  HapticImpactStyle,
  HapticNotificationType
} from './IHapticsAdapter';

export class CapacitorHapticsAdapter implements IHapticsAdapter {
  readonly name = 'CapacitorHaptics';

  private hasMethod<K extends 'impact' | 'notification' | 'vibrate'>(method: K): boolean {
    const maybe = Haptics as unknown as Record<string, unknown>;
    return typeof maybe[method] === 'function';
  }

  private fallbackVibrate(pattern: number | number[]): void {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  }

  /**
   * 映射适配器冲击强度到 Capacitor ImpactStyle
   */
  private mapImpactStyle(style: HapticImpactStyle): ImpactStyle {
    switch (style) {
      case 'LIGHT':
        return ImpactStyle.Light;
      case 'MEDIUM':
        return ImpactStyle.Medium;
      case 'HEAVY':
        return ImpactStyle.Heavy;
      default:
        return ImpactStyle.Medium;
    }
  }

  /**
   * 映射适配器通知类型到 Capacitor NotificationType
   */
  private mapNotificationType(type: HapticNotificationType): NotificationType {
    switch (type) {
      case 'SUCCESS':
        return NotificationType.Success;
      case 'WARNING':
        return NotificationType.Warning;
      case 'ERROR':
        return NotificationType.Error;
      default:
        return NotificationType.Success;
    }
  }

  async impact(style: HapticImpactStyle): Promise<void> {
    if (!this.hasMethod('impact')) {
      const fallbackDuration = style === 'HEAVY' ? 50 : style === 'MEDIUM' ? 35 : 20;
      this.fallbackVibrate(fallbackDuration);
      return;
    }
    try {
      await Haptics.impact({ style: this.mapImpactStyle(style) });
    } catch (e) {
      console.warn(`[${this.name}] Failed to trigger impact:`, e);
      const fallbackDuration = style === 'HEAVY' ? 50 : style === 'MEDIUM' ? 35 : 20;
      this.fallbackVibrate(fallbackDuration);
    }
  }

  async notification(type: HapticNotificationType): Promise<void> {
    if (!this.hasMethod('notification')) {
      const fallbackPattern = type === 'ERROR' ? [60, 80, 60] : type === 'WARNING' ? [40, 60, 40] : [30, 40, 30];
      this.fallbackVibrate(fallbackPattern);
      return;
    }
    try {
      await Haptics.notification({ type: this.mapNotificationType(type) });
    } catch (e) {
      console.warn(`[${this.name}] Failed to trigger notification:`, e);
      const fallbackPattern = type === 'ERROR' ? [60, 80, 60] : type === 'WARNING' ? [40, 60, 40] : [30, 40, 30];
      this.fallbackVibrate(fallbackPattern);
    }
  }

  async vibrate(duration: number = 100): Promise<void> {
    if (!this.hasMethod('vibrate')) {
      this.fallbackVibrate(duration);
      return;
    }
    try {
      await Haptics.vibrate({ duration });
    } catch (e) {
      console.warn(`[${this.name}] Failed to vibrate:`, e);
      this.fallbackVibrate(duration);
    }
  }

  isSupported(): boolean {
    // Capacitor Haptics 在所有平台都可用，但在 Web 上可能降级为 Vibration API
    return true;
  }
}
