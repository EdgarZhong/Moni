import type {
  HapticImpactStyle,
  HapticNotificationType,
  IHapticsAdapter
} from './IHapticsAdapter';

const IMPACT_DURATION: Record<HapticImpactStyle, number> = {
  LIGHT: 20,
  MEDIUM: 35,
  HEAVY: 50
};

const NOTIFICATION_PATTERN: Record<HapticNotificationType, number | number[]> = {
  SUCCESS: [30, 40, 30],
  WARNING: [40, 60, 40],
  ERROR: [60, 80, 60]
};

export class WebHapticsAdapter implements IHapticsAdapter {
  readonly name = 'WebVibration';

  async impact(style: HapticImpactStyle): Promise<void> {
    this.vibrateInternal(IMPACT_DURATION[style] ?? IMPACT_DURATION.MEDIUM);
  }

  async notification(type: HapticNotificationType): Promise<void> {
    this.vibrateInternal(NOTIFICATION_PATTERN[type] ?? NOTIFICATION_PATTERN.SUCCESS);
  }

  async vibrate(duration: number = 100): Promise<void> {
    this.vibrateInternal(duration);
  }

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  private vibrateInternal(pattern: number | number[]): void {
    if (!this.isSupported()) {
      return;
    }

    navigator.vibrate(pattern);
  }
}
