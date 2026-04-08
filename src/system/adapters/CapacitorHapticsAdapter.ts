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
    try {
      await Haptics.impact({ style: this.mapImpactStyle(style) });
    } catch (e) {
      console.warn(`[${this.name}] Failed to trigger impact:`, e);
    }
  }

  async notification(type: HapticNotificationType): Promise<void> {
    try {
      await Haptics.notification({ type: this.mapNotificationType(type) });
    } catch (e) {
      console.warn(`[${this.name}] Failed to trigger notification:`, e);
    }
  }

  async vibrate(duration: number = 100): Promise<void> {
    try {
      await Haptics.vibrate({ duration });
    } catch (e) {
      console.warn(`[${this.name}] Failed to vibrate:`, e);
    }
  }

  isSupported(): boolean {
    // Capacitor Haptics 在所有平台都可用，但在 Web 上可能降级为 Vibration API
    return true;
  }
}
