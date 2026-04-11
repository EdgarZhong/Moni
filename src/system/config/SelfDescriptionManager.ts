/**
 * SelfDescriptionManager - 用户自述文件管理
 *
 * 职责：
 * 1. 管理用户自述文件（Documents/Moni/self_description/user_profile.md）
 * 2. 从 secure_config.bin 迁移 userContext 到独立文件
 * 3. 提供读写接口供 ConfigManager 使用
 *
 * 迁移策略：
 * - 首次启动时检查新文件是否存在
 * - 如果不存在，从旧配置读取并迁移
 * - 迁移成功后，可选：清空旧配置的 userContext 字段
 */

import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterDirectory, AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
import { getLedgerStorageDirectory } from '@system/filesystem/fs-storage';

const FILE_PATH = 'Moni/self_description/user_profile.md';

export class SelfDescriptionManager {
  /**
   * 读取用户自述
   * @returns 自述内容，文件不存在时返回空字符串
   */
  public static async load(): Promise<string> {
    try {
      const exists = await this.exists();
      if (!exists) {
        return '';
      }

      const fs = FilesystemService.getInstance();
      const directory = getLedgerStorageDirectory();
      const data = await fs.readFile({
        path: FILE_PATH,
        directory,
        encoding: AdapterEncoding.UTF8
      });
      return data;
    } catch {
      // 文件不存在，返回空字符串
      return '';
    }
  }

  /**
   * 保存用户自述
   * @param content 自述内容
   */
  public static async save(content: string): Promise<void> {
    try {
      const fs = FilesystemService.getInstance();
      const directory = getLedgerStorageDirectory();
      await fs.writeFile({
        path: FILE_PATH,
        data: content,
        directory,
        encoding: AdapterEncoding.UTF8,
        recursive: true
      });
    } catch (e) {
      console.error('[SelfDescriptionManager] Failed to save:', e);
      throw e;
    }
  }

  /**
   * 检查自述文件是否存在
   */
  public static async exists(): Promise<boolean> {
    try {
      const fs = FilesystemService.getInstance();
      const directory = getLedgerStorageDirectory();
      await fs.stat({
        path: FILE_PATH,
        directory
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 迁移旧的 userContext 到新文件
   * @param oldUserContext 旧配置中的 userContext
   * @returns 是否成功迁移
   */
  public static async migrateFromOldConfig(oldUserContext: string | undefined): Promise<boolean> {
    // 如果新文件已存在，不迁移
    const exists = await this.exists();
    if (exists) {
      return false;
    }

    // 如果旧配置为空，不迁移
    if (!oldUserContext || oldUserContext.trim() === '') {
      return false;
    }

    try {
      await this.save(oldUserContext);
      console.log('[SelfDescriptionManager] Migrated userContext to user_profile.md');
      return true;
    } catch (e) {
      console.error('[SelfDescriptionManager] Migration failed:', e);
      return false;
    }
  }

  /**
   * 删除自述文件（谨慎使用）
   */
  public static async delete(): Promise<void> {
    try {
      const fs = FilesystemService.getInstance();
      await fs.deleteFile({
        path: FILE_PATH,
        directory: AdapterDirectory.Documents
      });
    } catch (e) {
      console.warn('[SelfDescriptionManager] Failed to delete:', e);
    }
  }
}
