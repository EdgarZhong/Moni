/**
 * 洞察页 mock 数据
 *
 * 仅用于骨架开发阶段，真实数据接入后由 useInsightsData hook 提供。
 */

import type { InsightsViewData } from '@shared/types/application';

/** 生成最近 N 个月的月份键 */
function recentMonthKeys(count: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    keys.push(`${y}-${m}`);
  }
  return keys;
}

/** 生成最近 N 周的周键 */
function recentWeekKeys(count: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  const dayOfWeek = now.getDay() || 7;
  const thisMon = new Date(now);
  thisMon.setDate(now.getDate() - dayOfWeek + 1);
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(thisMon);
    d.setDate(thisMon.getDate() - i * 7);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    keys.push(`${m}/${dd}`);
  }
  return keys;
}

const MOCK_TAGS = [
  { id: '正餐', name: '正餐', budget: 2000 },
  { id: '零食', name: '零食', budget: 500 },
  { id: '交通', name: '交通', budget: 800 },
  { id: '娱乐', name: '娱乐', budget: null },
  { id: '购物', name: '购物', budget: null },
  { id: '居住', name: '居住', budget: 3000 },
  { id: '__uncategorized__', name: '未分类', budget: null },
];

function rand(min: number, max: number) {
  return Math.round(min + Math.random() * (max - min));
}

export function buildMockInsightsData(): InsightsViewData {
  const months = recentMonthKeys(8);
  const weeks = recentWeekKeys(12);

  const cashflowByMonth = months.map((key) => {
    const income = rand(4000, 18000);
    const expense = rand(3000, 15000);
    return { key, income, expense, net: income - expense };
  });

  const cashflowByWeek = weeks.map((key) => {
    const income = rand(1000, 5000);
    const expense = rand(800, 4500);
    return { key, income, expense, net: income - expense };
  });

  const totalIncome = cashflowByMonth.reduce((s, b) => s + b.income, 0);
  const totalExpense = cashflowByMonth.reduce((s, b) => s + b.expense, 0);

  /* 本月各标签支出占比 */
  const expenseAmounts = MOCK_TAGS.map((t) => ({
    ...t,
    amount: t.id === '__uncategorized__' ? rand(100, 600) : rand(300, 3200),
  }));
  const expenseTotal = expenseAmounts.reduce((s, t) => s + t.amount, 0);
  const expenseCurrentMonth = expenseAmounts
    .filter((t) => t.amount > 0)
    .map((t) => ({
      tagId: t.id,
      tagName: t.name,
      amount: t.amount,
      share: t.amount / expenseTotal,
      budget: t.budget,
    }));

  /* 各标签月度历史 */
  const byTagHistory: Record<string, Array<{ monthKey: string; amount: number }>> = {};
  for (const tag of MOCK_TAGS) {
    byTagHistory[tag.id] = months.map((monthKey) => ({
      monthKey,
      amount: rand(100, 3000),
    }));
  }

  /* 收入 tab mock */
  const incomeCurrentMonth = [
    { tagId: '收入', tagName: '收入', amount: rand(8000, 15000), share: 0.85, budget: null },
    { tagId: '退款', tagName: '退款', amount: rand(100, 800), share: 0.15, budget: null },
  ];
  const incomeByTagHistory: Record<string, Array<{ monthKey: string; amount: number }>> = {
    '收入': months.map((m) => ({ monthKey: m, amount: rand(8000, 15000) })),
    '退款': months.map((m) => ({ monthKey: m, amount: rand(50, 500) })),
  };

  return {
    ledger: {
      name: '日常开销',
      earliestTxDate: months[0] + '-01',
      latestTxDate: months[months.length - 1] + '-28',
    },
    summary: {
      totalIncome,
      totalExpense,
      netCashflow: totalIncome - totalExpense,
      coverageStart: months[0],
      coverageEnd: months[months.length - 1],
    },
    cashflowByMonth,
    cashflowByWeek,
    categoryBreakdown: {
      expense: { currentMonth: expenseCurrentMonth, byTagHistory },
      income: { currentMonth: incomeCurrentMonth, byTagHistory: incomeByTagHistory },
    },
  };
}
