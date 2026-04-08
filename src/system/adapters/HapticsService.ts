/**
 * HapticsService - 触觉反馈适配器工厂
 *
 * 单例模式，自动检测运行环境并选择合适的适配器
 * - Capacitor Native: CapacitorHapticsAdapter
 * - Pure Web: WebVibrationAdapter (待实现)
 * - Desktop/不支持: NoopHapticsAdapter (待实现)
 */

import { Capacitor } from '@capacitor/core';
import type { IHapticsAdapter } from './IHapticsAdapter';
import { CapacitorHapticsAdapter } from './CapacitorHapticsAdapter';

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
        // TODO: 实现 WebVibrationAdapter
        console.warn('[HapticsService] Web vibration adapter not implemented, falling back to Capacitor');
        return new CapacitorHapticsAdapter();

      case 'desktop':
        // TODO: 实现 NoopHapticsAdapter
        console.warn('[HapticsService] Desktop haptics not supported, falling back to Capacitor');
        return new CapacitorHapticsAdapter();

      default:
        console.warn('[HapticsService] Unknown platform, falling back to Capacitor');
        return new CapacitorHapticsAdapter();
    }
  }

  /**
   * 检测运行平台
   */
  private static detectPlatform(): 'capacitor' | 'web' | 'desktop' {
    // 检测 Capacitor Native
    if (Capacitor.isNativePlatform()) {
      return 'capacitor';
    }

    // 检测 Electron（桌面端）
    if (typeof window !== 'undefined' && (window as any).electron) {
      return 'desktop';
    }

    // 检测 Web Vibration API
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      return 'web';
    }

    // 默认为桌面端（不支持触觉反馈）
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
