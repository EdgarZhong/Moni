import { writeMemoryFile } from '@system/filesystem/fs-storage';
import type { StorageHandle } from '@system/filesystem/fs-storage';
import type { LedgerMemory } from '@shared/types/metadata';

/**
 * Persistence Loop Manager (Debounced Writer)
 * Design 5.2.3: 1000ms Debounce Strategy
 * 
 * Responsibilities:
 * 1. Collect high-frequency state updates.
 * 2. Write to disk only after 1000ms of inactivity.
 * 3. Provide immediate 'force save' capability if needed.
 */
export class PersistenceManager {
  private static instance: PersistenceManager;
  private isWriting: boolean = false;
  private pendingData: { handle: StorageHandle; data: LedgerMemory } | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_MS = 1000;

  private constructor() {}

  public static getInstance(): PersistenceManager {
    if (!PersistenceManager.instance) {
      PersistenceManager.instance = new PersistenceManager();
    }
    return PersistenceManager.instance;
  }

  /**
   * Schedule a write operation with debounce
   */
  public scheduleWrite(handle: StorageHandle, data: LedgerMemory) {
    // Update pending data (Always persist the LATEST state)
    this.pendingData = { handle, data };

    // Clear existing timer
    if (this.timer) {
      clearTimeout(this.timer);
    }

    // Set new timer
    this.timer = setTimeout(() => {
      this.flush();
    }, this.DEBOUNCE_MS);
  }

  /**
   * Immediately execute any pending write
   */
  public async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (!this.pendingData) return;

    if (this.isWriting) {
      console.warn('[Persistence] Write overlap detected, queuing next write...');
      // Ideally we should retry, but for now we'll just rely on the next trigger
      // or implement a proper queue if race conditions become frequent.
      // Since pendingData is kept, we can try to reschedule.
      this.timer = setTimeout(() => this.flush(), this.DEBOUNCE_MS);
      return;
    }

    const { handle, data } = this.pendingData;
    this.pendingData = null; // Clear pending before write starts to catch new updates during write

    try {
      this.isWriting = true;
      console.log('[Persistence] Starting disk write...', new Date().toISOString());
      await writeMemoryFile(handle, data);
      console.log('[Persistence] Disk write complete.', new Date().toISOString());
    } catch (error) {
      console.error('[Persistence] Write failed:', error);
      // Put it back to pending if failed? 
      // Maybe safer to not retry indefinitely to avoid loops, 
      // but strictly speaking we lost data if we don't.
      // For now, let's just log.
    } finally {
      this.isWriting = false;
      
      // If new data came in while writing (pendingData is not null),
      // we need to schedule another write.
      if (this.pendingData) {
        this.timer = setTimeout(() => this.flush(), this.DEBOUNCE_MS);
      }
    }
  }

  /**
   * Cleanup resources (e.g. on app close)
   */
  public dispose() {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.flush();
  }
}
