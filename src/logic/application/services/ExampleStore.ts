/**
 * ExampleStore - 实例库管理模块
 *
 * 职责：
 * 1. 存储用户修正过的或锁定确认的分类案例（few-shot examples）
 * 2. 提供批量检索功能，为分类请求检索相关案例
 * 3. 管理实例库的 CRUD 操作
 *
 * 存储位置：沙箱目录 classify_examples/{ledger}.json
 */

import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterDirectory, AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
import type { FullTransactionRecord } from '@shared/types/metadata';

/**
 * 实例库条目结构
 * 存储"正确答案 + 正确理由"，作为 few-shot examples 注入 Prompt
 */
export interface ExampleEntry {
  /** 交易 ID */
  tx_id: string;
  /** 记录创建时间 */
  created_at: string;
  /** 交易对方/商户名 */
  counterparty: string;
  /** 商品描述 */
  description: string;
  /** 交易金额 */
  amount: number;
  /** 收支方向 */
  direction: 'in' | 'out';
  /** 交易时间（HH:mm 格式） */
  time: string;
  /** 支付来源 */
  source: string;
  /** 最终分类（正确答案） */
  category: string;
  /** AI 分对时的推理理由 */
  ai_reason?: string;
  /** 用户修正时的理由 */
  user_reason?: string;
}

/**
 * 用于注入 Prompt 的简化案例格式
 */
export interface ReferenceCorrection {
  tx_id: string;
  created_at: string;
  counterparty: string;
  description: string;
  amount: number;
  direction: 'in' | 'out';
  time: string;
  source: string;
  category: string;
  ai_reason?: string;
  user_reason?: string;
}

/**
 * 待分类交易（用于检索）
 */
interface PendingTransaction {
  id: string;
  counterparty: string;
  description: string;
  amount: number;
  time: string;
}

/**
 * 餐点时段枚举
 */
type MealTime = 'breakfast' | 'lunch' | 'dinner' | 'other';

export class ExampleStore {
  private static readonly BASE_PATH = 'classify_examples';

  /**
   * 获取实例库文件路径
   */
  private static getFilePath(ledgerName: string): string {
    return `${this.BASE_PATH}/${ledgerName}.json`;
  }

  public static async exists(ledgerName: string): Promise<boolean> {
    const filePath = this.getFilePath(ledgerName);
    try {
      const fs = FilesystemService.getInstance();
      await fs.stat({
        path: filePath,
        directory: AdapterDirectory.Data
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 读取实例库
   * @param ledgerName 账本名称
   * @returns 实例库条目数组，文件不存在时返回空数组
   */
  public static async load(ledgerName: string): Promise<ExampleEntry[]> {
    const filePath = this.getFilePath(ledgerName);

    try {
      const exists = await this.exists(ledgerName);
      if (!exists) {
        return [];
      }

      const result = await FilesystemService.getInstance().readFile({
        path: filePath,
        directory: AdapterDirectory.Data,
        encoding: AdapterEncoding.UTF8
      });

      return JSON.parse(result) as ExampleEntry[];
    } catch {
      // 文件不存在或读取失败，返回空数组
      return [];
    }
  }

  /**
   * 保存实例库
   * @param ledgerName 账本名称
   * @param examples 实例库条目数组
   */
  public static async save(ledgerName: string, examples: ExampleEntry[]): Promise<void> {
    const filePath = this.getFilePath(ledgerName);

    try {
      await FilesystemService.getInstance().writeFile({
        path: filePath,
        data: JSON.stringify(examples, null, 2),
        directory: AdapterDirectory.Data,
        encoding: AdapterEncoding.UTF8,
        recursive: true
      });
    } catch (e) {
      console.error(`[ExampleStore] Failed to save examples for ${ledgerName}:`, e);
      throw e;
    }
  }

  /**
   * 添加或更新实例条目
   * 如果 tx_id 已存在，先删除旧记录，再写入新记录
   *
   * @param ledgerName 账本名称
   * @param record 完整交易记录（从 LedgerMemory.records 中获取）
   * @param isCorrection 是否为修正（AI 分错时丢弃 ai_reasoning）
   */
  public static async addOrUpdate(
    ledgerName: string,
    record: FullTransactionRecord,
    isCorrection: boolean
  ): Promise<void> {
    const examples = await this.load(ledgerName);

    // 检查是否已存在相同 tx_id，有则删除
    const filtered = examples.filter(ex => ex.tx_id !== record.id);

    // 构建新的实例条目
    const newEntry = this.buildExampleEntry(record, isCorrection);

    // 添加到列表
    filtered.push(newEntry);

    // 保存
    await this.save(ledgerName, filtered);

    console.log(`[ExampleStore] Added example for tx ${record.id}, isCorrection=${isCorrection}`);
  }

  /**
   * 根据 tx_id 删除实例条目
   * @param ledgerName 账本名称
   * @param txId 交易 ID
   */
  public static async deleteByTxId(ledgerName: string, txId: string): Promise<void> {
    const examples = await this.load(ledgerName);
    const filtered = examples.filter(ex => ex.tx_id !== txId);

    // 如果数量变化了，说明有删除，需要保存
    if (filtered.length !== examples.length) {
      await this.save(ledgerName, filtered);
      console.log(`[ExampleStore] Deleted example for tx ${txId}`);
    }
  }

  /**
   * 批量删除指定日期范围内的实例条目（用于重分类前的清理）
   * @param ledgerName 账本名称
   * @param txIds 要删除的交易 ID 列表
   */
  public static async deleteByTxIds(ledgerName: string, txIds: Set<string>): Promise<void> {
    const examples = await this.load(ledgerName);
    const filtered = examples.filter(ex => !txIds.has(ex.tx_id));

    if (filtered.length !== examples.length) {
      await this.save(ledgerName, filtered);
      console.log(`[ExampleStore] Deleted ${examples.length - filtered.length} examples`);
    }
  }

  /**
   * 构建实例库条目
   * 根据设计文档的规则进行字段重组
   */
  private static buildExampleEntry(
    record: FullTransactionRecord,
    isCorrection: boolean
  ): ExampleEntry {
    // 优先使用 user_category（用户手动分类），如果没有则使用 category（当前显示分类）
    const finalCategory = record.user_category?.trim() || record.category;

    const entry: ExampleEntry = {
      tx_id: record.id,
      created_at: new Date().toISOString(),
      counterparty: record.counterparty,
      description: record.product || record.remark || '',
      amount: record.amount,
      direction: record.direction,
      time: record.time.split(' ')[1] || record.time, // 提取 HH:mm 部分
      source: record.sourceType,
      category: finalCategory
    };

    // 字段重组规则：
    // - AI 分对 + 用户锁定：保留 ai_reasoning
    // - AI 分错 + 用户修正：丢弃 ai_reasoning，保留 user_note 作为 user_reason
    if (!isCorrection && record.ai_reasoning) {
      entry.ai_reason = record.ai_reasoning;
    }

    if (record.user_note) {
      entry.user_reason = record.user_note;
    }

    return entry;
  }

  /**
   * 批量检索相关案例
   * 对批次中每条交易检索最多 3 条相关案例，然后全局去重合并
   *
   * @param ledgerName 账本名称
   * @param transactions 待分类交易列表
   * @returns 合并后的参考案例列表（最多 3 * transactions.length 条，去重后通常更少）
   */
  public static async retrieveRelevant(
    ledgerName: string,
    transactions: PendingTransaction[]
  ): Promise<ReferenceCorrection[]> {
    const examples = await this.load(ledgerName);

    if (examples.length === 0) {
      return [];
    }

    // 为每条交易检索相关案例
    const allMatches: Map<string, ExampleEntry[]> = new Map();

    for (const tx of transactions) {
      const matches = this.findMatchesForTransaction(tx, examples);
      allMatches.set(tx.id, matches);
    }

    // 按 tx_id 去重合并
    const seen = new Set<string>();
    const merged: ReferenceCorrection[] = [];

    for (const [, matches] of allMatches) {
      for (const ex of matches) {
        if (!seen.has(ex.tx_id)) {
          seen.add(ex.tx_id);
          merged.push(this.toReferenceCorrection(ex));
        }
      }
    }

    merged.sort((a, b) => {
      const timeDiff = a.time.localeCompare(b.time);
      if (timeDiff !== 0) {
        return timeDiff;
      }
      const createdDiff = a.created_at.localeCompare(b.created_at);
      if (createdDiff !== 0) {
        return createdDiff;
      }
      return a.tx_id.localeCompare(b.tx_id);
    });

    console.log(`[ExampleStore] Retrieved ${merged.length} unique examples for ${transactions.length} transactions`);
    return merged;
  }

  /**
   * 为单条交易查找匹配的案例（最多 3 条）
   *
   * 检索优先级：
   * 1. 商户名匹配（最高权重）
   * 2. 品类相似（关键词交集）
   * 3. 金额区间（±50% 范围内优先）
   * 4. 时段相近（同一餐点时段优先）
   */
  private static findMatchesForTransaction(
    tx: PendingTransaction,
    examples: ExampleEntry[]
  ): ExampleEntry[] {
    // 计算每条案例的匹配分数
    const scored = examples.map(ex => ({
      example: ex,
      score: this.calculateMatchScore(tx, ex)
    }));

    // 按分数降序排序，取前 3 条
    scored.sort((a, b) => b.score - a.score);

    // 只返回分数大于 0 的（有一定相关性的）
    return scored
      .filter(s => s.score > 0)
      .slice(0, 3)
      .map(s => s.example);
  }

  /**
   * 计算交易与案例的匹配分数
   */
  private static calculateMatchScore(
    tx: PendingTransaction,
    ex: ExampleEntry
  ): number {
    let score = 0;

    // 1. 商户名匹配（最高权重：50 分）
    if (this.isCounterpartyMatch(tx.counterparty, ex.counterparty)) {
      score += 50;
    }

    // 2. 品类相似（关键词交集，20 分）
    const txKeywords = this.extractKeywords(tx.counterparty + ' ' + tx.description);
    const exKeywords = this.extractKeywords(ex.counterparty + ' ' + ex.description);
    const commonKeywords = [...txKeywords].filter(k => exKeywords.has(k));
    if (commonKeywords.length > 0) {
      score += Math.min(20, commonKeywords.length * 5);
    }

    // 3. 金额区间（±50% 范围内，15 分）
    const maxAmount = Math.max(tx.amount, ex.amount);
    if (maxAmount > 0) {
      const amountRatio = Math.abs(tx.amount - ex.amount) / maxAmount;
      if (amountRatio <= 0.5) {
        score += 15 * (1 - amountRatio * 2); // 越接近得分越高
      }
    }

    // 4. 时段相近（同一餐点时段，15 分）
    if (this.getMealTime(tx.time) === this.getMealTime(ex.time)) {
      score += 15;
    }

    return score;
  }

  /**
   * 判断商户名是否匹配
   * 支持包含关系（如"杨国福麻辣烫"匹配"杨国福"）
   */
  private static isCounterpartyMatch(txCounterparty: string, exCounterparty: string): boolean {
    const t1 = txCounterparty.toLowerCase().trim();
    const t2 = exCounterparty.toLowerCase().trim();

    if (t1 === t2) return true;
    if (t1.includes(t2) || t2.includes(t1)) return true;

    return false;
  }

  /**
   * 提取关键词（简单的分词实现）
   */
  private static extractKeywords(text: string): Set<string> {
    // 简单实现：按非中文字符和非字母数字分割
    const words = text
      .toLowerCase()
      .split(/[^\u4e00-\u9fa5a-z0-9]+/)
      .filter(w => w.length >= 2); // 至少2个字符

    return new Set(words);
  }

  /**
   * 判断餐点时段
   */
  private static getMealTime(timeStr: string): MealTime {
    // 解析时间字符串（支持 "HH:mm" 或 "HH:mm:ss"）
    const hour = parseInt(timeStr.split(':')[0], 10);

    if (isNaN(hour)) return 'other';

    // 早餐: 06:00 - 10:00
    if (hour >= 6 && hour < 10) return 'breakfast';
    // 午餐: 10:00 - 15:00
    if (hour >= 10 && hour < 15) return 'lunch';
    // 晚餐: 15:00 - 21:00
    if (hour >= 15 && hour < 21) return 'dinner';

    return 'other';
  }

  /**
   * 将 ExampleEntry 转换为 ReferenceCorrection（用于注入 Prompt）
   */
  private static toReferenceCorrection(ex: ExampleEntry): ReferenceCorrection {
    const result: ReferenceCorrection = {
      tx_id: ex.tx_id,
      created_at: ex.created_at,
      counterparty: ex.counterparty,
      description: ex.description,
      amount: ex.amount,
      direction: ex.direction,
      time: ex.time,
      source: ex.source,
      category: ex.category
    };

    if (ex.ai_reason) {
      result.ai_reason = ex.ai_reason;
    }

    if (ex.user_reason) {
      result.user_reason = ex.user_reason;
    }

    return result;
  }

  /**
   * 清空实例库（用于调试或重置）
   * @param ledgerName 账本名称
   */
  public static async clear(ledgerName: string): Promise<void> {
    await this.save(ledgerName, []);
    console.log(`[ExampleStore] Cleared all examples for ${ledgerName}`);
  }

  /**
   * 获取实例库统计信息
   * @param ledgerName 账本名称
   */
  public static async getStats(ledgerName: string): Promise<{ count: number }> {
    const examples = await this.load(ledgerName);
    return { count: examples.length };
  }
}
