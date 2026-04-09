/**
 * SnapshotManager - 记忆快照管理（v6 架构）
 *
 * v6 核心变更：
 * 1. 快照存储：Documents/Moni/classify_memory/{ledger}/
 * 2. 快照命名：日期时间格式 YYYY-MM-DD_HH-mm-ss-SSS
 * 3. 当前指针：index.json 中的 current_snapshot_id
 * 4. 单一事实源：当前记忆内容始终通过 current_snapshot_id 获取
 * 5. GC 规则：保留最近 30 个，删除"最旧且非当前"
 * 6. 回退操作：只更新 current_snapshot_id，不创建新快照
 *
 * 目录结构：
 * ```
 * Documents/Moni/classify_memory/{ledger}/
 * ├── index.json
 * ├── 2026-03-17_14-30-00-000.md
 * ├── 2026-03-17_15-10-00-000.md
 * └── ...
 * ```
 */

import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterDirectory, AdapterEncoding } from '@system/adapters/IFilesystemAdapter';

/**
 * 快照元数据
 */
export interface SnapshotMeta {
  id: string;
  timestamp: string;
  trigger: 'ledger_init' | 'ai_learn' | 'ai_compress' | 'user_edit' | 'tag_delete' | 'manual' | 'migration';
  summary: string;
}

/**
 * 快照索引（v6）
 */
export interface SnapshotIndex {
  current_snapshot_id: string;
  snapshots: SnapshotMeta[];
  last_learned_example_revision: number;
}

/**
 * 快照内容（用于回退预览）
 */
export interface SnapshotContent extends SnapshotMeta {
  content: string[];
}

export class SnapshotManager {
  private static readonly BASE_PATH = 'Moni/classify_memory';
  private static readonly MAX_SNAPSHOTS = 30;
  private static readonly VALID_TRIGGERS: ReadonlyArray<SnapshotMeta['trigger']> = [
    'ledger_init',
    'ai_learn',
    'ai_compress',
    'user_edit',
    'tag_delete',
    'manual',
    'migration'
  ];

  /**
   * 获取账本快照目录路径（v6：Documents 目录）
   */
  private static getLedgerDir(ledgerName: string): string {
    return `${this.BASE_PATH}/${ledgerName}`;
  }

  /**
   * 获取索引文件路径
   */
  private static getIndexPath(ledgerName: string): string {
    return `${this.getLedgerDir(ledgerName)}/index.json`;
  }

  /**
   * 生成快照 ID（v6：日期时间格式）
   * 格式：YYYY-MM-DD_HH-mm-ss-SSS
   */
  private static generateSnapshotId(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');

    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}-${ms}`;
  }

  /**
   * 读取快照索引（v6）
   */
  private static async loadIndex(ledgerName: string): Promise<SnapshotIndex> {
    const indexPath = this.getIndexPath(ledgerName);
    const fs = FilesystemService.getInstance();

    try {
      const exists = await fs.exists({
        path: indexPath,
        directory: AdapterDirectory.Documents
      });

      if (!exists) {
        return { current_snapshot_id: '', snapshots: [], last_learned_example_revision: 0 };
      }

      const data = await fs.readFile({
        path: indexPath,
        directory: AdapterDirectory.Documents,
        encoding: AdapterEncoding.UTF8
      });
      return this.normalizeIndex(JSON.parse(data));
    } catch {
      return { current_snapshot_id: '', snapshots: [], last_learned_example_revision: 0 };
    }
  }

  /**
   * 保存快照索引（v6）
   */
  private static async saveIndex(ledgerName: string, index: SnapshotIndex): Promise<void> {
    const indexPath = this.getIndexPath(ledgerName);
    const fs = FilesystemService.getInstance();

    await fs.writeFile({
      path: indexPath,
      data: JSON.stringify(index, null, 2),
      directory: AdapterDirectory.Documents,
      encoding: AdapterEncoding.UTF8,
      recursive: true
    });
  }

  private static normalizeIndex(raw: unknown): SnapshotIndex {
    if (!raw || typeof raw !== 'object') {
      return { current_snapshot_id: '', snapshots: [], last_learned_example_revision: 0 };
    }

    const candidate = raw as Partial<SnapshotIndex>;
    const rawCurrentId =
      typeof candidate.current_snapshot_id === 'string'
        ? candidate.current_snapshot_id
        : typeof (raw as { current_snapshot?: unknown }).current_snapshot === 'string'
          ? (raw as { current_snapshot: string }).current_snapshot
          : '';
    const rawSnapshots =
      Array.isArray(candidate.snapshots)
        ? candidate.snapshots
        : Array.isArray((raw as { history?: unknown }).history)
          ? ((raw as { history: unknown[] }).history)
          : [];
    const snapshots = rawSnapshots
      .map((item) => this.normalizeSnapshotMeta(item))
      .filter((item): item is SnapshotMeta => item !== null);
    const currentSnapshotId = rawCurrentId || snapshots[snapshots.length - 1]?.id || '';
    return {
      current_snapshot_id: currentSnapshotId,
      snapshots,
      last_learned_example_revision:
        typeof candidate.last_learned_example_revision === 'number' && candidate.last_learned_example_revision >= 0
          ? candidate.last_learned_example_revision
          : 0
    };
  }

  private static normalizeSnapshotMeta(raw: unknown): SnapshotMeta | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === 'string'
      ? item.id
      : typeof item.snapshot_id === 'string'
        ? item.snapshot_id
        : '';
    if (!id) {
      return null;
    }
    const timestamp = this.normalizeSnapshotTimestamp(item.timestamp, item.created_at, id);
    const triggerCandidate = typeof item.trigger === 'string' ? item.trigger : '';
    const trigger = this.VALID_TRIGGERS.includes(triggerCandidate as SnapshotMeta['trigger'])
      ? triggerCandidate as SnapshotMeta['trigger']
      : 'manual';
    const summary = typeof item.summary === 'string' && item.summary.trim().length > 0
      ? item.summary
      : '历史版本';
    return {
      id,
      timestamp,
      trigger,
      summary
    };
  }

  private static normalizeSnapshotTimestamp(timestamp: unknown, createdAt: unknown, snapshotId: string): string {
    if (typeof timestamp === 'string' && timestamp.trim().length > 0) {
      return timestamp;
    }
    if (typeof createdAt === 'string' && createdAt.trim().length > 0) {
      return createdAt;
    }
    const parsed = snapshotId.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})-(\d{3})$/);
    if (parsed) {
      const [, y, m, d, hh, mm, ss, ms] = parsed;
      const date = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}.${ms}`);
      if (!Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
    return new Date().toISOString();
  }

  /**
   * 创建快照（v6 语义）
   *
   * v6 变更：
   * - 接受 content 参数，不再依赖 MemoryManager.load()
   * - 使用 datetime 格式的快照 ID
   * - 更新 current_snapshot_id 指针
   * - GC 规则：删除"最旧的非当前快照"
   *
   * @param ledgerName 账本名称
   * @param content 快照内容（记忆文件内容）
   * @param trigger 触发类型
   * @param summary 摘要说明
   * @returns 快照 ID
   */
  public static async create(
    ledgerName: string,
    content: string,
    trigger: SnapshotMeta['trigger'],
    summary: string
  ): Promise<string> {
    try {
      // 1. 生成快照 ID（datetime 格式）
      const snapshotId = this.generateSnapshotId();

      // 2. 创建快照元数据
      const meta: SnapshotMeta = {
        id: snapshotId,
        timestamp: new Date().toISOString(),
        trigger,
        summary
      };

      // 3. 保存快照文件到 Documents/Moni/classify_memory/{ledger}/{id}.md
      const snapshotPath = `${this.getLedgerDir(ledgerName)}/${snapshotId}.md`;
      const fs = FilesystemService.getInstance();
      await fs.writeFile({
        path: snapshotPath,
        data: content,
        directory: AdapterDirectory.Documents,
        encoding: AdapterEncoding.UTF8,
        recursive: true
      });

      // 4. 更新索引：添加快照 + 更新 current_snapshot_id
      const index = await this.loadIndex(ledgerName);
      index.snapshots.push(meta);
      index.current_snapshot_id = snapshotId;
      await this.saveIndex(ledgerName, index);

      // 5. GC：保留最多 30 个快照，删除"最旧的非当前快照"
      await this.gcSnapshots(ledgerName);

      console.log(`[SnapshotManager] Created snapshot ${snapshotId} for ${ledgerName}`);
      return snapshotId;
    } catch (e) {
      console.error('[SnapshotManager] Failed to create snapshot:', e);
      throw e;
    }
  }

  /**
   * GC：删除"最旧的非当前快照"
   * 保留最近 30 个快照
   */
  private static async gcSnapshots(ledgerName: string): Promise<void> {
    try {
      const index = await this.loadIndex(ledgerName);

      if (index.snapshots.length <= this.MAX_SNAPSHOTS) {
        return; // 未超限，无需 GC
      }

      // 按时间排序（最旧的在前）
      const sortedSnapshots = [...index.snapshots].sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      // 计算需要删除的数量
      const deleteCount = index.snapshots.length - this.MAX_SNAPSHOTS;
      const toDelete: SnapshotMeta[] = [];

      // 从最旧的开始选择，跳过 current_snapshot_id
      for (const snap of sortedSnapshots) {
        if (toDelete.length >= deleteCount) break;
        if (snap.id !== index.current_snapshot_id) {
          toDelete.push(snap);
        }
      }

      // 删除快照文件
      const fs = FilesystemService.getInstance();
      for (const snap of toDelete) {
        try {
          const snapPath = `${this.getLedgerDir(ledgerName)}/${snap.id}.md`;
          await fs.deleteFile({
            path: snapPath,
            directory: AdapterDirectory.Documents
          });
        } catch (e) {
          console.warn(`[SnapshotManager] Failed to delete snapshot file ${snap.id}:`, e);
        }
      }

      // 从索引中移除
      index.snapshots = index.snapshots.filter(s => !toDelete.some(d => d.id === s.id));
      await this.saveIndex(ledgerName, index);

      console.log(`[SnapshotManager] GC deleted ${toDelete.length} snapshots for ${ledgerName}`);
    } catch (e) {
      console.error('[SnapshotManager] GC failed:', e);
    }
  }

  /**
   * 获取快照列表（v6 语义）
   * @param ledgerName 账本名称
   * @returns 快照元数据列表（按时间倒序）
   */
  public static async list(ledgerName: string): Promise<SnapshotMeta[]> {
    const index = await this.loadIndex(ledgerName);
    let snapshots = [...index.snapshots];

    // 兼容历史数据：索引缺失时，从目录里的 .md 快照文件回填历史版本。
    if (snapshots.length === 0) {
      try {
        const fs = FilesystemService.getInstance();
        const entries = await fs.readdir({
          path: this.getLedgerDir(ledgerName),
          directory: AdapterDirectory.Documents
        });
        const fallbackSnapshots = entries
          .map((entry) => entry.name)
          .filter((name) => name.toLowerCase().endsWith('.md'))
          .map((name) => {
            const id = name.replace(/\.md$/i, '');
            return {
              id,
              timestamp: this.normalizeSnapshotTimestamp(undefined, undefined, id),
              trigger: 'manual' as const,
              summary: '历史版本',
            };
          });
        if (fallbackSnapshots.length > 0) {
          snapshots = fallbackSnapshots
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
          const repairedIndex: SnapshotIndex = {
            current_snapshot_id: index.current_snapshot_id || snapshots[snapshots.length - 1].id,
            snapshots,
            last_learned_example_revision: index.last_learned_example_revision
          };
          await this.saveIndex(ledgerName, repairedIndex);
        }
      } catch {
        // ignore fallback failures
      }
    }

    // 返回倒序（最新的在前）
    return [...snapshots].reverse();
  }

  /**
   * 获取当前快照 ID（v6 新增）
   * @param ledgerName 账本名称
   * @returns 当前快照 ID，无则返回空字符串
   */
  public static async getCurrentId(ledgerName: string): Promise<string> {
    const index = await this.loadIndex(ledgerName);
    return index.current_snapshot_id;
  }

  public static async getLastLearnedExampleRevision(ledgerName: string): Promise<number> {
    const index = await this.loadIndex(ledgerName);
    return index.last_learned_example_revision;
  }

  public static async setLastLearnedExampleRevision(ledgerName: string, revision: number): Promise<void> {
    const index = await this.loadIndex(ledgerName);
    index.last_learned_example_revision = Math.max(0, revision);
    await this.saveIndex(ledgerName, index);
  }

  /**
   * 读取快照内容（v6 语义）
   * @param ledgerName 账本名称
   * @param snapshotId 快照 ID
   * @returns 快照内容
   */
  public static async read(ledgerName: string, snapshotId: string): Promise<SnapshotContent | null> {
    try {
      // 1. 查找元数据
      const index = await this.loadIndex(ledgerName);
      const meta = index.snapshots.find(s => s.id === snapshotId);
      if (!meta) {
        console.warn(`[SnapshotManager] Snapshot ${snapshotId} not found`);
        return null;
      }

      // 2. 读取内容（v6：从 Documents 目录读取）
      const snapshotPath = `${this.getLedgerDir(ledgerName)}/${snapshotId}.md`;
      const fs = FilesystemService.getInstance();
      const data = await fs.readFile({
        path: snapshotPath,
        directory: AdapterDirectory.Documents,
        encoding: AdapterEncoding.UTF8
      });

      // 3. 解析内容（按行分割，保留原始格式）
      const lines = data
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
          // 兼容旧格式：移除行号前缀 "1. " 或 "1) "
          const match = line.match(/^\d+[.)]\s*(.+)$/);
          return match ? match[1] : line;
        });

      return {
        ...meta,
        content: lines
      };
    } catch (e) {
      console.error(`[SnapshotManager] Failed to read snapshot ${snapshotId}:`, e);
      return null;
    }
  }

  /**
   * 回退到指定快照（v6 语义）
   *
   * v6 变更：
   * - 只更新 current_snapshot_id 指针，不创建新快照
   * - 不再调用 MemoryManager.save()（避免循环依赖）
   * - 返回快照内容，由调用方负责写入记忆文件
   *
   * @param ledgerName 账本名称
   * @param snapshotId 要回退到的快照 ID
   * @returns 快照内容（供调用方写入记忆文件），失败返回 null
   */
  public static async rollback(ledgerName: string, snapshotId: string): Promise<string | null> {
    try {
      // 1. 读取目标快照
      const targetSnapshot = await this.read(ledgerName, snapshotId);
      if (!targetSnapshot) {
        console.error(`[SnapshotManager] Cannot rollback: snapshot ${snapshotId} not found`);
        return null;
      }

      // 2. 更新 current_snapshot_id 指针
      const index = await this.loadIndex(ledgerName);
      index.current_snapshot_id = snapshotId;
      await this.saveIndex(ledgerName, index);

      // 3. 返回快照内容（由调用方写入记忆文件）
      const content = targetSnapshot.content.join('\n');
      console.log(`[SnapshotManager] Rolled back ${ledgerName} to ${snapshotId}`);
      return content;
    } catch (e) {
      console.error('[SnapshotManager] Failed to rollback:', e);
      return null;
    }
  }

  /**
   * 验证当前记忆是否与指定快照匹配（v6 废弃）
   * v6 架构下，当前记忆始终通过 current_snapshot_id 获取，无需验证
   * 保留此方法仅为兼容性，始终返回 true
   *
   * @deprecated v6 架构下不再需要此方法
   */
  public static async verifyMatch(_ledgerName: string, _snapshotId: string): Promise<boolean> {
    console.warn('[SnapshotManager] verifyMatch() is deprecated in v6');
    return true;
  }

  /**
   * 查找当前记忆内容匹配的快照 ID（v6 废弃）
   * v6 架构下，直接使用 getCurrentId() 获取 current_snapshot_id
   *
   * @deprecated 使用 getCurrentId() 替代
   */
  public static async findMatchingSnapshot(ledgerName: string): Promise<string | null> {
    console.warn('[SnapshotManager] findMatchingSnapshot() is deprecated in v6, use getCurrentId() instead');
    return await this.getCurrentId(ledgerName);
  }

  /**
   * 删除指定快照（v6 语义）
   *
   * 规则：
   * - 不能删除 current_snapshot_id 指向的快照
   * - 删除快照文件和索引中的元数据
   *
   * @param ledgerName 账本名称
   * @param snapshotId 快照 ID
   * @returns 是否删除成功
   */
  public static async delete(ledgerName: string, snapshotId: string): Promise<boolean> {
    try {
      // 1. 读取索引
      const index = await this.loadIndex(ledgerName);

      // 2. 检查是否为当前快照
      if (index.current_snapshot_id === snapshotId) {
        console.warn(`[SnapshotManager] Cannot delete current snapshot: ${snapshotId}`);
        return false;
      }

      // 3. 检查快照是否存在
      const meta = index.snapshots.find(s => s.id === snapshotId);
      if (!meta) {
        console.warn(`[SnapshotManager] Snapshot ${snapshotId} not found`);
        return false;
      }

      // 4. 删除快照文件
      const snapshotPath = `${this.getLedgerDir(ledgerName)}/${snapshotId}.md`;
      const fs = FilesystemService.getInstance();
      try {
        await fs.deleteFile({
          path: snapshotPath,
          directory: AdapterDirectory.Documents
        });
      } catch (e) {
        console.warn(`[SnapshotManager] Failed to delete snapshot file ${snapshotId}:`, e);
        // 即使文件删除失败，也继续从索引中移除
      }

      // 5. 从索引中移除
      index.snapshots = index.snapshots.filter(s => s.id !== snapshotId);
      await this.saveIndex(ledgerName, index);

      console.log(`[SnapshotManager] Deleted snapshot ${snapshotId} for ${ledgerName}`);
      return true;
    } catch (e) {
      console.error(`[SnapshotManager] Failed to delete snapshot ${snapshotId}:`, e);
      return false;
    }
  }

  /**
   * 删除所有快照（v6 语义）
   * 谨慎使用：会删除整个账本的快照目录
   *
   * @param ledgerName 账本名称
   */
  public static async clearAll(ledgerName: string): Promise<void> {
    try {
      const ledgerDir = this.getLedgerDir(ledgerName);
      const fs = FilesystemService.getInstance();
      await fs.rmdir({
        path: ledgerDir,
        directory: AdapterDirectory.Documents,
        recursive: true
      });
      console.log(`[SnapshotManager] Cleared all snapshots for ${ledgerName}`);
    } catch (e) {
      console.warn(`[SnapshotManager] Failed to clear snapshots for ${ledgerName}:`, e);
    }
  }

  /**
   * 获取最新快照 ID（v6 废弃）
   * v6 架构下，使用 getCurrentId() 获取当前快照 ID
   *
   * @deprecated 使用 getCurrentId() 替代
   */
  public static async getLatestId(ledgerName: string): Promise<string> {
    console.warn('[SnapshotManager] getLatestId() is deprecated in v6, use getCurrentId() instead');
    return await this.getCurrentId(ledgerName);
  }
}
