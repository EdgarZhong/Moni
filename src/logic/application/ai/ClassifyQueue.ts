/**
 * ClassifyQueue - 分类任务队列
 *
 * 职责：
 * 1. 管理分类任务的入队/出队
 * 2. 持久化到 ledgers/{ledger}/classify_runtime.json（按账本隔离）
 * 3. 任务去重（仅按 date 语义）
 * 4. App 重启后恢复队列状态
 */

import { ClassifyRuntimeStore } from './ClassifyRuntimeStore';

/**
 * 分类任务结构
 */
export interface ClassifyTask {
  /** 账本名称 */
  ledger: string;
  /** 日期 (YYYY-MM-DD) */
  date: string;
  /** 入队时间戳 */
  enqueuedAt: number;
}

interface LedgerQueueTask {
  date: string;
  enqueuedAt: number;
}

interface LedgerQueueMetrics {
  emptyTaskConsumedCount: number;
  lastEmptyTaskDate: string | null;
}

export interface QueuePeekSnapshot {
  task: ClassifyTask;
  revision: number;
}

/**
 * 队列快照。
 * 这里保留 revision，是为了让消费端能在多天批处理成功后做一次 CAS 移除，
 * 避免处理期间若有新的生产动作插入同日期任务，被当前批次误删。
 */
export interface QueueLedgerSnapshot {
  tasks: ClassifyTask[];
  revision: number;
}

export interface QueueMetrics {
  ledger: string;
  revision: number;
  emptyTaskConsumedCount: number;
  lastEmptyTaskDate: string | null;
}

/**
 * 分类任务队列管理器
 */
export class ClassifyQueue {
  private static instance: ClassifyQueue;
  private ledgerTasks = new Map<string, LedgerQueueTask[]>();
  private loadedLedgers = new Set<string>();
  private ledgerRevisions = new Map<string, number>();
  private ledgerMetrics = new Map<string, LedgerQueueMetrics>();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): ClassifyQueue {
    if (!ClassifyQueue.instance) {
      ClassifyQueue.instance = new ClassifyQueue();
    }
    return ClassifyQueue.instance;
  }

  // ============================================
  // 队列持久化（按账本）
  // ============================================

  /**
   * 获取当前存在队列文件的账本名列表
   */
  private async listLedgersWithQueueFile(): Promise<string[]> {
    return ClassifyRuntimeStore.listLedgers();
  }

  /**
   * 加载指定账本队列
   */
  private async loadLedger(ledger: string): Promise<void> {
    if (this.loadedLedgers.has(ledger)) return;

    try {
      const data = await ClassifyRuntimeStore.load(ledger);
      /**
       * v5.1 收口：队列任务业务语义仅保留 { date }。
       * 这里对历史数据做向后兼容迁移，丢弃旧的 type/tag 字段。
       */
      const normalizedTasks = Array.isArray(data.queue)
        ? data.queue
            .filter(task => typeof task?.date === 'string' && task.date.length > 0)
            .map(task => ({
              date: task.date,
              enqueuedAt: Number.isFinite(task.enqueuedAt) ? task.enqueuedAt : Date.now()
            }))
        : [];
      this.ledgerTasks.set(ledger, normalizedTasks);
      this.ledgerRevisions.set(ledger, Number.isFinite(data.revision) ? data.revision : 0);
      this.ledgerMetrics.set(ledger, {
        emptyTaskConsumedCount: data.metrics.emptyTaskConsumedCount ?? 0,
        lastEmptyTaskDate: data.metrics.lastEmptyTaskDate ?? null
      });
      console.log(
        `[ClassifyQueue] Loaded ${ledger}: ${normalizedTasks.length} tasks, rev=${this.ledgerRevisions.get(ledger)}`
      );
    } catch {
      this.ledgerTasks.set(ledger, []);
      this.ledgerRevisions.set(ledger, 0);
      this.ledgerMetrics.set(ledger, {
        emptyTaskConsumedCount: 0,
        lastEmptyTaskDate: null
      });
      console.log(`[ClassifyQueue] No existing queue for ${ledger}, starting fresh`);
    }

    this.loadedLedgers.add(ledger);
  }

  /**
   * 保存指定账本队列
   */
  private async saveLedger(ledger: string, options?: { bumpRevision?: boolean }): Promise<void> {
    const currentRevision = this.ledgerRevisions.get(ledger) ?? 0;
    const revision = options?.bumpRevision ? currentRevision + 1 : currentRevision;
    this.ledgerRevisions.set(ledger, revision);
    const metrics = this.ledgerMetrics.get(ledger) || {
      emptyTaskConsumedCount: 0,
      lastEmptyTaskDate: null
    };
    this.ledgerMetrics.set(ledger, metrics);
    const tasks = this.ledgerTasks.get(ledger) || [];
    try {
      const runtime = await ClassifyRuntimeStore.load(ledger);
      await ClassifyRuntimeStore.saveOrDeleteIfEmpty(ledger, {
        ...runtime,
        revision,
        metrics,
        queue: tasks
      });
    } catch (e) {
      console.error(`[ClassifyQueue] Failed to save queue for ${ledger}:`, e);
      throw e;
    }
  }

  /**
   * 删除指定账本队列文件
   */
  private async deleteLedgerFile(ledger: string): Promise<void> {
    await ClassifyRuntimeStore.delete(ledger);
  }

  /**
   * 确保指定账本队列已加载
   */
  private async ensureLedgerLoaded(ledger: string): Promise<void> {
    if (!this.loadedLedgers.has(ledger)) {
      await this.loadLedger(ledger);
    }
  }

  private getCurrentRevision(ledger: string): number {
    return this.ledgerRevisions.get(ledger) ?? 0;
  }

  private async hasLedgerQueueFile(ledger: string): Promise<boolean> {
    return ClassifyRuntimeStore.exists(ledger);
  }

  /**
   * 将账本内任务映射为对外结构
   */
  private toPublicTasks(ledger: string, tasks: LedgerQueueTask[]): ClassifyTask[] {
    return tasks.map(task => ({
      ledger,
      date: task.date,
      enqueuedAt: task.enqueuedAt
    }));
  }

  /**
   * 公共加载接口
   * - 传 ledger：仅加载指定账本
   * - 不传 ledger：加载当前存在队列文件的所有账本
   */
  public async load(ledger?: string): Promise<void> {
    if (ledger) {
      await this.ensureLedgerLoaded(ledger);
      return;
    }
    const ledgers = await this.listLedgersWithQueueFile();
    for (const ledgerName of ledgers) {
      await this.ensureLedgerLoaded(ledgerName);
    }
  }

  // ============================================
  // 队列操作
  // ============================================

  /**
   * 添加任务到队列
   *
   * 去重规则：
   * - 同一账本同一天视为重复
   * - 队列元素业务语义仅 { date }，重复日期直接忽略
   *
   * @param task 要添加的任务
   * @returns 是否成功添加
   */
  public async enqueue(task: Omit<ClassifyTask, 'enqueuedAt'>): Promise<boolean> {
    // 防御性校验：日期不能为空，避免创建无意义任务
    if (!task.date || task.date.trim() === '') {
      console.warn(`[ClassifyQueue] Rejected enqueue for ${task.ledger}: empty date`);
      return false;
    }

    await this.ensureLedgerLoaded(task.ledger);

    const ledgerQueue = this.ledgerTasks.get(task.ledger)!;
    const newTask: LedgerQueueTask = {
      date: task.date,
      enqueuedAt: Date.now()
    };

    const existingIndex = ledgerQueue.findIndex(t => t.date === task.date);

    if (existingIndex === -1) {
      ledgerQueue.push(newTask);
      await this.saveLedger(task.ledger, { bumpRevision: true });
      console.log(`[ClassifyQueue] Enqueued date task for ${task.ledger}/${task.date}`);
      return true;
    }

    // v5.1 收口：同日任务已存在则忽略，不再进行任务类型升级
    console.log(`[ClassifyQueue] Ignored duplicate date task for ${task.ledger}/${task.date}`);
    return false;
  }

  /**
   * 取出并移除指定账本的队首任务
   * @param ledger 账本名称
   * @returns 队首任务，队列为空时返回 null
   */
  public async dequeue(ledger: string): Promise<ClassifyTask | null> {
    await this.ensureLedgerLoaded(ledger);
    const ledgerQueue = this.ledgerTasks.get(ledger)!;

    if (ledgerQueue.length === 0) {
      return null;
    }

    const task = ledgerQueue.shift()!;
    await this.saveLedger(ledger, { bumpRevision: true });
    console.log(`[ClassifyQueue] Dequeued date task for ${ledger}/${task.date}`);
    return {
      ledger,
      date: task.date,
      enqueuedAt: task.enqueuedAt
    };
  }

  /**
   * 查看指定账本队首任务（不移除）
   * @param ledger 账本名称
   * @returns 队首任务，队列为空时返回 null
   */
  public async peek(ledger: string): Promise<ClassifyTask | null> {
    await this.ensureLedgerLoaded(ledger);
    const ledgerQueue = this.ledgerTasks.get(ledger)!;
    if (ledgerQueue.length === 0) return null;
    const task = ledgerQueue[0];
    return {
      ledger,
      date: task.date,
      enqueuedAt: task.enqueuedAt
    };
  }

  public async peekWithRevision(ledger: string): Promise<QueuePeekSnapshot | null> {
    const task = await this.peek(ledger);
    if (!task) {
      return null;
    }
    return {
      task,
      revision: this.getCurrentRevision(ledger)
    };
  }

  /**
   * 获取待处理任务
   * - 传 ledger：获取指定账本任务
   * - 不传 ledger：聚合所有账本任务
   */
  public async getPending(ledger?: string): Promise<ClassifyTask[]> {
    if (ledger) {
      await this.ensureLedgerLoaded(ledger);
      return this.toPublicTasks(ledger, [...(this.ledgerTasks.get(ledger) || [])]);
    }

    const fileLedgers = await this.listLedgersWithQueueFile();
    const allLedgers = Array.from(new Set([...fileLedgers, ...this.loadedLedgers]));
    const allTasks: ClassifyTask[] = [];
    for (const ledgerName of allLedgers) {
      await this.ensureLedgerLoaded(ledgerName);
      allTasks.push(...this.toPublicTasks(ledgerName, this.ledgerTasks.get(ledgerName) || []));
    }
    return allTasks;
  }

  /**
   * 获取指定账本的“任务列表 + revision”快照。
   * 消费端会基于这个快照做范围过滤和倒序挑批次，
   * 因此这里刻意不改变底层存储顺序，只返回当前真实内容。
   */
  public async getPendingWithRevision(ledger: string): Promise<QueueLedgerSnapshot> {
    await this.ensureLedgerLoaded(ledger);
    return {
      tasks: this.toPublicTasks(ledger, [...(this.ledgerTasks.get(ledger) || [])]),
      revision: this.getCurrentRevision(ledger)
    };
  }

  /**
   * 移除指定任务
   * @param ledger 账本名称
   * @param date 日期
   * @returns 是否成功移除
   */
  public async remove(ledger: string, date: string): Promise<boolean> {
    await this.ensureLedgerLoaded(ledger);
    const ledgerQueue = this.ledgerTasks.get(ledger)!;
    const initialLength = ledgerQueue.length;
    this.ledgerTasks.set(
      ledger,
      ledgerQueue.filter(t => t.date !== date)
    );

    if ((this.ledgerTasks.get(ledger) || []).length !== initialLength) {
      await this.saveLedger(ledger, { bumpRevision: true });
      console.log(`[ClassifyQueue] Removed task for ${ledger}/${date}`);
      return true;
    }

    return false;
  }

  public async removeIfRevisionMatch(ledger: string, date: string, expectedRevision: number): Promise<boolean> {
    await this.ensureLedgerLoaded(ledger);
    const currentRevision = this.getCurrentRevision(ledger);
    if (currentRevision !== expectedRevision) {
      console.warn(
        `[ClassifyQueue] Skip remove for ${ledger}/${date}: revision changed ${currentRevision} !== ${expectedRevision}`
      );
      return false;
    }

    const ledgerQueue = this.ledgerTasks.get(ledger)!;
    const initialLength = ledgerQueue.length;
    this.ledgerTasks.set(
      ledger,
      ledgerQueue.filter(t => t.date !== date)
    );
    if ((this.ledgerTasks.get(ledger) || []).length === initialLength) {
      return false;
    }
    await this.saveLedger(ledger, { bumpRevision: true });
    console.log(`[ClassifyQueue] CAS removed task for ${ledger}/${date} @rev=${expectedRevision}`);
    return true;
  }

  /**
   * 在 revision 匹配时批量移除多个日期任务。
   * 这个接口专门服务“多天一批”的消费模型：
   * - 生产端仍然逐天入队
   * - 消费端可以一次处理多天
   * - 成功后再用同一个 revision 一次性清掉本批日期
   */
  public async removeBatchIfRevisionMatch(
    ledger: string,
    dates: string[],
    expectedRevision: number
  ): Promise<boolean> {
    await this.ensureLedgerLoaded(ledger);
    const currentRevision = this.getCurrentRevision(ledger);
    if (currentRevision !== expectedRevision) {
      console.warn(
        `[ClassifyQueue] Skip batch remove for ${ledger}: revision changed ${currentRevision} !== ${expectedRevision}`
      );
      return false;
    }

    const dateSet = new Set(dates.filter((date) => typeof date === 'string' && date.length > 0));
    if (dateSet.size === 0) {
      return true;
    }

    const ledgerQueue = this.ledgerTasks.get(ledger)!;
    const nextQueue = ledgerQueue.filter((task) => !dateSet.has(task.date));
    if (nextQueue.length === ledgerQueue.length) {
      return false;
    }

    this.ledgerTasks.set(ledger, nextQueue);
    await this.saveLedger(ledger, { bumpRevision: true });
    console.log(`[ClassifyQueue] CAS removed ${dateSet.size} tasks for ${ledger} @rev=${expectedRevision}`);
    return true;
  }

  /**
   * 清空队列
   * - 传 ledger：清空指定账本队列
   * - 不传 ledger：清空所有账本队列
   */
  public async clear(ledger?: string): Promise<void> {
    if (ledger) {
      await this.ensureLedgerLoaded(ledger);
      this.ledgerTasks.set(ledger, []);
      await this.saveLedger(ledger, { bumpRevision: true });
      console.log(`[ClassifyQueue] Cleared queue for ${ledger}`);
      return;
    }

    const fileLedgers = await this.listLedgersWithQueueFile();
    const allLedgers = Array.from(new Set([...fileLedgers, ...this.loadedLedgers]));
    for (const ledgerName of allLedgers) {
      this.ledgerTasks.set(ledgerName, []);
      await this.deleteLedgerFile(ledgerName);
      this.ledgerRevisions.delete(ledgerName);
      this.ledgerMetrics.delete(ledgerName);
    }
    this.ledgerTasks.clear();
    this.loadedLedgers.clear();
    this.ledgerRevisions.clear();
    this.ledgerMetrics.clear();
    console.log('[ClassifyQueue] Cleared all ledger queues');
  }

  /**
   * 获取队列长度
   */
  public async size(ledger?: string): Promise<number> {
    if (ledger) {
      await this.ensureLedgerLoaded(ledger);
      return (this.ledgerTasks.get(ledger) || []).length;
    }
    const pending = await this.getPending();
    return pending.length;
  }

  /**
   * 检查队列是否为空
   */
  public async isEmpty(ledger?: string): Promise<boolean> {
    return (await this.size(ledger)) === 0;
  }

  // ============================================
  // 批量操作
  // ============================================

  /**
   * 批量入队
   * @param tasks 任务列表
   * @returns 成功添加的任务数量
   */
  public async enqueueBatch(tasks: Omit<ClassifyTask, 'enqueuedAt'>[]): Promise<number> {
    let added = 0;
    for (const task of tasks) {
      const success = await this.enqueue(task);
      if (success) added++;
    }
    return added;
  }

  /**
   * 移除指定账本的所有任务
   * @param ledger 账本名称
   * @returns 移除的任务数量
   */
  public async removeByLedger(ledger: string): Promise<number> {
    await this.ensureLedgerLoaded(ledger);
    const removedCount = (this.ledgerTasks.get(ledger) || []).length;
    const fileExists = await this.hasLedgerQueueFile(ledger);

    if (removedCount > 0 || fileExists) {
      await this.deleteLedgerFile(ledger);
      this.ledgerTasks.delete(ledger);
      this.loadedLedgers.delete(ledger);
      this.ledgerRevisions.delete(ledger);
      this.ledgerMetrics.delete(ledger);
      console.log(`[ClassifyQueue] Removed ${removedCount} tasks for ledger ${ledger}`);
    }

    return removedCount;
  }

  /**
   * 重命名账本的所有任务
   * @param oldName 旧账本名称
   * @param newName 新账本名称
   * @returns 更新的任务数量
   */
  public async renameLedger(oldName: string, newName: string): Promise<number> {
    if (oldName === newName) return 0;

    await this.ensureLedgerLoaded(oldName);
    await this.ensureLedgerLoaded(newName);
    const oldFileExists = await this.hasLedgerQueueFile(oldName);

    const oldTasks = this.ledgerTasks.get(oldName) || [];
    const newTasks = this.ledgerTasks.get(newName) || [];
    const oldRevision = this.ledgerRevisions.get(oldName) ?? 0;
    const newRevision = this.ledgerRevisions.get(newName) ?? 0;
    const oldMetrics = this.ledgerMetrics.get(oldName) || {
      emptyTaskConsumedCount: 0,
      lastEmptyTaskDate: null
    };
    const newMetrics = this.ledgerMetrics.get(newName) || {
      emptyTaskConsumedCount: 0,
      lastEmptyTaskDate: null
    };
    if (oldTasks.length === 0 && !oldFileExists) return 0;

    const mergedByDate = new Map<string, LedgerQueueTask>();
    for (const task of newTasks) {
      mergedByDate.set(task.date, task);
    }
    for (const oldTask of oldTasks) {
      const existing = mergedByDate.get(oldTask.date);
      if (!existing) {
        mergedByDate.set(oldTask.date, oldTask);
        continue;
      }
      /**
       * v5.1 收口：同日冲突时不再比较任务类型优先级，
       * 统一保留更早入队的任务，保证队列顺序稳定。
       */
      if (oldTask.enqueuedAt < existing.enqueuedAt) {
        mergedByDate.set(oldTask.date, oldTask);
      }
    }

    const mergedTasks = Array.from(mergedByDate.values()).sort((a, b) => a.enqueuedAt - b.enqueuedAt);
    this.ledgerTasks.set(newName, mergedTasks);
    this.ledgerMetrics.set(newName, {
      emptyTaskConsumedCount: newMetrics.emptyTaskConsumedCount + oldMetrics.emptyTaskConsumedCount,
      lastEmptyTaskDate: [newMetrics.lastEmptyTaskDate, oldMetrics.lastEmptyTaskDate]
        .filter(Boolean)
        .sort()
        .pop() || null
    });
    this.ledgerRevisions.set(newName, Math.max(newRevision, oldRevision));
    await this.saveLedger(newName, { bumpRevision: true });

    await this.deleteLedgerFile(oldName);
    this.ledgerTasks.delete(oldName);
    this.loadedLedgers.delete(oldName);
    this.ledgerRevisions.delete(oldName);
    this.ledgerMetrics.delete(oldName);

    const updatedCount = oldTasks.length;
    if (updatedCount > 0) {
      console.log(`[ClassifyQueue] Renamed ${updatedCount} tasks from ${oldName} to ${newName}`);
    }
    return updatedCount;
  }

  public async incrementEmptyTaskConsumed(ledger: string, date: string): Promise<number> {
    await this.ensureLedgerLoaded(ledger);
    const metrics = this.ledgerMetrics.get(ledger) || {
      emptyTaskConsumedCount: 0,
      lastEmptyTaskDate: null
    };
    const next: LedgerQueueMetrics = {
      emptyTaskConsumedCount: metrics.emptyTaskConsumedCount + 1,
      lastEmptyTaskDate: date
    };
    this.ledgerMetrics.set(ledger, next);
    await this.saveLedger(ledger, { bumpRevision: true });
    return next.emptyTaskConsumedCount;
  }

  public async getMetrics(ledger: string): Promise<QueueMetrics> {
    await this.ensureLedgerLoaded(ledger);
    const metrics = this.ledgerMetrics.get(ledger) || {
      emptyTaskConsumedCount: 0,
      lastEmptyTaskDate: null
    };
    return {
      ledger,
      revision: this.getCurrentRevision(ledger),
      emptyTaskConsumedCount: metrics.emptyTaskConsumedCount,
      lastEmptyTaskDate: metrics.lastEmptyTaskDate
    };
  }

  // ============================================
  // 调试支持
  // ============================================

  /**
   * 打印队列状态（调试用）
   */
  public async dump(ledger?: string): Promise<void> {
    const tasks = await this.getPending(ledger);
    console.log('=== ClassifyQueue Status ===');
    console.log(`Total tasks: ${tasks.length}${ledger ? ` (ledger: ${ledger})` : ''}`);
    tasks.forEach((task, i) => {
      console.log(`  ${i + 1}. ${task.ledger}/${task.date}`);
    });
    console.log('============================');
  }
}

// 导出单例实例
export const classifyQueue = ClassifyQueue.getInstance();
