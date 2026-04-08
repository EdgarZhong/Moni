import type {
  HapticImpactStyle,
  HapticNotificationType,
  IHapticsAdapter
} from './IHapticsAdapter';

export class NoopHapticsAdapter implements IHapticsAdapter {
  readonly name = 'NoopHaptics';

  async impact(_style: HapticImpactStyle): Promise<void> {}

  async notification(_type: HapticNotificationType): Promise<void> {}

  async vibrate(_duration: number = 100): Promise<void> {}

  isSupported(): boolean {
    return false;
  }
}
