import { Capacitor } from '@capacitor/core';
import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterDirectory, AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
import { LEDGERS_INDEX_PATH, SECURE_CONFIG_PATH, SELF_DESCRIPTION_PATH } from '@system/filesystem/persistence-paths';
import { ZipReader, BlobReader, TextWriter } from '@zip.js/zip.js';

/**
 * DemoSeedInstaller
 *
 * 目标：
 * 1. 仅在原生端执行
 * 2. 仅在沙盒目录尚未存在正式用户数据时执行
 * 3. 把 APK 内随包携带的 seed.zip 一次性解压到 `Directory.Data`
 *
 * 相比上一版 demo-seed-manifest.json（逐个 writeFile），zip 方案：
 * - 一次性 fetch + 解压，不存在"只写了一半就中断"的部分落盘风险
 * - 减少异步 I/O 调用次数，提升首启速度
 *
 * 约束：
 * - 一旦检测到已有数据，就绝不覆盖，避免误伤真实用户
 * - seed.zip 缺失时静默跳过，保持正常启动
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

    const zipBlob = await this.fetchSeedZip();
    if (!zipBlob) {
      this.installed = true;
      return;
    }

    let extractedCount = 0;
    try {
      const reader = new ZipReader(new BlobReader(zipBlob));
      const entries = await reader.getEntries();

      for (const entry of entries) {
        // 跳过目录条目
        if (entry.directory) continue;
        // 跳过 .gitkeep 占位文件
        if (entry.filename.endsWith('.gitkeep')) continue;

        const targetPath = entry.filename;
        const content = await entry.getData!(new TextWriter());

        await fs.writeFile({
          path: targetPath,
          data: content,
          directory: AdapterDirectory.Data,
          encoding: AdapterEncoding.UTF8,
          recursive: true
        });
        extractedCount++;
      }

      await reader.close();
    } catch (error) {
      console.warn('[DemoSeedInstaller] Failed to extract seed.zip:', error);
      this.installed = true;
      return;
    }

    this.installed = true;
    console.log(`[DemoSeedInstaller] Installed seed.zip: ${extractedCount} files extracted.`);
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
   * 从 APK 随包静态资源中获取 seed.zip。
   *
   * 使用相对站点根路径，兼容 Capacitor 本地服务器。
   */
  private static async fetchSeedZip(): Promise<Blob | null> {
    try {
      const response = await fetch('/seed.zip', {
        cache: 'no-store'
      });

      if (!response.ok) {
        console.warn(`[DemoSeedInstaller] seed.zip not found: ${response.status}`);
        return null;
      }

      return await response.blob();
    } catch (error) {
      console.warn('[DemoSeedInstaller] Failed to fetch seed.zip:', error);
      return null;
    }
  }
}
