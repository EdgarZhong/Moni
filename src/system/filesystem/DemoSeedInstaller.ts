import { Capacitor } from '@capacitor/core';
import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterDirectory, AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
import { LEDGERS_INDEX_PATH, SECURE_CONFIG_PATH, SELF_DESCRIPTION_PATH } from '@system/filesystem/persistence-paths';

/**
 * Demo seed 文件项。
 *
 * `path` 为相对于 `Directory.Data` 根目录的目标路径；
 * `data` 为 UTF-8 文本内容。
 */
interface DemoSeedFile {
  path: string;
  data: string;
}

/**
 * Demo seed 清单结构。
 */
interface DemoSeedManifest {
  version: number;
  generatedAt: string;
  sourceRoot: string;
  files: DemoSeedFile[];
}

/**
 * DemoSeedInstaller
 *
 * 目标：
 * 1. 仅在原生端执行
 * 2. 仅在沙盒目录尚未存在正式用户数据时执行
 * 3. 把 APK 内随包携带的 demo seed 写入 `Directory.Data`
 *
 * 约束：
 * - 一旦检测到已有数据，就绝不覆盖，避免误伤真实用户
 * - manifest 缺失时静默跳过，保持正常启动
 */
export class DemoSeedInstaller {
  private static installed = false;

  /**
   * 在应用启动早期执行一次 demo seed 检查与安装。
   */
  public static async installIfNeeded(): Promise<void> {
    if (this.installed) {
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      this.installed = true;
      return;
    }

    const fs = FilesystemService.getInstance();
    const hasUserData = await this.hasExistingUserData(fs);

    if (hasUserData) {
      this.installed = true;
      return;
    }

    const manifest = await this.loadManifest();
    if (!manifest || manifest.files.length === 0) {
      this.installed = true;
      return;
    }

    for (const file of manifest.files) {
      // 直接按正式持久化目标写入，递归创建父目录。
      await fs.writeFile({
        path: file.path,
        data: file.data,
        directory: AdapterDirectory.Data,
        encoding: AdapterEncoding.UTF8,
        recursive: true
      });
    }

    this.installed = true;
    console.log(`[DemoSeedInstaller] Installed demo seed with ${manifest.files.length} files.`);
  }

  /**
   * 只要检测到任一正式全局文件存在，就认为设备上已有用户数据。
   *
   * 这样可以避免把演示 seed 覆盖到已使用中的设备上。
   */
  private static async hasExistingUserData(fs: ReturnType<typeof FilesystemService.getInstance>): Promise<boolean> {
    const targets = [LEDGERS_INDEX_PATH, SECURE_CONFIG_PATH, SELF_DESCRIPTION_PATH];

    for (const target of targets) {
      const exists = await fs.exists({
        path: target,
        directory: AdapterDirectory.Data
      });
      if (exists) {
        return true;
      }
    }

    return false;
  }

  /**
   * 从 APK 随包静态资源中读取 demo seed manifest。
   *
   * 使用相对站点根路径，兼容 Capacitor 本地服务器。
   */
  private static async loadManifest(): Promise<DemoSeedManifest | null> {
    try {
      const response = await fetch('/demo-seed-manifest.json', {
        cache: 'no-store'
      });

      if (!response.ok) {
        console.warn(`[DemoSeedInstaller] Demo seed manifest not found: ${response.status}`);
        return null;
      }

      const manifest = await response.json() as DemoSeedManifest;
      if (!Array.isArray(manifest.files)) {
        console.warn('[DemoSeedInstaller] Demo seed manifest is invalid.');
        return null;
      }

      return manifest;
    } catch (error) {
      console.warn('[DemoSeedInstaller] Failed to load demo seed manifest:', error);
      return null;
    }
  }
}
