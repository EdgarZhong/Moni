import { HapticsService } from '@system/adapters/HapticsService';
import { HapticImpactStyle, HapticNotificationType } from '@system/adapters/IHapticsAdapter';

/**
 * Haptics feedback levels for different interaction intensities
 */
export const HapticFeedbackLevel = {
  /**
   * Light haptic feedback - subtle notification
   * Used for minor interactions (tab switches, form validation)
   */
  LIGHT: 'light',
  
  /**
   * Medium haptic feedback - standard interaction
   * Used for normal user actions (button press, gesture confirm)
   */
  MEDIUM: 'medium',
  
  /**
   * Heavy haptic feedback - strong emphasis
   * Used for important actions (delete, critical success)
   */
  HEAVY: 'heavy'
} as const;

export type HapticFeedbackLevelType = typeof HapticFeedbackLevel[keyof typeof HapticFeedbackLevel];

/**
 * Triggers a haptic feedback response
 * Gracefully degrades on devices that don't support haptics
 * 
 * @param level - Intensity level of the haptic feedback
 * @example
 * triggerHaptic(HapticFeedbackLevel.LIGHT);  // Subtle feedback
 * triggerHaptic(HapticFeedbackLevel.MEDIUM); // Standard feedback
 * triggerHaptic(HapticFeedbackLevel.HEAVY);  // Strong feedback
 */
export async function triggerHaptic(
  level: HapticFeedbackLevelType = HapticFeedbackLevel.MEDIUM
): Promise<void> {
  try {
    // 将本地强度级别映射到适配器接口的 HapticImpactStyle
    const styleMap: Record<HapticFeedbackLevelType, HapticImpactStyle> = {
      [HapticFeedbackLevel.LIGHT]: HapticImpactStyle.Light,
      [HapticFeedbackLevel.MEDIUM]: HapticImpactStyle.Medium,
      [HapticFeedbackLevel.HEAVY]: HapticImpactStyle.Heavy
    };

    await HapticsService.getInstance().impact(styleMap[level]);
  } catch (error) {
    // Silently fail on unsupported devices or web browsers
    // This is expected behavior - haptics are a progressive enhancement
    if (process.env.NODE_ENV === 'development') {
      console.debug('Haptics unavailable:', error);
    }
  }
}

/**
 * Triggers a notification-style haptic response
 * Typically a distinct double-tap pattern used for success/completion feedback
 * 
 * @example
 * triggerHapticNotification();  // Success confirmation haptic
 */
export async function triggerHapticNotification(): Promise<void> {
  try {
    await HapticsService.getInstance().notification(HapticNotificationType.Success);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.debug('Haptic notification unavailable:', error);
    }
  }
}

/**
 * Triggers a selection-style haptic response
 * Typically a light tap, used for cursor movement or scrolling feedback
 * 
 * @example
 * triggerHapticSelection();  // Selection feedback for list scrolling
 */
export async function triggerHapticSelection(): Promise<void> {
  try {
    // 使用轻度震动模拟选择反馈（接口层不暴露 selectionStart）
    await HapticsService.getInstance().vibrate(10);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.debug('Haptic selection unavailable:', error);
    }
  }
}

/**
 * Batch haptic feedback utility for complex interactions
 * Executes multiple haptics in sequence with specified delays
 * 
 * @param feedbacks - Array of [level, delayMs] tuples
 * @example
 * // Double-tap effect
 * triggerHapticSequence([
 *   [HapticFeedbackLevel.LIGHT, 0],
 *   [HapticFeedbackLevel.LIGHT, 100]
 * ]);
 */
export async function triggerHapticSequence(
  feedbacks: [HapticFeedbackLevelType, number][]
): Promise<void> {
  for (const [level, delay] of feedbacks) {
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    await triggerHaptic(level);
  }
}
