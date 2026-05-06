import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterDirectory, AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
import {
  getLedgerClassifyRuntimePath,
  LEDGERS_ROOT_DIR,
} from '@system/filesystem/persistence-paths';

/**
 * 账本分类运行态里的队列任务。
 * 业务语义仍然只保留 date，enqueuedAt 仅用于工程层稳定排序。
 */
export interface StoredClassifyQueueTask {
  date: string;
  enqueuedAt: number;
}

/**
 * 分类队列指标。
 */
export interface StoredClassifyQueueMetrics {
  emptyTaskConsumedCount: number;
  lastEmptyTaskDate: string | null;
}

/**
 * 入队失败补偿。
 */
export interface StoredEnqueueRecovery {
  version: string;
  ledger: string;
  dates: string[];
  reason: string;
  updatedAt: number;
}

/**
 * 统一分类运行态文件结构。
 * confirm_recovery 的具体结构由 LedgerService 维护，这里只保留 unknown 容器。
 */
export interface ClassifyRuntimeData {
  version: string;
  revision: number;
  metrics: StoredClassifyQueueMetrics;
  queue: StoredClassifyQueueTask[];
  dirty_count_by_date: Record<string, number>;
  needs_rebuild: boolean;
  rebuild_reason: string | null;
  enqueue_recovery: StoredEnqueueRecovery | null;
  confirm_recovery: unknown | null;
}

const RUNTIME_VERSION = '1.0';

function createDefaultRuntime(): ClassifyRuntimeData {
  return {
    version: RUNTIME_VERSION,
    revision: 0,
    metrics: {
      emptyTaskConsumedCount: 0,
      lastEmptyTaskDate: null,
    },
    queue: [],
    dirty_count_by_date: {},
    needs_rebuild: false,
    rebuild_reason: null,
    enqueue_recovery: null,
    confirm_recovery: null,
  };
}

/**
 * ClassifyRuntimeStore - 统一维护账本分类运行态文件。
 *
 * 目标：
 * 1. 队列、入队补偿、确认补偿统一进入 ledgers/{ledger}/classify_runtime.json
 * 2. 让队列层、触发层、账本服务不再各自维护独立文件路径
 * 3. 当运行态整体为空时允许直接删除文件，保持沙箱干净
 */
export class ClassifyRuntimeStore {
  /**
   * 判断某个账本的运行态文件是否存在。
   */
  public static async exists(ledger: string): Promise<boolean> {
    try {
      await FilesystemService.getInstance().stat({
        path: getLedgerClassifyRuntimePath(ledger),
        directory: AdapterDirectory.Data,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 列出当前存在运行态文件的账本。
   */
  public static async listLedgers(): Promise<string[]> {
    try {
      const fs = FilesystemService.getInstance();
      const entries = await fs.readdir({
        path: LEDGERS_ROOT_DIR,
        directory: AdapterDirectory.Data,
      });
      const ledgers: string[] = [];
      for (const entry of entries) {
        if (entry.type !== 'directory') {
          continue;
        }
        const exists = await this.exists(entry.name);
        if (exists) {
          ledgers.push(entry.name);
        }
      }
      return ledgers;
    } catch {
      return [];
    }
  }

  /**
   * 读取并归一化账本运行态。
   * 文件不存在时返回空运行态，而不是抛错。
   */
  public static async load(ledger: string): Promise<ClassifyRuntimeData> {
    /**
     * “文件不存在”和“文件损坏/读取失败”必须严格区分：
     * - 不存在：说明当前账本本来就没有运行态文件，应直接返回真正的空运行态
     * - 读取失败/JSON 损坏：说明旧索引不可信，才需要标记 needs_rebuild
     *
     * 若把两者混成同一个 fallback，就会在“删除运行态文件”后再次被补写回去，
     * 进而导致账本目录无法彻底删空。
     */
    const exists = await this.exists(ledger);
    if (!exists) {
      return createDefaultRuntime();
    }

    try {
      const fs = FilesystemService.getInstance();
      const raw = await fs.readFile({
        path: getLedgerClassifyRuntimePath(ledger),
        directory: AdapterDirectory.Data,
        encoding: AdapterEncoding.UTF8,
      });
      return this.normalize(JSON.parse(raw), ledger);
    } catch {
      return {
        ...createDefaultRuntime(),
        /**
         * 无法读取或解析运行态文件时，不继续盲信旧索引。
         * 这里直接标记为需要重建，让上层在真正消费前先按账本真相恢复。
         */
        needs_rebuild: true,
        rebuild_reason: 'runtime_load_failed'
      };
    }
  }

  /**
   * 保存账本运行态。
   */
  public static async save(ledger: string, runtime: ClassifyRuntimeData): Promise<void> {
    await FilesystemService.getInstance().writeFile({
      path: getLedgerClassifyRuntimePath(ledger),
      directory: AdapterDirectory.Data,
      encoding: AdapterEncoding.UTF8,
      recursive: true,
      data: JSON.stringify(this.normalize(runtime, ledger), null, 2),
    });
  }

  /**
   * 删除账本运行态文件。
   */
  public static async delete(ledger: string): Promise<void> {
    try {
      /**
       * 运行态文件本身就是可选文件。
       * 删除前先做一次存在性探测，避免“本来就不存在”的正常分支在调试测试中制造 404 噪音。
       */
      const exists = await this.exists(ledger);
      if (!exists) {
        return;
      }
      await FilesystemService.getInstance().deleteFile({
        path: getLedgerClassifyRuntimePath(ledger),
        directory: AdapterDirectory.Data,
      });
    } catch {
      return;
    }
  }

  /**
   * 仅当队列、补偿都为空时才允许删除运行态文件。
   */
  public static async saveOrDeleteIfEmpty(ledger: string, runtime: ClassifyRuntimeData): Promise<void> {
    const normalized = this.normalize(runtime, ledger);
    const shouldDelete =
      normalized.queue.length === 0 &&
      Object.keys(normalized.dirty_count_by_date).length === 0 &&
      !normalized.needs_rebuild &&
      !normalized.rebuild_reason &&
      !normalized.enqueue_recovery &&
      !normalized.confirm_recovery &&
      normalized.metrics.emptyTaskConsumedCount === 0 &&
      !normalized.metrics.lastEmptyTaskDate;
    if (shouldDelete) {
      await this.delete(ledger);
      return;
    }
    await this.save(ledger, normalized);
  }

  /**
   * 归一化运行态结构。
   */
  private static normalize(raw: unknown, ledger: string): ClassifyRuntimeData {
    if (!raw || typeof raw !== 'object') {
      return createDefaultRuntime();
    }

    const candidate = raw as Partial<ClassifyRuntimeData>;
    const queue = Array.isArray(candidate.queue)
      ? candidate.queue
          .filter((item): item is StoredClassifyQueueTask => {
            return Boolean(item) && typeof item.date === 'string' && item.date.length > 0;
          })
          .map((item) => ({
            date: item.date,
            enqueuedAt: Number.isFinite(item.enqueuedAt) ? item.enqueuedAt : Date.now(),
          }))
      : [];

    const dirtyCountByDateRaw = candidate.dirty_count_by_date;
    const dirtyCountByDate =
      dirtyCountByDateRaw && typeof dirtyCountByDateRaw === 'object'
        ? Object.fromEntries(
            Object.entries(dirtyCountByDateRaw)
              .filter(([date, count]) => {
                return (
                  typeof date === 'string' &&
                  date.length > 0 &&
                  typeof count === 'number' &&
                  Number.isInteger(count) &&
                  count > 0
                );
              })
              .map(([date, count]) => [date, count as number])
          )
        : {};

    /**
     * 老版本运行态没有 dirty_count_by_date。
     * 只要发现“旧 queue 非空但没有脏索引”，就要求上层在消费前先重建。
     */
    const missingDirtyIndex = Object.keys(dirtyCountByDate).length === 0 && queue.length > 0;
    const needsRebuild = candidate.needs_rebuild === true || missingDirtyIndex;
    const rebuildReason =
      typeof candidate.rebuild_reason === 'string' && candidate.rebuild_reason.length > 0
        ? candidate.rebuild_reason
        : missingDirtyIndex
          ? 'dirty_index_missing'
          : null;

    const enqueueRecoveryRaw = candidate.enqueue_recovery as Partial<StoredEnqueueRecovery> | null | undefined;
    const enqueueRecovery =
      enqueueRecoveryRaw && Array.isArray(enqueueRecoveryRaw.dates)
        ? {
            version: typeof enqueueRecoveryRaw.version === 'string' ? enqueueRecoveryRaw.version : RUNTIME_VERSION,
            ledger,
            dates: enqueueRecoveryRaw.dates.filter((date): date is string => typeof date === 'string' && date.length > 0),
            reason: typeof enqueueRecoveryRaw.reason === 'string' ? enqueueRecoveryRaw.reason : 'unknown',
            updatedAt:
              typeof enqueueRecoveryRaw.updatedAt === 'number' && Number.isFinite(enqueueRecoveryRaw.updatedAt)
                ? enqueueRecoveryRaw.updatedAt
                : Date.now(),
          }
        : null;

    return {
      version: typeof candidate.version === 'string' ? candidate.version : RUNTIME_VERSION,
      revision: Number.isFinite(candidate.revision) ? candidate.revision as number : 0,
      metrics: {
        emptyTaskConsumedCount:
          typeof candidate.metrics?.emptyTaskConsumedCount === 'number' && candidate.metrics.emptyTaskConsumedCount >= 0
            ? candidate.metrics.emptyTaskConsumedCount
            : 0,
        lastEmptyTaskDate:
          typeof candidate.metrics?.lastEmptyTaskDate === 'string' && candidate.metrics.lastEmptyTaskDate.length > 0
            ? candidate.metrics.lastEmptyTaskDate
            : null,
      },
      queue,
      dirty_count_by_date: dirtyCountByDate,
      needs_rebuild: needsRebuild,
      rebuild_reason: rebuildReason,
      enqueue_recovery: enqueueRecovery,
      confirm_recovery: candidate.confirm_recovery ?? null,
    };
  }
}
