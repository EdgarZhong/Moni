/**
 * MigrationManager - v5 到 v6 数据迁移管理器
 *
 * 职责：
 * 1. 检测旧版本数据结构（v5）
 * 2. 迁移记忆文件到快照系统
 * 3. 迁移快照目录结构
 * 4. 清理旧数据
 *
 * v5 → v6 迁移内容：
 * - Documents/Moni/classify_memory/{ledger}.md → {ledger}/YYYY-MM-DD_HH-mm-ss-SSS.md
 * - Data/memory_snapshots/{ledger}/ → Documents/Moni/classify_memory/{ledger}/
 * - 创建 index.json 并设置 current_snapshot_id
 */

import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterDirectory, AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
import { MemoryManager } from './MemoryManager';

export class MigrationManager {
  /**
   * 检查账本是否需要迁移
   * @param ledgerName 账本名称
   * @returns 是否需要迁移
   */
  public static async needsMigration(ledgerName: string): Promise<boolean> {
    try {
      // 检查是否存在 v5 记忆文件（Documents/Moni/classify_memory/{ledger}.md）
      const fs = FilesystemService.getInstance();
      await fs.stat({
        path: `Moni/classify_memory/${ledgerName}.md`,
        directory: AdapterDirectory.Documents
      });
      return true;
    } catch {
      // v5 记忆文件不存在，无需迁移
      return false;
    }
  }

  /**
   * 执行 v5 到 v6 迁移
   * @param ledgerName 账本名称
   * @returns 是否成功
   */
  public static async migrate(ledgerName: string): Promise<boolean> {
    console.log(`[MigrationManager] Starting v5 → v6 migration for: ${ledgerName}`);

    try {
      // 1. 读取 v5 记忆文件内容
      const v5MemoryPath = `Moni/classify_memory/${ledgerName}.md`;
      const fs = FilesystemService.getInstance();
      const v5Content = await fs.readFile({
        path: v5MemoryPath,
        directory: AdapterDirectory.Documents,
        encoding: AdapterEncoding.UTF8
      });

      // 2. 创建初始快照（migration 触发）
      await MemoryManager.save(
        ledgerName,
        this.parseV5Content(v5Content),
        'migration',
        'v5 → v6 数据迁移'
      );

      // 3. 迁移 v5 快照目录（如果存在）
      await this.migrateV5Snapshots(ledgerName);

      // 4. 删除 v5 记忆文件
      await fs.deleteFile({
        path: v5MemoryPath,
        directory: AdapterDirectory.Documents
      });

      console.log(`[MigrationManager] Migration completed for: ${ledgerName}`);
      return true;
    } catch (e) {
      console.error(`[MigrationManager] Migration failed for ${ledgerName}:`, e);
      return false;
    }
  }

  /**
   * 迁移 v5 快照目录
   * Data/memory_snapshots/{ledger}/ → Documents/Moni/classify_memory/{ledger}/
   */
  private static async migrateV5Snapshots(ledgerName: string): Promise<void> {
    const v5SnapshotDir = `memory_snapshots/${ledgerName}`;

    try {
      // 读取 v5 快照目录
      const fs = FilesystemService.getInstance();
      const result = await fs.readdir({
        path: v5SnapshotDir,
        directory: AdapterDirectory.Data
      });

      // 读取 v5 index.json
      let v5Snapshots: any[] = [];
      try {
        const indexContent = await fs.readFile({
          path: `${v5SnapshotDir}/index.json`,
          directory: AdapterDirectory.Data,
          encoding: AdapterEncoding.UTF8
        });
        const v5Index = JSON.parse(indexContent);
        v5Snapshots = v5Index.snapshots || [];
      } catch {
        console.warn(`[MigrationManager] No v5 index.json found for ${ledgerName}`);
      }

      // 迁移每个快照文件
      for (const entry of result) {
        const fileName = entry.name;

        // 跳过 index.json
        if (fileName === 'index.json') continue;

        try {
          // 读取 v5 快照内容
          const v5SnapshotContent = await fs.readFile({
            path: `${v5SnapshotDir}/${fileName}`,
            directory: AdapterDirectory.Data,
            encoding: AdapterEncoding.UTF8
          });

          // 查找对应的元数据
          const snapshotId = fileName.replace('.md', '');
          const v5Meta = v5Snapshots.find(s => s.id === snapshotId);

          // 转换为 v6 格式并创建快照
          if (v5Meta) {
            await MemoryManager.save(
              ledgerName,
              this.parseV5Content(v5SnapshotContent),
              this.convertV5Trigger(v5Meta.trigger),
              v5Meta.summary || '从 v5 迁移'
            );
          }
        } catch (e) {
          console.warn(`[MigrationManager] Failed to migrate snapshot ${fileName}:`, e);
        }
      }

      // 删除 v5 快照目录
      await fs.rmdir({
        path: v5SnapshotDir,
        directory: AdapterDirectory.Data,
        recursive: true
      });

      console.log(`[MigrationManager] Migrated v5 snapshots for: ${ledgerName}`);
    } catch {
      // v5 快照目录不存在，跳过
      console.log(`[MigrationManager] No v5 snapshots found for: ${ledgerName}`);
    }
  }

  /**
   * 解析 v5 记忆文件内容
   */
  private static parseV5Content(content: string): string[] {
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // 去除序号前缀，如 "1. " 或 "1) "
        const match = line.match(/^\d+[.)]\s*(.+)$/);
        return match ? match[1] : line;
      });
  }

  /**
   * 转换 v5 trigger 到 v6 格式
   */
  private static convertV5Trigger(
    v5Trigger: string
  ): 'ledger_init' | 'ai_learn' | 'ai_compress' | 'user_edit' | 'tag_delete' | 'manual' | 'migration' {
    // v5 和 v6 的 trigger 类型基本一致，直接映射
    const triggerMap: Record<string, any> = {
      'ledger_init': 'ledger_init',
      'ai_learn': 'ai_learn',
      'ai_compress': 'ai_compress',
      'user_edit': 'user_edit',
      'tag_delete': 'tag_delete',
      'manual': 'manual'
    };

    return triggerMap[v5Trigger] || 'migration';
  }

  /**
   * 批量迁移所有账本
   * @param ledgerNames 账本名称列表
   * @returns 迁移结果统计
   */
  public static async migrateAll(ledgerNames: string[]): Promise<{
    total: number;
    migrated: number;
    skipped: number;
    failed: number;
  }> {
    const result = {
      total: ledgerNames.length,
      migrated: 0,
      skipped: 0,
      failed: 0
    };

    for (const ledgerName of ledgerNames) {
      const needsMigration = await this.needsMigration(ledgerName);

      if (!needsMigration) {
        result.skipped++;
        continue;
      }

      const success = await this.migrate(ledgerName);
      if (success) {
        result.migrated++;
      } else {
        result.failed++;
      }
    }

    console.log('[MigrationManager] Migration summary:', result);
    return result;
  }
}
