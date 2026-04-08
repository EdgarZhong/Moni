/**
 * useMoniHomeData — Moni 首页聚合读模型 Hook
 *
 * 职责：
 * 1. 订阅 LedgerService 状态变化
 * 2. 将账本记录转换为 Moni 首页所需的格式（日分组、收入流水、趋势数据）
 * 3. 通过 BudgetManager 计算预算摘要
 * 4. 输出首页聚合读模型，供 MoniHome.tsx 替换 mock 数据
 *
 * 数据变换规则：
 * - 支出流水 direction==='out' 按天分组，每天汇总为 HomeDayGroup
 * - 收入流水 direction==='in' 提取为 { date, amount }[]
 * - 趋势数据：按天聚合支出，取最近 N 天
 * - 预算数据：通过 BudgetManager.computeMonthlyBudgetSummary 计算
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { LedgerService } from '@logic/application/services/LedgerService';
import { LedgerManager } from '@logic/application/services/LedgerManager';
import { BudgetManager } from '@logic/application/services/BudgetManager';
import type { DisplayBoardBudgetCard, MonthlyBudgetSummary } from '@logic/application/services/BudgetManager';
import type { HomeTransaction, HomeDayGroup } from '@ui/features/moni-home/components';
import type { FullTransactionRecord } from '@shared/types/metadata';

// ──────────────────────────────────────────────
// 类型定义
// ──────────────────────────────────────────────

/** 收入条目（供首页收入统计） */
export interface IncomeEntry {
  date: string;
  amount: number;
}

/** 趋势数据点（供折线图） */
export interface TrendPoint {
  key: string;
  label: string;
  amount: number;
}

/** 首页聚合读模型（供 MoniHome 消费） */
export interface MoniHomeData {
  /** 支出按天分组数据（不含 visibleItems，由 MoniHome 负责过滤） */
  days: Omit<HomeDayGroup, 'visibleItems'>[];
  /** 收入条目列表 */
  income: IncomeEntry[];
  /** 近期支出趋势（最近 TREND_DAYS 天，含无支出的零值天） */
  trend: TrendPoint[];
  /** 是否设置了预算 */
  hasBudget: boolean;
  /** 看板预算卡读模型（hasBudget=false 时为 null） */
  budgetCard: DisplayBoardBudgetCard | null;
  /** 账本是否正在加载 */
  isLoading: boolean;
  /** 账本中可用的分类列表（供 DragOverlay 使用） */
  availableCategories: string[];
  /** 当前账本 ID */
  ledgerId: string;
}

// ──────────────────────────────────────────────
// 常量
// ──────────────────────────────────────────────

/** 趋势图展示的天数 */
const TREND_DAYS = 30;

// ──────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────

/**
 * 将 FullTransactionRecord 转为 HomeTransaction
 * 保留首页所需字段，ai_category → aiCat，user_category → userCat
 */
function recordToHomeTransaction(
  txId: string,
  record: FullTransactionRecord,
  index: number
): HomeTransaction {
  return {
    id: txId,
    n: record.counterparty || record.product || '未知',
    a: record.amount,
    t: record.time.slice(11, 16), // "HH:mm"
    pay: record.paymentMethod || '',
    userCat: record.user_category || null,
    aiCat: record.ai_category || null,
    reason: null, // reason 字段来自 AI 理由，暂不从 record 取
    ih: index, // 列表内序号（用于 seededShapes 种子）
  };
}

/**
 * 将 time 字符串 "YYYY-MM-DD HH:mm:ss" 提取为日期部分 "YYYY-MM-DD"
 */
function toDateKey(time: string): string {
  return time.slice(0, 10);
}

/**
 * 将日期键 "YYYY-MM-DD" 转为首页标签（今天/昨天/M月D日）
 */
function toDateLabel(dateKey: string, todayKey: string, yesterdayKey: string): string {
  if (dateKey === todayKey) return '今天';
  if (dateKey === yesterdayKey) return '昨天';
  const [, month, day] = dateKey.split('-');
  return `${parseInt(month, 10)}月${parseInt(day, 10)}日`;
}

/**
 * 计算最近 N 天的日期键列表（从最远到最近）
 */
function buildRecentDays(now: Date, count: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

// ──────────────────────────────────────────────
// Hook 实现
// ──────────────────────────────────────────────

export function useMoniHomeData(): MoniHomeData {
  // LedgerService 状态快照
  const [ledgerState, setLedgerState] = useState(() => LedgerService.getInstance().getState());
  // 预算摘要
  const [budgetSummary, setBudgetSummary] = useState<MonthlyBudgetSummary>({ enabled: false });
  // 当前账本 ID
  const [ledgerId, setLedgerId] = useState<string>(() =>
    LedgerManager.getInstance().getActiveLedgerName()
  );

  // 预算刷新标记（账本切换或状态变化时触发）
  const budgetRefreshKeyRef = useRef(0);

  // 订阅 LedgerService
  useEffect(() => {
    const service = LedgerService.getInstance();
    const unsub = service.subscribe(() => {
      setLedgerState(service.getState());
      // 账本状态变化时触发预算重算
      budgetRefreshKeyRef.current += 1;
    });
    return unsub;
  }, []);

  // 当 ledgerState 变化时，同步账本 ID
  useEffect(() => {
    const nextId = LedgerManager.getInstance().getActiveLedgerName();
    setLedgerId(nextId);
  }, [ledgerState]);

  // 异步计算预算摘要（ledgerId 或 ledgerState 变化时触发）
  useEffect(() => {
    let cancelled = false;
    const fetchBudget = async () => {
      const summary = await BudgetManager.getInstance().computeMonthlyBudgetSummary(
        ledgerId,
        ledgerState.ledgerMemory
      );
      if (!cancelled) {
        setBudgetSummary(summary);
      }
    };
    void fetchBudget();
    return () => {
      cancelled = true;
    };
  }, [ledgerId, ledgerState]);

  // 聚合计算——将 ledgerMemory.records 转换为首页所需结构
  const { days, income, trend, availableCategories } = useMemo(() => {
    const records = ledgerState.ledgerMemory?.records;
    if (!records) {
      return { days: [], income: [], trend: [], availableCategories: [] };
    }

    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);

    // 按天分组支出条目
    const dayMap = new Map<string, HomeTransaction[]>();
    const incomeList: IncomeEntry[] = [];

    // 按时间倒序排序 records（新的在前）
    const sortedEntries = Object.entries(records).sort(
      ([, a], [, b]) => b.time.localeCompare(a.time)
    );

    let itemIndex = 0;
    for (const [txId, record] of sortedEntries) {
      if (record.transactionStatus !== 'SUCCESS') continue;

      if (record.direction === 'out') {
        const dateKey = toDateKey(record.time);
        if (!dayMap.has(dateKey)) {
          dayMap.set(dateKey, []);
        }
        dayMap.get(dateKey)!.push(recordToHomeTransaction(txId, record, itemIndex++));
      } else if (record.direction === 'in') {
        const dateKey = toDateKey(record.time);
        // 合并同天收入
        const existing = incomeList.find((e) => e.date === dateKey);
        if (existing) {
          existing.amount += record.amount;
        } else {
          incomeList.push({ date: dateKey, amount: record.amount });
        }
      }
    }

    // 按天倒序构建 days 列表
    const daysResult: Omit<HomeDayGroup, 'visibleItems'>[] = Array.from(dayMap.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dateKey, items]) => ({
        id: dateKey,
        label: toDateLabel(dateKey, todayKey, yesterdayKey),
        items,
      }));

    // 构建趋势数据（最近 TREND_DAYS 天，含无支出天零值）
    const recentDayKeys = buildRecentDays(now, TREND_DAYS);
    const trendResult: TrendPoint[] = recentDayKeys.map((key) => {
      const dayItems = dayMap.get(key) ?? [];
      const amount = dayItems.reduce((sum, item) => sum + item.a, 0);
      const [, month, day] = key.split('-');
      return {
        key,
        label: `${parseInt(month, 10)}/${parseInt(day, 10)}`,
        amount,
      };
    });

    // 可用分类列表（来自 defined_categories 键列表）
    const catMap = ledgerState.ledgerMemory?.defined_categories ?? {};
    const cats = Object.keys(catMap);

    return {
      days: daysResult,
      income: incomeList,
      trend: trendResult,
      availableCategories: cats,
    };
  }, [ledgerState]);

  // 看板预算卡读模型
  const { hasBudget, budgetCard } = useMemo<{
    hasBudget: boolean;
    budgetCard: DisplayBoardBudgetCard | null;
  }>(() => {
    if (!budgetSummary.enabled) {
      return { hasBudget: false, budgetCard: null };
    }
    const card = BudgetManager.getInstance().toBudgetCard(budgetSummary);
    return { hasBudget: true, budgetCard: card };
  }, [budgetSummary]);

  return {
    days,
    income,
    trend,
    hasBudget,
    budgetCard,
    isLoading: ledgerState.isLoading,
    availableCategories,
    ledgerId,
  };
}
