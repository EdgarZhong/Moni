/**
 * ClassifyQueue / ClassifyIndex - 分类索引运行时管理器
 *
 * 当前冻结语义：
 * 1. 持久化主状态是“按日期维护的脏条目精确计数 dirtyCountByDate”
 * 2. 对外暴露的按天待处理列表只是 classify index 派生出来的消费视图
 * 3. 旧命名 queue 仍保留为兼容别名，避免一次性打碎既有调用链
 * 4. 一旦索引失真，允许标记 needs_rebuild 并退化到局部/整本重建
 */

import { ClassifyRuntimeStore } from './ClassifyRuntimeStore';
import { normalizeToDateKey } from './DateNormalizer';
import type { FullTransactionRecord, LedgerMemory } from '@shared/types/metadata';

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

interface DirtyContributionInfo {
  date: string | null;
  contribution: 0 | 1;
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
 * classify index 的只读快照。
 * 调试链路需要拿到完整聚合结果，验证“索引值”和“派生出来的 pending dates”是否一致。
 */
export interface ClassifyIndexSnapshot {
  ledger: string;
  revision: number;
  dirtyCountByDate: Record<string, number>;
  pendingDates: string[];
  needsRebuild: boolean;
  rebuildReason: string | null;
}

/**
 * 分类索引管理器。
 * 这里保留旧文件名，仅为了兼容既有 import 路径；对外主语义已经切到 classify index。
 */
export class ClassifyIndex {
  private static instance: ClassifyIndex;
  private ledgerTasks = new Map<string, LedgerQueueTask[]>();
  private ledgerDirtyCountByDate = new Map<string, Map<string, number>>();
  private loadedLedgers = new Set<string>();
  private ledgerRevisions = new Map<string, number>();
  private ledgerMetrics = new Map<string, LedgerQueueMetrics>();
  private ledgerNeedsRebuild = new Map<string, boolean>();
  private ledgerRebuildReasons = new Map<string, string | null>();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): ClassifyIndex {
    if (!ClassifyIndex.instance) {
      ClassifyIndex.instance = new ClassifyIndex();
    }
    return ClassifyIndex.instance;
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
      this.ledgerDirtyCountByDate.set(ledger, new Map(Object.entries(data.dirty_count_by_date || {})));
      this.ledgerRevisions.set(ledger, Number.isFinite(data.revision) ? data.revision : 0);
      this.ledgerMetrics.set(ledger, {
        emptyTaskConsumedCount: data.metrics.emptyTaskConsumedCount ?? 0,
        lastEmptyTaskDate: data.metrics.lastEmptyTaskDate ?? null
      });
      this.ledgerNeedsRebuild.set(ledger, data.needs_rebuild === true);
      this.ledgerRebuildReasons.set(ledger, data.rebuild_reason ?? null);
      this.syncQueueFromDirtyCounts(ledger);
      console.log(
        `[ClassifyIndex] Loaded ${ledger}: ${normalizedTasks.length} pending dates, rev=${this.ledgerRevisions.get(ledger)}`
      );
    } catch {
      this.ledgerTasks.set(ledger, []);
      this.ledgerDirtyCountByDate.set(ledger, new Map());
      this.ledgerRevisions.set(ledger, 0);
      this.ledgerMetrics.set(ledger, {
        emptyTaskConsumedCount: 0,
        lastEmptyTaskDate: null
      });
      this.ledgerNeedsRebuild.set(ledger, true);
      this.ledgerRebuildReasons.set(ledger, 'queue_load_failed');
      console.log(`[ClassifyIndex] No existing runtime for ${ledger}, starting fresh`);
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
    this.syncQueueFromDirtyCounts(ledger);
    const tasks = this.ledgerTasks.get(ledger) || [];
    const dirtyCountByDate = Object.fromEntries(this.getDirtyCountMap(ledger).entries());
    try {
      const runtime = await ClassifyRuntimeStore.load(ledger);
      await ClassifyRuntimeStore.saveOrDeleteIfEmpty(ledger, {
        ...runtime,
        revision,
        metrics,
        queue: tasks,
        dirty_count_by_date: dirtyCountByDate,
        needs_rebuild: this.ledgerNeedsRebuild.get(ledger) === true,
        rebuild_reason: this.ledgerRebuildReasons.get(ledger) ?? null
      });
    } catch (e) {
      console.error(`[ClassifyIndex] Failed to save runtime for ${ledger}:`, e);
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

  private getDirtyCountMap(ledger: string): Map<string, number> {
    let map = this.ledgerDirtyCountByDate.get(ledger);
    if (!map) {
      map = new Map<string, number>();
      this.ledgerDirtyCountByDate.set(ledger, map);
    }
    return map;
  }

  private buildDirtyContributionInfo(record: FullTransactionRecord | null | undefined): DirtyContributionInfo {
    if (!record?.time) {
      return { date: null, contribution: 0 };
    }
    const date = normalizeToDateKey(record.time);
    const finalCategory = record.user_category || record.ai_category || record.category;
    const isDirty =
      record.is_verified === false &&
      (!finalCategory || finalCategory === 'uncategorized');
    return {
      date,
      contribution: isDirty ? 1 : 0
    };
  }

  private syncQueueFromDirtyCounts(ledger: string): void {
    const counts = this.getDirtyCountMap(ledger);
    const currentQueue = this.ledgerTasks.get(ledger) || [];
    const existingByDate = new Map(currentQueue.map((task) => [task.date, task]));
    const nextQueue: LedgerQueueTask[] = [];

    for (const [date, count] of counts.entries()) {
      if (!Number.isInteger(count) || count <= 0) {
        counts.delete(date);
        continue;
      }
      const existing = existingByDate.get(date);
      nextQueue.push(existing || {
        date,
        enqueuedAt: Date.now()
      });
    }

    nextQueue.sort((left, right) => left.enqueuedAt - right.enqueuedAt);
    this.ledgerTasks.set(ledger, nextQueue);
  }

  private recountDatesFromRecords(records: LedgerMemory['records'], dates: Set<string>): Map<string, number> {
    const counts = new Map<string, number>();
    if (dates.size === 0) {
      return counts;
    }

    for (const record of Object.values(records)) {
      const info = this.buildDirtyContributionInfo(record);
      if (info.contribution !== 1 || !info.date || !dates.has(info.date)) {
        continue;
      }
      counts.set(info.date, (counts.get(info.date) ?? 0) + 1);
    }

    return counts;
  }

  private async rebuildAffectedDates(
    ledger: string,
    records: LedgerMemory['records'],
    affectedDates: Set<string>,
    reason: string
  ): Promise<void> {
    await this.ensureLedgerLoaded(ledger);
    const dirtyCounts = this.getDirtyCountMap(ledger);
    const recounted = this.recountDatesFromRecords(records, affectedDates);
    for (const date of affectedDates) {
      const count = recounted.get(date) ?? 0;
      if (count > 0) {
        dirtyCounts.set(date, count);
      } else {
        dirtyCounts.delete(date);
      }
    }
    this.ledgerNeedsRebuild.set(ledger, false);
    this.ledgerRebuildReasons.set(ledger, null);
    this.syncQueueFromDirtyCounts(ledger);
    await this.saveLedger(ledger, { bumpRevision: true });
    console.log('[ClassifyIndex] Rebuilt affected dates:', {
      ledger,
      reason,
      affectedDates: Array.from(affectedDates).sort()
    });
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
      console.warn(`[ClassifyIndex] Rejected index refresh for ${task.ledger}: empty date`);
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
      this.ledgerNeedsRebuild.set(task.ledger, false);
      this.ledgerRebuildReasons.set(task.ledger, null);
      await this.saveLedger(task.ledger, { bumpRevision: true });
      console.log(`[ClassifyIndex] Added pending date for ${task.ledger}/${task.date}`);
      return true;
    }

    // v5.1 收口：同日任务已存在则忽略，不再进行任务类型升级
    console.log(`[ClassifyIndex] Ignored duplicate pending date for ${task.ledger}/${task.date}`);
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
      console.log(`[ClassifyIndex] Peek consumed pending date for ${ledger}/${task.date}`);
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
      console.log(`[ClassifyIndex] Removed pending date for ${ledger}/${date}`);
      return true;
    }

    return false;
  }

  public async removeIfRevisionMatch(ledger: string, date: string, expectedRevision: number): Promise<boolean> {
    await this.ensureLedgerLoaded(ledger);
    const currentRevision = this.getCurrentRevision(ledger);
    if (currentRevision !== expectedRevision) {
      console.warn(
        `[ClassifyIndex] Skip remove for ${ledger}/${date}: revision changed ${currentRevision} !== ${expectedRevision}`
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
    console.log(`[ClassifyIndex] CAS removed pending date for ${ledger}/${date} @rev=${expectedRevision}`);
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
        `[ClassifyIndex] Skip batch remove for ${ledger}: revision changed ${currentRevision} !== ${expectedRevision}`
      );
      return false;
    }

    const dateSet = new Set(dates.filter((date) => typeof date === 'string' && date.length > 0));
    if (dateSet.size === 0) {
      return true;
    }

    const ledgerQueue = this.ledgerTasks.get(ledger)!;
    const dirtyCounts = this.getDirtyCountMap(ledger);
    const nextQueue = ledgerQueue.filter((task) => {
      if (!dateSet.has(task.date)) {
        return true;
      }
      return (dirtyCounts.get(task.date) ?? 0) > 0;
    });

    this.ledgerTasks.set(ledger, nextQueue);
    await this.saveLedger(ledger, { bumpRevision: true });
    console.log(`[ClassifyIndex] CAS reconciled ${dateSet.size} pending dates for ${ledger} @rev=${expectedRevision}`);
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
      console.log(`[ClassifyIndex] Cleared runtime for ${ledger}`);
      return;
    }

    const fileLedgers = await this.listLedgersWithQueueFile();
    const allLedgers = Array.from(new Set([...fileLedgers, ...this.loadedLedgers]));
    for (const ledgerName of allLedgers) {
      this.ledgerTasks.set(ledgerName, []);
      this.ledgerDirtyCountByDate.set(ledgerName, new Map());
      await this.deleteLedgerFile(ledgerName);
      this.ledgerRevisions.delete(ledgerName);
      this.ledgerMetrics.delete(ledgerName);
      this.ledgerNeedsRebuild.delete(ledgerName);
      this.ledgerRebuildReasons.delete(ledgerName);
    }
    this.ledgerTasks.clear();
    this.ledgerDirtyCountByDate.clear();
    this.loadedLedgers.clear();
    this.ledgerRevisions.clear();
    this.ledgerMetrics.clear();
    this.ledgerNeedsRebuild.clear();
    this.ledgerRebuildReasons.clear();
    console.log('[ClassifyIndex] Cleared all ledger runtimes');
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
      this.ledgerDirtyCountByDate.delete(ledger);
      this.loadedLedgers.delete(ledger);
      this.ledgerRevisions.delete(ledger);
      this.ledgerMetrics.delete(ledger);
      this.ledgerNeedsRebuild.delete(ledger);
      this.ledgerRebuildReasons.delete(ledger);
      console.log(`[ClassifyIndex] Removed ${removedCount} pending dates for ledger ${ledger}`);
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
    const oldDirtyCounts = this.getDirtyCountMap(oldName);
    const newDirtyCounts = this.getDirtyCountMap(newName);
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
    const mergedDirtyCounts = new Map<string, number>(newDirtyCounts);
    for (const [date, count] of oldDirtyCounts.entries()) {
      mergedDirtyCounts.set(date, (mergedDirtyCounts.get(date) ?? 0) + count);
    }
    this.ledgerTasks.set(newName, mergedTasks);
    this.ledgerDirtyCountByDate.set(newName, mergedDirtyCounts);
    this.ledgerMetrics.set(newName, {
      emptyTaskConsumedCount: newMetrics.emptyTaskConsumedCount + oldMetrics.emptyTaskConsumedCount,
      lastEmptyTaskDate: [newMetrics.lastEmptyTaskDate, oldMetrics.lastEmptyTaskDate]
        .filter(Boolean)
        .sort()
        .pop() || null
    });
    this.ledgerRevisions.set(newName, Math.max(newRevision, oldRevision));
    this.ledgerNeedsRebuild.set(
      newName,
      (this.ledgerNeedsRebuild.get(newName) === true) || (this.ledgerNeedsRebuild.get(oldName) === true)
    );
    this.ledgerRebuildReasons.set(
      newName,
      this.ledgerRebuildReasons.get(newName) ?? this.ledgerRebuildReasons.get(oldName) ?? null
    );
    await this.saveLedger(newName, { bumpRevision: true });

    await this.deleteLedgerFile(oldName);
    this.ledgerTasks.delete(oldName);
    this.ledgerDirtyCountByDate.delete(oldName);
    this.loadedLedgers.delete(oldName);
    this.ledgerRevisions.delete(oldName);
    this.ledgerMetrics.delete(oldName);
    this.ledgerNeedsRebuild.delete(oldName);
    this.ledgerRebuildReasons.delete(oldName);

    const updatedCount = oldTasks.length;
    if (updatedCount > 0) {
      console.log(`[ClassifyIndex] Renamed ${updatedCount} pending dates from ${oldName} to ${newName}`);
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

  /**
   * 返回当前账本 classify index 的完整快照。
   * 这里只读不写，专供浏览器控制台和 E2E 用例校验索引真值。
   */
  public async getIndexSnapshot(ledger: string): Promise<ClassifyIndexSnapshot> {
    await this.ensureLedgerLoaded(ledger);
    const dirtyCounts = this.getDirtyCountMap(ledger);
    return {
      ledger,
      revision: this.getCurrentRevision(ledger),
      dirtyCountByDate: Object.fromEntries(
        Array.from(dirtyCounts.entries()).sort(([left], [right]) => left.localeCompare(right))
      ),
      pendingDates: (this.ledgerTasks.get(ledger) || [])
        .map((task) => task.date)
        .sort((left, right) => left.localeCompare(right)),
      needsRebuild: this.ledgerNeedsRebuild.get(ledger) === true,
      rebuildReason: this.ledgerRebuildReasons.get(ledger) ?? null,
    };
  }

  public async hasNeedsRebuild(ledger: string): Promise<boolean> {
    await this.ensureLedgerLoaded(ledger);
    return this.ledgerNeedsRebuild.get(ledger) === true;
  }

  public async markNeedsRebuild(ledger: string, reason: string): Promise<void> {
    await this.ensureLedgerLoaded(ledger);
    this.ledgerNeedsRebuild.set(ledger, true);
    this.ledgerRebuildReasons.set(ledger, reason);
    await this.saveLedger(ledger, { bumpRevision: true });
  }

  public async rebuildFromRecords(ledger: string, records: LedgerMemory['records'], reason: string): Promise<void> {
    await this.ensureLedgerLoaded(ledger);
    const nextCounts = new Map<string, number>();
    for (const record of Object.values(records)) {
      const info = this.buildDirtyContributionInfo(record);
      if (info.contribution !== 1 || !info.date) {
        continue;
      }
      nextCounts.set(info.date, (nextCounts.get(info.date) ?? 0) + 1);
    }
    this.ledgerDirtyCountByDate.set(ledger, nextCounts);
    this.ledgerNeedsRebuild.set(ledger, false);
    this.ledgerRebuildReasons.set(ledger, null);
    this.syncQueueFromDirtyCounts(ledger);
    await this.saveLedger(ledger, { bumpRevision: true });
    console.log('[ClassifyIndex] Rebuilt dirty index from records:', {
      ledger,
      reason,
      pendingDates: (this.ledgerTasks.get(ledger) || []).map((task) => task.date)
    });
  }

  public async syncDirtyIndexForTouchedRecords(params: {
    ledger: string;
    prevRecords: LedgerMemory['records'];
    nextRecords: LedgerMemory['records'];
    touchedTxIds: string[];
    reason: string;
  }): Promise<void> {
    await this.ensureLedgerLoaded(params.ledger);
    const dirtyCounts = this.getDirtyCountMap(params.ledger);
    const affectedDates = new Set<string>();

    try {
      for (const txId of Array.from(new Set(params.touchedTxIds))) {
        const oldInfo = this.buildDirtyContributionInfo(params.prevRecords[txId]);
        const newInfo = this.buildDirtyContributionInfo(params.nextRecords[txId]);

        if (oldInfo.date) {
          affectedDates.add(oldInfo.date);
        }
        if (newInfo.date) {
          affectedDates.add(newInfo.date);
        }

        if (oldInfo.date === newInfo.date) {
          if (oldInfo.date) {
            const current = dirtyCounts.get(oldInfo.date) ?? 0;
            const next = current + newInfo.contribution - oldInfo.contribution;
            if (!Number.isInteger(next) || next < 0) {
              throw new Error(`invalid_dirty_count_same_date:${oldInfo.date}:${next}`);
            }
            if (next === 0) {
              dirtyCounts.delete(oldInfo.date);
            } else {
              dirtyCounts.set(oldInfo.date, next);
            }
          }
          continue;
        }

        if (oldInfo.date && oldInfo.contribution === 1) {
          const next = (dirtyCounts.get(oldInfo.date) ?? 0) - 1;
          if (!Number.isInteger(next) || next < 0) {
            throw new Error(`invalid_dirty_count_old_date:${oldInfo.date}:${next}`);
          }
          if (next === 0) {
            dirtyCounts.delete(oldInfo.date);
          } else {
            dirtyCounts.set(oldInfo.date, next);
          }
        }

        if (newInfo.date && newInfo.contribution === 1) {
          dirtyCounts.set(newInfo.date, (dirtyCounts.get(newInfo.date) ?? 0) + 1);
        }
      }

      this.ledgerNeedsRebuild.set(params.ledger, false);
      this.ledgerRebuildReasons.set(params.ledger, null);
      this.syncQueueFromDirtyCounts(params.ledger);
      await this.saveLedger(params.ledger, { bumpRevision: true });
    } catch (error) {
      console.warn('[ClassifyIndex] Dirty index delta update failed, rebuilding affected dates:', {
        ledger: params.ledger,
        reason: params.reason,
        affectedDates: Array.from(affectedDates).sort(),
        error,
      });

      try {
        await this.rebuildAffectedDates(params.ledger, params.nextRecords, affectedDates, `recount:${params.reason}`);
      } catch (rebuildError) {
        console.error('[ClassifyIndex] Failed to rebuild affected dates, marking runtime dirty:', rebuildError);
        this.ledgerNeedsRebuild.set(params.ledger, true);
        this.ledgerRebuildReasons.set(params.ledger, `needs_rebuild:${params.reason}`);
        await this.saveLedger(params.ledger, { bumpRevision: true });
      }
    }
  }

  // ============================================
  // 调试支持
  // ============================================

  /**
   * 打印队列状态（调试用）
   */
  public async dump(ledger?: string): Promise<void> {
    const tasks = await this.getPending(ledger);
    console.log('=== ClassifyIndex Status ===');
    console.log(`Total tasks: ${tasks.length}${ledger ? ` (ledger: ${ledger})` : ''}`);
    tasks.forEach((task, i) => {
      console.log(`  ${i + 1}. ${task.ledger}/${task.date}`);
    });
    console.log('============================');
  }
}

// 导出单例实例
export const classifyIndex = ClassifyIndex.getInstance();
/**
 * 兼容别名。
 * 当前仓库仍有存量调用使用 classifyQueue 命名；等全链路稳定后再决定是否统一迁移 import。
 */
export const classifyQueue = classifyIndex;
