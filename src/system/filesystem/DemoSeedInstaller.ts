import { Capacitor } from '@capacitor/core';
import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterDirectory, AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
import { SECURE_CONFIG_PATH } from '@system/filesystem/persistence-paths';

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
 * 2. 仅在正式沙盒尚未存在 `secure_config.bin` 时执行
 * 3. 把 APK 内随包携带的 demo seed manifest 写入 `Directory.Data`
 *
 * 约束：
 * - 一旦检测到已有 `secure_config.bin`，就绝不覆盖，避免误伤真实用户
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
    const hasSecureConfig = await this.hasSecureConfig(fs);

    if (hasSecureConfig) {
      this.installed = true;
      return;
    }

    const manifest = await this.loadManifest();
    if (!manifest || manifest.files.length === 0) {
      this.installed = true;
      return;
    }

    for (const file of manifest.files) {
      // 当前 special release 的 manifest 里只允许出现 secure_config.bin。
      if (file.path !== SECURE_CONFIG_PATH) {
        continue;
      }

      await fs.writeFile({
        path: file.path,
        data: file.data,
        directory: AdapterDirectory.Data,
        encoding: AdapterEncoding.UTF8,
        recursive: true
      });
    }

    this.installed = true;
    console.log(`[DemoSeedInstaller] Installed demo seed manifest with ${manifest.files.length} files.`);
  }

  /**
   * 只检查 `secure_config.bin` 自身是否存在。
   *
   * 当前 manifest 已只保留单文件配置，因此存在判断也只盯住这一个目标。
   */
  private static async hasSecureConfig(fs: ReturnType<typeof FilesystemService.getInstance>): Promise<boolean> {
    return await fs.exists({
      path: SECURE_CONFIG_PATH,
      directory: AdapterDirectory.Data
    });
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
