/**
 * 洞察页配置与常量
 *
 * 色值从 tailwind.config.js token 对应的十六进制值中引用，
 * 图表组件使用 recharts 不走 Tailwind class，因此此处直接引用色值常量。
 */

import { C } from '@ui/features/moni-home/config';

/** 洞察页专用色值（复用全局品牌色 + 少量图表专用变体） */
export const IC = {
  ...C,
  /** 收入柱 / 收入数字 — 薄荷绿 */
  income: '#4ECDC4',
  /** 支出柱 / 支出数字 — 珊瑚红 */
  expense: '#FF6B6B',
  /** 净值线 — 中性深色 */
  netLine: '#555555',
  /** 柱子浅色底 — 用于二级图表的柱体背景 */
  barLight: (hex: string) => `${hex}33`,
  /** 图表网格线 */
  grid: '#F0F0F0',
  /** 环状图未分类斜杠条纹色 */
  uncatStripe: '#CCCCCC',
  /** 环状图未分类填充底色 */
  uncatFill: '#E8E8E8',
  /** 骨架屏占位块背景色（比 bg 略深的暖灰） */
  skeletonBg: '#F0EDE8',
} as const;

/** 月模式最少数据点要求 */
export const MIN_MONTH_DATA_POINTS = 3;

/** 周模式最少数据点要求 */
export const MIN_WEEK_DATA_POINTS = 4;

/** 默认最大展示桶数 */
export const DEFAULT_MAX_BUCKETS = 12;

/** 动画时序常量 */
export const ANIM = {
  /** 粒度切换淡出 */
  fadeOutMs: 180,
  /** 粒度切换淡入 */
  fadeInMs: 220,
  /** 气泡入场 */
  tooltipMs: 200,
  /** 列表项展开 */
  expandMs: 240,
  /** 二级图表柱子生长 */
  barGrowMs: 360,
  /** 二级图表折线描画 */
  lineDrawMs: 480,
  /** 最高点标注淡入延迟 */
  peakDelayMs: 300,
} as const;
