import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterDirectory, AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
import type { LedgerMemory } from '@shared/types/metadata';
import { classifyQueue } from './ClassifyQueue';
import { normalizeToDateKey, uniqueSortedDateKeys } from './DateNormalizer';

interface QueueRecoveryData {
  version: string;
  ledger: string;
  dates: string[];
  reason: string;
  updatedAt: number;
}

interface EnqueueResult {
  attempted: number;
  enqueued: number;
  failedDates: string[];
}

const RECOVERY_DIR = 'classify_queue_recovery';
const RECOVERY_VERSION = '1.0';

export class ClassifyTrigger {
  private static instance: ClassifyTrigger;

  public static getInstance(): ClassifyTrigger {
    if (!ClassifyTrigger.instance) {
      ClassifyTrigger.instance = new ClassifyTrigger();
    }
    return ClassifyTrigger.instance;
  }

  private getRecoveryPath(ledger: string): string {
    return `${RECOVERY_DIR}/${ledger}.json`;
  }

  private async readRecovery(ledger: string): Promise<QueueRecoveryData | null> {
    try {
      const fs = FilesystemService.getInstance();
      const parsed = JSON.parse(await fs.readFile({
        path: this.getRecoveryPath(ledger),
        directory: AdapterDirectory.Data,
        encoding: AdapterEncoding.UTF8
      })) as QueueRecoveryData;
      if (!Array.isArray(parsed.dates)) {
        return null;
      }
      return {
        version: parsed.version || RECOVERY_VERSION,
        ledger: parsed.ledger || ledger,
        dates: uniqueSortedDateKeys(parsed.dates),
        reason: parsed.reason || 'unknown',
        updatedAt: Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : Date.now()
      };
    } catch {
      return null;
    }
  }

  private async writeRecovery(data: QueueRecoveryData): Promise<void> {
    const fs = FilesystemService.getInstance();
    await fs.writeFile({
      path: this.getRecoveryPath(data.ledger),
      directory: AdapterDirectory.Data,
      encoding: AdapterEncoding.UTF8,
      recursive: true,
      data: JSON.stringify(data, null, 2)
    });
  }

  private async clearRecovery(ledger: string): Promise<void> {
    try {
      const fs = FilesystemService.getInstance();
      await fs.deleteFile({
        path: this.getRecoveryPath(ledger),
        directory: AdapterDirectory.Data
      });
    } catch {
      return;
    }
  }

  private async mergeRecoveryDates(ledger: string, failedDates: string[], reason: string): Promise<void> {
    if (failedDates.length === 0) {
      return;
    }
    const previous = await this.readRecovery(ledger);
    const mergedDates = uniqueSortedDateKeys([...(previous?.dates || []), ...failedDates]);
    await this.writeRecovery({
      version: RECOVERY_VERSION,
      ledger,
      dates: mergedDates,
      reason: previous?.reason || reason,
      updatedAt: Date.now()
    });
    console.error(`[ClassifyTrigger] Enqueue failed, recovery persisted for ${ledger}:`, mergedDates);
  }

  private async enqueueDates(ledger: string, dates: string[]): Promise<EnqueueResult> {
    /**
     * v5.1 收口：队列元素语义仅 { date }。
     * 触发层只负责把“应重跑的日期”入队，不再携带任务类型信息。
     */
    const uniqueDates = uniqueSortedDateKeys(dates);
    let enqueued = 0;
    const failedDates: string[] = [];
    for (const date of uniqueDates) {
      try {
        await classifyQueue.enqueue({ ledger, date });
        enqueued += 1;
      } catch {
        failedDates.push(date);
      }
    }
    return {
      attempted: uniqueDates.length,
      enqueued,
      failedDates
    };
  }

  private collectCsvDirtyDates(memory: LedgerMemory, importedTxIds: string[]): string[] {
    const dateValues: string[] = [];
    for (const txId of importedTxIds) {
      const record = memory.records[txId];
      if (!record) {
        continue;
      }
      const uncategorized = !record.category || record.category === 'uncategorized';
      if (record.is_verified || !uncategorized) {
        continue;
      }
      dateValues.push(normalizeToDateKey(record.time));
    }
    return uniqueSortedDateKeys(dateValues);
  }

  public async enqueueCsvImport(ledger: string, memory: LedgerMemory, importedTxIds: string[]): Promise<EnqueueResult> {
    /**
     * CSV 自动触发：仅将“未锁定且未分类”的交易日期入队。
     * 如果入队失败，失败日期会落盘到 recovery，避免静默丢任务。
     */
    const dirtyDates = this.collectCsvDirtyDates(memory, importedTxIds);
    const result = await this.enqueueDates(ledger, dirtyDates);
    if (result.failedDates.length > 0) {
      await this.mergeRecoveryDates(ledger, result.failedDates, 'csv_import');
    } else if (result.attempted > 0) {
      await this.clearRecoveredDates(ledger, dirtyDates);
    }
    return result;
  }

  public async enqueueConfirmedDates(ledger: string, dates: string[], reason: string): Promise<EnqueueResult> {
    /**
     * 用户确认触发：调用方已完成前置改写并落盘，这里仅负责日期入队与恢复补偿。
     */
    const result = await this.enqueueDates(ledger, dates);
    if (result.failedDates.length > 0) {
      await this.mergeRecoveryDates(ledger, result.failedDates, reason);
    } else if (result.attempted > 0) {
      await this.clearRecoveredDates(ledger, dates);
    }
    return result;
  }

  private async clearRecoveredDates(ledger: string, resolvedDates: string[]): Promise<void> {
    const recovery = await this.readRecovery(ledger);
    if (!recovery) {
      return;
    }
    const resolvedSet = new Set(uniqueSortedDateKeys(resolvedDates));
    const remaining = recovery.dates.filter(date => !resolvedSet.has(date));
    if (remaining.length === 0) {
      await this.clearRecovery(ledger);
      return;
    }
    await this.writeRecovery({
      ...recovery,
      dates: remaining,
      updatedAt: Date.now()
    });
  }

  public async recoverPending(ledger: string): Promise<EnqueueResult> {
    const recovery = await this.readRecovery(ledger);
    if (!recovery || recovery.dates.length === 0) {
      return { attempted: 0, enqueued: 0, failedDates: [] };
    }
    const replay = await this.enqueueDates(ledger, recovery.dates);
    if (replay.failedDates.length === 0) {
      await this.clearRecovery(ledger);
    } else {
      await this.mergeRecoveryDates(ledger, replay.failedDates, recovery.reason);
    }
    return replay;
  }

  public async clearRecoveryByLedger(ledger: string): Promise<void> {
    await this.clearRecovery(ledger);
  }

  public async renameRecoveryLedger(oldName: string, newName: string): Promise<void> {
    const recovery = await this.readRecovery(oldName);
    if (!recovery) {
      return;
    }
    await this.writeRecovery({
      ...recovery,
      ledger: newName,
      updatedAt: Date.now()
    });
    await this.clearRecovery(oldName);
  }
}

export const classifyTrigger = ClassifyTrigger.getInstance();
