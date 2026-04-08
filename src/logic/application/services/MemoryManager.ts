/**
 * MemoryManager - 记忆文件管理模块（v6 架构）
 *
 * v6 核心变更：
 * 1. 记忆文件路径：Documents/Moni/classify_memory/{ledger}/current_snapshot_id.md
 * 2. 单一事实源：当前记忆始终通过 SnapshotManager.getCurrentId() 获取
 * 3. 写后快照：每次 save() 后自动创建快照并更新 current_snapshot_id
 * 4. 读取逻辑：通过 current_snapshot_id 读取对应快照文件
 *
 * 职责：
 * 1. 记忆文件的读写（通过快照系统）
 * 2. 增量更新接口（ADD / MODIFY / DELETE 操作执行）
 * 3. 记忆文件格式：有序列表，每行一个信息点
 * 4. 读取时解析为 string[]，写入时添加序号
 *
 * 文件格式示例：
 * ```markdown
 * 1. 我是西工大学生，和女朋友一起生活，meal只统计双人用餐
 * 2. 单笔餐饮 > 70元视为大餐/聚餐，归 others
 * 3. 同一餐点时段已有正餐，后续小吃/面包归 others
 * ```
 */

import { SnapshotManager } from './SnapshotManager';

/**
 * 记忆操作类型
 */
export type MemoryOperation =
  | { type: 'ADD'; content: string }
  | { type: 'MODIFY'; index: number; content: string }
  | { type: 'DELETE'; index: number };

/**
 * 记忆操作结果
 */
export interface MemoryOperationResult {
  success: boolean;
  operations: MemoryOperation[];
  error?: string;
}

export class MemoryManager {

  /**
   * 读取记忆文件（v6 语义）
   *
   * v6 变更：
   * - 通过 SnapshotManager.getCurrentId() 获取当前快照 ID
   * - 读取对应的快照文件内容
   * - 如果没有快照，返回空数组
   *
   * @param ledgerName 账本名称
   * @returns 记忆条目数组（去序号后的纯内容），无快照时返回空数组
   */
  public static async load(ledgerName: string): Promise<string[]> {
    try {
      // 1. 获取当前快照 ID
      const currentId = await SnapshotManager.getCurrentId(ledgerName);
      if (!currentId) {
        // 没有快照，返回空数组
        return [];
      }

      // 2. 读取快照内容
      const snapshot = await SnapshotManager.read(ledgerName, currentId);
      if (!snapshot) {
        console.warn(`[MemoryManager] Current snapshot ${currentId} not found`);
        return [];
      }

      return snapshot.content;
    } catch (e) {
      console.error(`[MemoryManager] Failed to load memory for ${ledgerName}:`, e);
      return [];
    }
  }

  /**
   * 保存记忆文件（v6 语义）
   *
   * v6 变更：
   * - 创建新快照并更新 current_snapshot_id
   * - 不再直接写入记忆文件，而是通过快照系统
   * - 自动触发 GC（保留最近 30 个快照）
   *
   * @param ledgerName 账本名称
   * @param memories 记忆条目数组（纯内容，无需序号）
   * @param trigger 触发类型（默认 'user_edit'）
   * @param summary 快照摘要（可选）
   */
  public static async save(
    ledgerName: string,
    memories: string[],
    trigger: 'ledger_init' | 'ai_learn' | 'ai_compress' | 'user_edit' | 'tag_delete' | 'manual' | 'migration' = 'user_edit',
    summary?: string
  ): Promise<void> {
    try {
      // 1. 格式化内容
      const content = this.formatContent(memories);

      // 2. 创建快照（自动更新 current_snapshot_id）
      await SnapshotManager.create(
        ledgerName,
        content,
        trigger,
        summary || `${trigger} 触发的记忆更新`
      );

      console.log(`[MemoryManager] Saved memory for ${ledgerName} (trigger: ${trigger})`);
    } catch (e) {
      console.error(`[MemoryManager] Failed to save memory for ${ledgerName}:`, e);
      throw e;
    }
  }

  /**
   * 执行增量更新操作（v6 语义）
   * 注意：DELETE 和 MODIFY 必须按索引从高到低倒序执行，避免索引偏移
   *
   * v6 变更：
   * - 操作完成后自动创建快照
   * - 支持指定触发类型和摘要
   *
   * @param ledgerName 账本名称
   * @param operations 操作列表
   * @param trigger 触发类型（默认 'user_edit'）
   * @param summary 快照摘要（可选）
   * @returns 操作结果
   */
  public static async applyOperations(
    ledgerName: string,
    operations: MemoryOperation[],
    trigger: 'ledger_init' | 'ai_learn' | 'ai_compress' | 'user_edit' | 'tag_delete' | 'manual' | 'migration' = 'user_edit',
    summary?: string
  ): Promise<MemoryOperationResult> {
    try {
      // 1. 加载当前记忆
      const memories = await this.load(ledgerName);

      // 2. 分离操作类型
      const adds = operations.filter((op): op is { type: 'ADD'; content: string } => op.type === 'ADD');
      const modifies = operations.filter((op): op is { type: 'MODIFY'; index: number; content: string } =>
        op.type === 'MODIFY'
      );
      const deletes = operations.filter((op): op is { type: 'DELETE'; index: number } =>
        op.type === 'DELETE'
      );

      // 3. 执行 DELETE（按索引降序）
      deletes
        .sort((a, b) => b.index - a.index)
        .forEach(op => {
          if (op.index >= 1 && op.index <= memories.length) {
            memories.splice(op.index - 1, 1);
          } else {
            console.warn(`[MemoryManager] DELETE index ${op.index} out of range`);
          }
        });

      // 4. 执行 MODIFY（按索引降序，避免删除后索引变化）
      modifies
        .sort((a, b) => b.index - a.index)
        .forEach(op => {
          if (op.index >= 1 && op.index <= memories.length) {
            memories[op.index - 1] = op.content;
          } else {
            console.warn(`[MemoryManager] MODIFY index ${op.index} out of range`);
          }
        });

      // 5. 执行 ADD（追加到末尾）
      adds.forEach(op => {
        memories.push(op.content);
      });

      // 6. 保存（v6：自动创建快照）
      await this.save(ledgerName, memories, trigger, summary);

      return {
        success: true,
        operations
      };
    } catch (e) {
      console.error(`[MemoryManager] Failed to apply operations:`, e);
      return {
        success: false,
        operations,
        error: e instanceof Error ? e.message : String(e)
      };
    }
  }

  /**
   * 添加单条记忆（v6 语义）
   * @param ledgerName 账本名称
   * @param content 记忆内容
   * @param trigger 触发类型（默认 'user_edit'）
   */
  public static async add(
    ledgerName: string,
    content: string,
    trigger: 'ledger_init' | 'ai_learn' | 'ai_compress' | 'user_edit' | 'tag_delete' | 'manual' | 'migration' = 'user_edit'
  ): Promise<void> {
    await this.applyOperations(ledgerName, [{ type: 'ADD', content }], trigger, `添加记忆: ${content.slice(0, 30)}...`);
  }

  /**
   * 修改单条记忆（v6 语义）
   * @param ledgerName 账本名称
   * @param index 序号（从1开始）
   * @param content 新内容
   * @param trigger 触发类型（默认 'user_edit'）
   */
  public static async modify(
    ledgerName: string,
    index: number,
    content: string,
    trigger: 'ledger_init' | 'ai_learn' | 'ai_compress' | 'user_edit' | 'tag_delete' | 'manual' | 'migration' = 'user_edit'
  ): Promise<void> {
    await this.applyOperations(ledgerName, [{ type: 'MODIFY', index, content }], trigger, `修改记忆 #${index}`);
  }

  /**
   * 删除单条记忆（v6 语义）
   * @param ledgerName 账本名称
   * @param index 序号（从1开始）
   * @param trigger 触发类型（默认 'user_edit'）
   */
  public static async delete(
    ledgerName: string,
    index: number,
    trigger: 'ledger_init' | 'ai_learn' | 'ai_compress' | 'user_edit' | 'tag_delete' | 'manual' | 'migration' = 'user_edit'
  ): Promise<void> {
    await this.applyOperations(ledgerName, [{ type: 'DELETE', index }], trigger, `删除记忆 #${index}`);
  }

  /**
   * 解析文件内容为数组
   * 处理规则：
   * - 按行分割
   * - 去除序号前缀（如 "1. "）
   * - 去除空行
   * - 保留纯文本内容
   */
  private static parseContent(content: string): string[] {
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
   * 格式化数组为文件内容
   * 为每行添加序号
   */
  private static formatContent(memories: string[]): string {
    return memories
      .map((content, index) => `${index + 1}. ${content}`)
      .join('\n');
  }

  /**
   * 清空记忆文件（v6 语义）
   * @param ledgerName 账本名称
   * @param trigger 触发类型（默认 'user_edit'）
   */
  public static async clear(
    ledgerName: string,
    trigger: 'ledger_init' | 'ai_learn' | 'ai_compress' | 'user_edit' | 'tag_delete' | 'manual' | 'migration' = 'user_edit'
  ): Promise<void> {
    await this.save(ledgerName, [], trigger, '清空记忆');
  }

  /**
   * 获取记忆条目数量（v6 语义）
   * @param ledgerName 账本名称
   */
  public static async getCount(ledgerName: string): Promise<number> {
    const memories = await this.load(ledgerName);
    return memories.length;
  }

  /**
   * 检查记忆文件是否存在（v6 语义）
   * v6 变更：检查是否有当前快照
   *
   * @param ledgerName 账本名称
   */
  public static async exists(ledgerName: string): Promise<boolean> {
    try {
      const currentId = await SnapshotManager.getCurrentId(ledgerName);
      return currentId !== '';
    } catch {
      return false;
    }
  }

  /**
   * 回退到指定快照（v6 新增）
   * 便捷方法：封装 SnapshotManager.rollback() + save()
   *
   * @param ledgerName 账本名称
   * @param snapshotId 快照 ID
   * @returns 是否成功
   */
  public static async rollbackToSnapshot(ledgerName: string, snapshotId: string): Promise<boolean> {
    try {
      // 1. 通过 SnapshotManager 回退（只更新指针）
      const content = await SnapshotManager.rollback(ledgerName, snapshotId);
      if (!content) {
        return false;
      }

      // 2. 解析内容为数组（移除序号）
      const memories = this.parseContent(content);

      console.log(`[MemoryManager] Rolled back to snapshot ${snapshotId}, loaded ${memories.length} memories`);
      return true;
    } catch (e) {
      console.error(`[MemoryManager] Failed to rollback to snapshot ${snapshotId}:`, e);
      return false;
    }
  }
}
