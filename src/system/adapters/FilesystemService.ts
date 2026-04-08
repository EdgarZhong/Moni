/**
 * FilesystemService - 文件系统适配器工厂
 *
 * 单例模式，自动检测运行环境并选择合适的适配器
 * - Capacitor Native: CapacitorFilesystemAdapter
 * - Capacitor Web / Dev Mock: CapacitorFilesystemAdapter
 * - Pure Browser Web: Browser filesystem adapter (待实现)
 * - Electron: Electron filesystem adapter (待实现)
 */

import { Capacitor } from '@capacitor/core';
import type { IFilesystemAdapter } from './IFilesystemAdapter';
import { CapacitorFilesystemAdapter } from './CapacitorFilesystemAdapter';
import { getRuntimeInfo } from '@system/runtime/RuntimeInfo';

export class FilesystemService {
  private static instance: IFilesystemAdapter | null = null;
  private static initialized = false;

  /**
   * 获取文件系统适配器实例
   */
  static getInstance(): IFilesystemAdapter {
    if (!this.instance) {
      this.instance = this.createAdapter();
    }
    return this.instance;
  }

  /**
   * 初始化适配器（异步）
   * 某些适配器需要异步初始化（如 IndexedDB）
   */
  static async init(): Promise<void> {
    if (this.initialized) return;

    const adapter = this.getInstance();
    if (adapter.init) {
      await adapter.init();
    }

    this.initialized = true;
    console.log(`[FilesystemService] Initialized with adapter: ${adapter.name}`);
  }

  /**
   * 创建适配器实例
   */
  private static createAdapter(): IFilesystemAdapter {
    const platform = this.detectPlatform();

    console.log(`[FilesystemService] Detected platform: ${platform}`);

    switch (platform) {
      case 'capacitor-native':
      case 'capacitor-web':
        return new CapacitorFilesystemAdapter();

      case 'electron':
        console.warn('[FilesystemService] Electron adapter not implemented, falling back to Capacitor');
        return new CapacitorFilesystemAdapter();

      case 'browser-web':
        console.warn('[FilesystemService] Browser filesystem adapter not implemented, falling back to Capacitor-compatible filesystem');
        return new CapacitorFilesystemAdapter();

      default:
        console.warn('[FilesystemService] Unknown platform, falling back to Capacitor');
        return new CapacitorFilesystemAdapter();
    }
  }

  /**
   * 检测运行平台
   */
  private static detectPlatform(): 'capacitor-native' | 'capacitor-web' | 'electron' | 'browser-web' {
    if (Capacitor.isNativePlatform()) {
      return 'capacitor-native';
    }

    const runtime = getRuntimeInfo();
    if (runtime.kind === 'capacitor-web') {
      return 'capacitor-web';
    }

    if (typeof window !== 'undefined' && (window as any).electron) {
      return 'electron';
    }

    return 'browser-web';
  }

  /**
   * 手动设置适配器（用于测试）
   */
  static setAdapter(adapter: IFilesystemAdapter): void {
    this.instance = adapter;
    this.initialized = false;
    console.log(`[FilesystemService] Manually set adapter: ${adapter.name}`);
  }

  /**
   * 重置适配器（用于测试）
   */
  static reset(): void {
    this.instance = null;
    this.initialized = false;
  }

  /**
   * 获取当前适配器名称
   */
  static getAdapterName(): string {
    return this.getInstance().name;
  }
}
