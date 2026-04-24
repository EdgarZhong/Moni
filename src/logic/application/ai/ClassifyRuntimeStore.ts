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
    try {
      const fs = FilesystemService.getInstance();
      const raw = await fs.readFile({
        path: getLedgerClassifyRuntimePath(ledger),
        directory: AdapterDirectory.Data,
        encoding: AdapterEncoding.UTF8,
      });
      return this.normalize(JSON.parse(raw), ledger);
    } catch {
      return createDefaultRuntime();
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
      enqueue_recovery: enqueueRecovery,
      confirm_recovery: candidate.confirm_recovery ?? null,
    };
  }
}
