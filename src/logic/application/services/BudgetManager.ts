/**
 * BudgetManager — 预算配置持久化 + 逻辑层
 *
 * 按规格文档 Moni_Budget_System_Spec_v2 终版冻结实现：
 * - 持久化：独立文件 budget_config/{ledger}.json（Directory.Data）
 * - 逻辑：computeMonthlyBudgetSummary / computeCategoryBudgetSummary / getBudgetHints
 * - 标签联动：invalidateCategoryBudgets / migrateCategoryBudgetKey
 * - 账本生命周期：deleteBudgetConfig / renameBudgetConfig
 *
 * 该服务为单例，通过 BudgetManager.getInstance() 获取实例。
 */

import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterDirectory, AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
import type { LedgerMemory, FullTransactionRecord } from '@shared/types/metadata';

// ──────────────────────────────────────────────
// 数据结构类型定义
// ──────────────────────────────────────────────

/** 月度预算配置 */
export interface MonthlyBudget {
  /** 月预算金额 */
  amount: number;
  /** 币种（本轮固定 CNY，预留字段） */
  currency: string;
}

/** 单个分类的预算条目 */
export interface CategoryBudgetEntry {
  /** 该分类的月预算额度 */
  amount: number;
}

/** 预算配置（per ledger 独立文件） */
export interface BudgetConfig {
  /** 月度总预算（null = 未设置） */
  monthly: MonthlyBudget | null;
  /** 分类预算表（key = 标签键名，null = 整体失效） */
  categoryBudgets: Record<string, CategoryBudgetEntry> | null;
  /** 分类预算配置版本戳——标签结构变更时自动递增 */
  categoryBudgetSchemaVersion: number;
  /** 最后更新时间（ISO 8601） */
  updatedAt: string;
}

// ──────────────────────────────────────────────
// 逻辑层读模型类型定义
// ──────────────────────────────────────────────

/** 总预算状态三级 */
export type BudgetStatus = 'none' | 'healthy' | 'warning' | 'exceeded';

/** 分类预算状态二级 */
export type CategoryBudgetStatus = 'within' | 'exceeded';

/** 总预算读模型（无预算时 enabled=false） */
export type MonthlyBudgetSummary =
  | { enabled: false }
  | {
      enabled: true;
      status: 'healthy' | 'warning' | 'exceeded';
      /** 月份标签，如 "2026-04" */
      period: string;
      /** 预算金额 */
      amount: number;
      /** 当月已支出 */
      spent: number;
      /** 剩余（可负） */
      remaining: number;
      /** spent / amount */
      usageRatio: number;
      /** 含今天的剩余天数 */
      remainingDays: number;
      /** 日均可用金额（超支时为 0） */
      dailyAvailable: number;
    };

/** 单个分类预算读模型条目 */
export interface CategoryBudgetItem {
  /** 标签键名 */
  categoryKey: string;
  /** 该分类月预算 */
  budgetAmount: number;
  /** 该分类当月已支出 */
  spent: number;
  /** 剩余（可负） */
  remaining: number;
  /** 状态 */
  status: CategoryBudgetStatus;
  /** 超出金额（未超时为 0） */
  overageAmount: number;
}

/** 分类预算读模型（未设置时 enabled=false） */
export type CategoryBudgetSummary =
  | { enabled: false }
  | {
      enabled: true;
      /** 各分类的预算状态（只包含设了预算的分类） */
      items: CategoryBudgetItem[];
    };

/** 预算相关情景提示卡 */
export interface BudgetHintCard {
  id: string;
  type: 'budget_alert' | 'budget_nudge';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  dismissible: boolean;
}

/** 看板预算卡读模型（供 DisplayBoard 组件消费） */
export interface DisplayBoardBudgetCard {
  /** 月份标签，如 "4月预算" */
  periodLabel: string;
  budgetAmount: number;
  spentAmount: number;
  remainingAmount: number;
  remainingDays: number;
  /** 超支时为 0 */
  dailyAvailableAmount: number;
  status: 'healthy' | 'warning' | 'exceeded';
  /** 供进度条宽度使用（0-1） */
  usageRatio: number;
}

// ──────────────────────────────────────────────
// 预算状态阈值（终版冻结值）
// ──────────────────────────────────────────────

const BUDGET_WARNING_THRESHOLD = 0.7;
const BUDGET_EXCEEDED_THRESHOLD = 1.0;

// ──────────────────────────────────────────────
// BudgetManager 实现
// ──────────────────────────────────────────────

export class BudgetManager {
  private static instance: BudgetManager;

  private constructor() {}

  public static getInstance(): BudgetManager {
    if (!BudgetManager.instance) {
      BudgetManager.instance = new BudgetManager();
    }
    return BudgetManager.instance;
  }

  // ──────────────────────────────────────────────
  // 私有辅助
  // ──────────────────────────────────────────────

  /** 构造存储路径 */
  private filePath(ledgerId: string): string {
    return `budget_config/${ledgerId}.json`;
  }

  /** 序列化并写入配置文件 */
  private async write(ledgerId: string, config: BudgetConfig): Promise<void> {
    const fs = FilesystemService.getInstance();
    // 确保目录存在
    try {
      await fs.mkdir({
        path: 'budget_config',
        directory: AdapterDirectory.Data,
        recursive: true,
      });
    } catch {
      // 目录已存在，忽略
    }
    await fs.writeFile({
      path: this.filePath(ledgerId),
      data: JSON.stringify(config, null, 2),
      directory: AdapterDirectory.Data,
      encoding: AdapterEncoding.UTF8,
    });
  }

  // ──────────────────────────────────────────────
  // 持久化层接口
  // ──────────────────────────────────────────────

  /**
   * 读取指定账本的完整预算配置
   * 文件不存在时返回 null（视为全部未设置）
   */
  public async loadBudgetConfig(ledgerId: string): Promise<BudgetConfig | null> {
    const fs = FilesystemService.getInstance();
    try {
      const raw = await fs.readFile({
        path: this.filePath(ledgerId),
        directory: AdapterDirectory.Data,
        encoding: AdapterEncoding.UTF8,
      });
      return JSON.parse(raw) as BudgetConfig;
    } catch {
      return null;
    }
  }

  /**
   * 保存月度总预算
   * budget = null 表示清除月度总预算
   */
  public async saveMonthlyBudget(
    ledgerId: string,
    budget: MonthlyBudget | null
  ): Promise<void> {
    // 先读取现有配置，再局部更新
    const existing = await this.loadBudgetConfig(ledgerId);
    const config: BudgetConfig = existing ?? {
      monthly: null,
      categoryBudgets: null,
      categoryBudgetSchemaVersion: 0,
      updatedAt: '',
    };
    config.monthly = budget;
    config.updatedAt = new Date().toISOString();
    await this.write(ledgerId, config);
  }

  /**
   * 保存分类预算表
   * budgets = null 表示清除全部分类预算（整体失效）
   */
  public async saveCategoryBudgets(
    ledgerId: string,
    budgets: Record<string, CategoryBudgetEntry> | null,
    schemaVersion: number
  ): Promise<void> {
    const existing = await this.loadBudgetConfig(ledgerId);
    const config: BudgetConfig = existing ?? {
      monthly: null,
      categoryBudgets: null,
      categoryBudgetSchemaVersion: 0,
      updatedAt: '',
    };
    config.categoryBudgets = budgets;
    config.categoryBudgetSchemaVersion = schemaVersion;
    config.updatedAt = new Date().toISOString();
    await this.write(ledgerId, config);
  }

  /**
   * 完整覆写预算配置（用于标签联动后的批量更新）
   */
  public async saveBudgetConfig(ledgerId: string, config: BudgetConfig): Promise<void> {
    await this.write(ledgerId, config);
  }

  // ──────────────────────────────────────────────
  // 账本生命周期联动
  // ──────────────────────────────────────────────

  /**
   * 删除指定账本的预算配置文件
   * 在 LedgerManager 删除账本时调用
   */
  public async deleteBudgetConfig(ledgerId: string): Promise<void> {
    const fs = FilesystemService.getInstance();
    try {
      await fs.deleteFile({
        path: this.filePath(ledgerId),
        directory: AdapterDirectory.Data,
      });
    } catch {
      // 文件不存在，忽略
    }
  }

  /**
   * 重命名账本时迁移预算配置文件
   * 在 LedgerManager 重命名账本时调用
   */
  public async renameBudgetConfig(oldLedgerId: string, newLedgerId: string): Promise<void> {
    const config = await this.loadBudgetConfig(oldLedgerId);
    if (!config) return; // 旧账本没有预算配置，无需迁移
    config.updatedAt = new Date().toISOString();
    await this.write(newLedgerId, config);
    await this.deleteBudgetConfig(oldLedgerId);
  }

  // ──────────────────────────────────────────────
  // 标签联动
  // ──────────────────────────────────────────────

  /**
   * 新增或删除标签时调用，整体失效分类预算配置
   * 规格：将 categoryBudgets 置为 null，schemaVersion 递增
   */
  public async invalidateCategoryBudgets(ledgerId: string): Promise<void> {
    const existing = await this.loadBudgetConfig(ledgerId);
    if (!existing) return; // 无配置文件，无需失效处理
    if (existing.categoryBudgets === null) return; // 已经失效
    existing.categoryBudgets = null;
    existing.categoryBudgetSchemaVersion += 1;
    existing.updatedAt = new Date().toISOString();
    await this.write(ledgerId, existing);
  }

  /**
   * 重命名标签时调用，对应预算条目跟随迁移
   * 规格：删除旧键、写入新键，金额不变
   */
  public async migrateCategoryBudgetKey(
    ledgerId: string,
    oldKey: string,
    newKey: string
  ): Promise<void> {
    const existing = await this.loadBudgetConfig(ledgerId);
    if (!existing) return;
    if (!existing.categoryBudgets) return; // 分类预算已失效，不处理
    const entry = existing.categoryBudgets[oldKey];
    if (!entry) return; // 旧键不存在
    // 迁移：删除旧键，写入新键
    delete existing.categoryBudgets[oldKey];
    existing.categoryBudgets[newKey] = entry;
    existing.updatedAt = new Date().toISOString();
    await this.write(ledgerId, existing);
  }

  // ──────────────────────────────────────────────
  // 逻辑层：统计支出
  // ──────────────────────────────────────────────

  /**
   * 从 LedgerMemory.records 中统计当月支出
   *
   * 统计口径（按规格 §5.3）：
   * - 只统计支出型 direction === 'out'
   * - 只统计当前自然月
   * - 排除 transactionStatus !== 'SUCCESS' 的交易
   *
   * @param records 账本记录 Map
   * @param now 当前时间（允许注入以便测试）
   * @returns { total, byCategory }
   */
  private computeMonthlySpent(
    records: Record<string, FullTransactionRecord>,
    now: Date
  ): { total: number; byCategory: Record<string, number> } {
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-based

    let total = 0;
    const byCategory: Record<string, number> = {};

    for (const record of Object.values(records)) {
      // 只统计支出型
      if (record.direction !== 'out') continue;
      // 排除非成功状态
      if (record.transactionStatus !== 'SUCCESS') continue;
      // 只统计当前自然月
      const txTime = record.time; // "YYYY-MM-DD HH:mm:ss"
      const txDate = new Date(txTime.slice(0, 10) + 'T00:00:00');
      if (txDate.getFullYear() !== year || txDate.getMonth() !== month) continue;

      total += record.amount;

      // 按最终分类统计（user_category 优先，其次 ai_category）
      const finalCat = record.user_category || record.ai_category || null;
      if (finalCat) {
        byCategory[finalCat] = (byCategory[finalCat] ?? 0) + record.amount;
      }
    }

    return { total, byCategory };
  }

  /**
   * 计算当月剩余天数（含今天）
   */
  private computeRemainingDays(now: Date): number {
    const year = now.getFullYear();
    const month = now.getMonth();
    // 当月最后一天
    const lastDay = new Date(year, month + 1, 0).getDate();
    const today = now.getDate();
    return lastDay - today + 1;
  }

  // ──────────────────────────────────────────────
  // 逻辑层接口
  // ──────────────────────────────────────────────

  /**
   * 计算当月总预算摘要
   *
   * @param ledgerId 账本 ID
   * @param ledgerMemory 账本记录（调用方传入，避免重复读文件）
   * @param now 当前时间，允许注入以便测试（默认 new Date()）
   */
  public async computeMonthlyBudgetSummary(
    ledgerId: string,
    ledgerMemory: LedgerMemory | null,
    now: Date = new Date()
  ): Promise<MonthlyBudgetSummary> {
    const config = await this.loadBudgetConfig(ledgerId);

    // 无预算配置或月预算金额无效
    if (!config?.monthly || config.monthly.amount <= 0) {
      return { enabled: false };
    }

    const records = ledgerMemory?.records ?? {};
    const { total: spent } = this.computeMonthlySpent(records, now);
    const amount = config.monthly.amount;
    const remaining = amount - spent;
    const usageRatio = spent / amount;
    const remainingDays = this.computeRemainingDays(now);
    const dailyAvailable = Math.max(remaining, 0) / Math.max(remainingDays, 1);

    // 判定状态（阈值冻结：0.7 / 1.0）
    let status: 'healthy' | 'warning' | 'exceeded';
    if (usageRatio > BUDGET_EXCEEDED_THRESHOLD) {
      status = 'exceeded';
    } else if (usageRatio >= BUDGET_WARNING_THRESHOLD) {
      status = 'warning';
    } else {
      status = 'healthy';
    }

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const period = `${year}-${month}`;

    return {
      enabled: true,
      status,
      period,
      amount,
      spent,
      remaining,
      usageRatio,
      remainingDays,
      dailyAvailable,
    };
  }

  /**
   * 计算当月分类预算摘要
   *
   * @param ledgerId 账本 ID
   * @param ledgerMemory 账本记录
   * @param now 当前时间
   */
  public async computeCategoryBudgetSummary(
    ledgerId: string,
    ledgerMemory: LedgerMemory | null,
    now: Date = new Date()
  ): Promise<CategoryBudgetSummary> {
    const config = await this.loadBudgetConfig(ledgerId);

    // 无分类预算配置
    if (!config?.categoryBudgets) {
      return { enabled: false };
    }

    const records = ledgerMemory?.records ?? {};
    const { byCategory } = this.computeMonthlySpent(records, now);

    const items: CategoryBudgetItem[] = Object.entries(config.categoryBudgets).map(
      ([categoryKey, entry]) => {
        const spent = byCategory[categoryKey] ?? 0;
        const remaining = entry.amount - spent;
        const isExceeded = spent > entry.amount;
        return {
          categoryKey,
          budgetAmount: entry.amount,
          spent,
          remaining,
          status: isExceeded ? 'exceeded' : 'within',
          overageAmount: isExceeded ? spent - entry.amount : 0,
        };
      }
    );

    return { enabled: true, items };
  }

  /**
   * 生成预算相关候选提示卡
   *
   * @param prevMonthlyStatus 上一次计算时的总预算状态（首次传 null）
   * @param currentMonthlyStatus 当前总预算状态
   * @param categorySummary 当前分类预算摘要
   * @param totalTransactionCount 当前账本总交易数（用于判断是否有足够流水）
   */
  public getBudgetHints(
    prevMonthlyStatus: BudgetStatus | null,
    currentMonthlyStatus: BudgetStatus,
    categorySummary: CategoryBudgetSummary,
    totalTransactionCount: number
  ): BudgetHintCard[] {
    const hints: BudgetHintCard[] = [];

    // 总预算：healthy → warning 跳变
    if (prevMonthlyStatus === 'healthy' && currentMonthlyStatus === 'warning') {
      hints.push({
        id: 'budget_warning',
        type: 'budget_alert',
        priority: 'medium',
        title: '本月预算已使用超过 70%',
        description: '接下来几天可以稍微收一收',
        dismissible: true,
      });
    }

    // 总预算：warning → exceeded 跳变
    if (prevMonthlyStatus === 'warning' && currentMonthlyStatus === 'exceeded') {
      hints.push({
        id: 'budget_exceeded',
        type: 'budget_alert',
        priority: 'high',
        title: '本月预算已超出',
        description: '本月支出已超过预算上限',
        dismissible: true,
      });
    }

    // 无预算 + 有足够流水时推进设置
    if (currentMonthlyStatus === 'none' && totalTransactionCount >= 10) {
      hints.push({
        id: 'budget_setup_nudge',
        type: 'budget_nudge',
        priority: 'low',
        title: '要不要设一个月预算？',
        description: '你已经有一段时间的流水了',
        dismissible: true,
      });
    }

    // 分类预算超支提示卡
    if (categorySummary.enabled) {
      const exceeded = categorySummary.items.filter((item) => item.status === 'exceeded');
      if (exceeded.length > 0) {
        const desc = exceeded
          .map((item) => `${item.categoryKey}超支 ¥${item.overageAmount.toFixed(0)}`)
          .join('，');
        hints.push({
          id: 'category_budget_exceeded',
          type: 'budget_alert',
          priority: 'high',
          title: '当月以下类别已超支',
          description: desc,
          dismissible: true,
        });
      }
    }

    return hints;
  }

  /**
   * 将 MonthlyBudgetSummary 转换为看板预算卡读模型
   * 仅 enabled=true 时才有意义，调用方需先判断 enabled
   */
  public toBudgetCard(summary: MonthlyBudgetSummary & { enabled: true }): DisplayBoardBudgetCard {
    const period = `${parseInt(summary.period.split('-')[1], 10)}月预算`;
    return {
      periodLabel: period,
      budgetAmount: summary.amount,
      spentAmount: summary.spent,
      remainingAmount: summary.remaining,
      remainingDays: summary.remainingDays,
      dailyAvailableAmount: summary.dailyAvailable,
      status: summary.status,
      usageRatio: Math.min(summary.usageRatio, 1), // 进度条最大 100%
    };
  }
}
