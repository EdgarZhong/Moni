/**
 * HapticsService - 触觉反馈适配器工厂
 *
 * 单例模式，自动检测运行环境并选择合适的适配器
 * - Capacitor Native: CapacitorHapticsAdapter
 * - Pure Web: WebHapticsAdapter
 * - Desktop/不支持: NoopHapticsAdapter
 */

import type { IHapticsAdapter } from './IHapticsAdapter';
import { CapacitorHapticsAdapter } from './CapacitorHapticsAdapter';
import { NoopHapticsAdapter } from './NoopHapticsAdapter';
import { WebHapticsAdapter } from './WebHapticsAdapter';
import { getRuntimeInfo } from '@system/runtime/RuntimeInfo';

export class HapticsService {
  private static instance: IHapticsAdapter | null = null;

  /**
   * 获取触觉反馈适配器实例
   */
  static getInstance(): IHapticsAdapter {
    if (!this.instance) {
      this.instance = this.createAdapter();
    }
    return this.instance;
  }

  /**
   * 创建适配器实例
   */
  private static createAdapter(): IHapticsAdapter {
    // 检测运行环境
    const platform = this.detectPlatform();

    console.log(`[HapticsService] Detected platform: ${platform}`);

    switch (platform) {
      case 'capacitor':
        return new CapacitorHapticsAdapter();

      case 'web':
        return new WebHapticsAdapter();

      case 'desktop':
        return new NoopHapticsAdapter();

      default:
        return new NoopHapticsAdapter();
    }
  }

  /**
   * 检测运行平台
   */
  private static detectPlatform(): 'capacitor' | 'web' | 'desktop' {
    const runtime = getRuntimeInfo();

    if (runtime.kind === 'capacitor-native') {
      return 'capacitor';
    }

    if (runtime.kind === 'electron') {
      return 'desktop';
    }

    if (runtime.supportsVibration) {
      return 'web';
    }

    return 'desktop';
  }

  /**
   * 手动设置适配器（用于测试）
   */
  static setAdapter(adapter: IHapticsAdapter): void {
    this.instance = adapter;
    console.log(`[HapticsService] Manually set adapter: ${adapter.name}`);
  }

  /**
   * 重置适配器（用于测试）
   */
  static reset(): void {
    this.instance = null;
  }

  /**
   * 获取当前适配器名称
   */
  static getAdapterName(): string {
    return this.getInstance().name;
  }

  /**
   * 检查是否支持触觉反馈
   */
  static isSupported(): boolean {
    return this.getInstance().isSupported();
  }
}
