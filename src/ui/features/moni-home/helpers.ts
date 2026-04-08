/**
 * Moni 首页工具函数
 *
 * 包含日期处理、分类取值、统计聚合、Memphis 背景装饰生成等函数。
 * 迁移自 Moni-UI-Prototype/src/features/moni-home/helpers.js
 */

import { CATEGORY_ORDER, C } from "./config";

// ──────────────────────────────────────────────
// 类型定义
// ──────────────────────────────────────────────

/** 首页时间范围对象 */
export interface DateRange {
  start: Date;
  end: Date;
  /** 用于统计摘要栏标题前缀的文本（"本月" / "本周" / "今天" / "近三月" / "M.D - M.D"） */
  label: string;
}

/** 分类概览横条图中单个分类条目 */
export interface OverviewItem {
  category: string;
  total: number;
  percent: number;
}

/** Memphis 背景装饰形状 */
export interface DecorShape {
  id: number;
  type: "circle" | "square" | "triangle" | "zigzag";
  color: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  opacity: number;
}

/** 绘图边界 */
export interface ShapeBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ──────────────────────────────────────────────
// 分类工具
// ──────────────────────────────────────────────

/**
 * 获取条目的最终分类（userCat 优先，其次 aiCat，否则 null）
 * 与 Moni 原型的 getCategory() 语义一致
 */
export function getCategory(item: { userCat?: string | null; aiCat?: string | null }): string | null {
  return item.userCat ?? item.aiCat ?? null;
}

// ──────────────────────────────────────────────
// 日期工具
// ──────────────────────────────────────────────

/**
 * 将 "YYYY-MM-DD" 字符串转为本地时区 Date（时间固定为 00:00:00）
 * 注意：直接 new Date("YYYY-MM-DD") 会被 JS 解析为 UTC，导致时区偏差
 */
export function toDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

/**
 * 格式化为短日期字符串，如 "4.5"
 */
export function formatShortDate(value: string): string {
  const date = toDate(value);
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

// ──────────────────────────────────────────────
// 时间范围计算
// ──────────────────────────────────────────────

/**
 * 根据快捷模式或自定义起止日期，计算 DateRange 对象
 *
 * @param mode 快捷模式名称，或 "custom"（走 start/end 参数）
 * @param start 自定义起始日期（"YYYY-MM-DD"），仅 mode 为 "custom" 时使用
 * @param end 自定义结束日期（"YYYY-MM-DD"），仅 mode 为 "custom" 时使用
 * @param minDate 当前账本可见最小日期，供“全部”快捷项使用
 * @param maxDate 当前账本可见最大日期，供“全部”快捷项使用
 * @param todayStr 今天的日期字符串，默认取系统当前日期（允许注入以便测试）
 */
export function getRange(
  mode: string,
  start: string,
  end: string,
  minDate?: string,
  maxDate?: string,
  todayStr?: string
): DateRange {
  // 使用注入的今天，或动态取系统时间（避免原型里写死的 TODAY 常量）
  const todayBase = todayStr
    ? toDate(todayStr)
    : (() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      })();

  if (mode === "今天") {
    return { start: new Date(todayBase), end: new Date(todayBase), label: "今天" };
  }
  if (mode === "本周") {
    const weekStart = new Date(todayBase);
    weekStart.setDate(todayBase.getDate() - 6);
    return { start: weekStart, end: new Date(todayBase), label: "本周" };
  }
  if (mode === "本月") {
    return {
      start: new Date(todayBase.getFullYear(), todayBase.getMonth(), 1),
      end: new Date(todayBase),
      label: "本月",
    };
  }
  if (mode === "近三月") {
    const quarterStart = new Date(todayBase);
    quarterStart.setMonth(todayBase.getMonth() - 2);
    quarterStart.setDate(1);
    return { start: quarterStart, end: new Date(todayBase), label: "近三月" };
  }
  if (mode === "全部") {
    return {
      start: toDate(minDate ?? start),
      end: toDate(maxDate ?? end),
      label: "全部",
    };
  }
  // 自定义范围
  return {
    start: toDate(start),
    end: toDate(end),
    label: `${formatShortDate(start)} - ${formatShortDate(end)}`,
  };
}

/**
 * 判断日期字符串是否在给定 DateRange 范围内（含两端）
 */
export function isInRange(value: string, range: DateRange): boolean {
  const date = toDate(value);
  return date >= range.start && date <= range.end;
}

// ──────────────────────────────────────────────
// 统计聚合
// ──────────────────────────────────────────────

/** buildOverview 需要的最小条目结构 */
interface OverviewItem_Input {
  userCat?: string | null;
  aiCat?: string | null;
  /** 金额（元） */
  a: number;
}

/**
 * 根据支出条目列表构建分类概览数据（横条图数据源）
 *
 * - 按 CATEGORY_ORDER 顺序输出各分类汇总
 * - 末尾追加"未分类"汇总
 * - 过滤掉金额为 0 的分类
 * - 每项携带 percent（四舍五入到整数）
 */
export function buildOverview(expenseItems: OverviewItem_Input[]): OverviewItem[] {
  const totals = CATEGORY_ORDER.map((category) => ({
    category,
    total: expenseItems
      .filter((item) => getCategory(item) === category)
      .reduce((sum, item) => sum + item.a, 0),
  })).filter((item) => item.total > 0);

  const unclassifiedTotal = expenseItems
    .filter((item) => !getCategory(item))
    .reduce((sum, item) => sum + item.a, 0);

  // grand 至少为 1，避免除零
  const grand = Math.max(
    totals.reduce((sum, item) => sum + item.total, 0) + unclassifiedTotal,
    1
  );

  return [...totals, { category: "未分类", total: unclassifiedTotal }]
    .filter((item) => item.total > 0)
    .map((item) => ({
      ...item,
      percent: Math.round((item.total / grand) * 100),
    }));
}

// ──────────────────────────────────────────────
// Memphis 背景装饰
// ──────────────────────────────────────────────

/**
 * 基于种子生成稳定随机的 Memphis 装饰形状列表
 *
 * 使用线性同余生成器保证相同种子每次产生相同形状，
 * 避免组件重渲染时形状跳变。
 *
 * @param seed 随机种子（整数）
 * @param count 生成形状数量
 * @param bounds 形状可分布的画布区域
 */
export function seededShapes(seed: number, count: number, bounds: ShapeBounds): DecorShape[] {
  const shapes: DecorShape[] = [];
  let state = seed;

  // 线性同余随机数生成器（Lehmer / Park-Miller）
  const random = (): number => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };

  const colors = [C.coral, C.blue, C.yellow, C.mint, C.amber, C.purple];
  const types: DecorShape["type"][] = ["circle", "square", "triangle", "zigzag"];

  for (let index = 0; index < count; index += 1) {
    shapes.push({
      id: index,
      type: types[Math.floor(random() * types.length)],
      color: colors[Math.floor(random() * colors.length)],
      x: bounds.x + random() * bounds.w,
      y: bounds.y + random() * bounds.h,
      size: 6 + random() * 10,
      rotation: random() * 45,
      opacity: 0.08 + random() * 0.12,
    });
  }

  return shapes;
}
