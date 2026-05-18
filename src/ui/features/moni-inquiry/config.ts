/**
 * 请教页（MoniInquiry）配置与常量
 *
 * 色值统一引用全局品牌色 C，请教页专用色值作为语义别名定义在此处，
 * 避免在组件 JSX 中硬编码十六进制值。
 */

import { C } from '@ui/features/moni-home/config';

// ──────────────────────────────────────────────
// 重新导出全局色值供请教页使用
// ──────────────────────────────────────────────

export { C };

// ──────────────────────────────────────────────
// Confidence 背景色板（§2.3-D.5 / SPEC §5.2）
// low → 珊瑚红浅色变体；medium → 黄色浅色变体；high → 青色浅色变体
// ──────────────────────────────────────────────

export const CONFIDENCE_BG: Record<string, string> = {
  low: C.pinkBg,    // #FFF0F0 珊瑚红浅色变体
  medium: C.warmBg, // #FFF8F0 黄色浅色变体
  high: C.blueBg,   // #EBF5FF 青色浅色变体
  '': C.blueBg,     // 兜底：无 confidence 按 high 处理
};

/** Confidence 左边框色（轻量边框点缀，增强分类感知） */
export const CONFIDENCE_BORDER: Record<string, string> = {
  low: C.coral,
  medium: C.amber,
  high: C.blue,
  '': C.blue,
};

/** Confidence 中文文案（§6.2 三档 confidence 标签） */
export const CONFIDENCE_LABEL: Record<string, string> = {
  low: '证据不足',
  medium: '证据有限',
  high: '证据充分',
  '': '证据充分',
};

// ──────────────────────────────────────────────
// 动画时序常量（§14 动画规格）
// ──────────────────────────────────────────────

export const ANIM = {
  /** 单条左滑退场：向左位移至屏幕外 */
  swipeOutMs: 250,
  /** 单条高度坍塌补位 */
  collapseMs: 200,
  /** 左滑回弹（未超过阈值） */
  bounceMs: 180,
  /** 天卡片整体 collapse + 淡出 */
  dayCollapseMs: 280,
  /** 天卡片下方补位 */
  dayCompactMs: 200,
  /** filter 切换淡出 */
  filterFadeOutMs: 180,
  /** filter 切换淡入 */
  filterFadeInMs: 220,
  /** 批量入口激活切换 */
  bulkActivateMs: 240,
  /** 进入批量模式 */
  enterBulkMs: 280,
  /** 退出批量模式 */
  exitBulkMs: 220,
  /** 空状态切换 */
  emptyStateMs: 280,
  /** 新批次浮现 */
  newBatchMs: 320,
} as const;

// ──────────────────────────────────────────────
// 手势阈值
// ──────────────────────────────────────────────

/** 左滑超过此像素数即视为确认触发（§14 单条左滑） */
export const SWIPE_CONFIRM_THRESHOLD_PX = 80;

/** 方向判定：水平/垂直分量比值超过此值才锁定为横向滑动 */
export const SWIPE_DIRECTION_RATIO = 1.2;

// ──────────────────────────────────────────────
// Filter 档位文案
// ──────────────────────────────────────────────

export const FILTER_LABELS: Record<string, string> = {
  all: '全部',
  medium: '证据有限及以下',
  low: '仅证据不足',
};

// ──────────────────────────────────────────────
// 空状态文案（§12.2）
// ──────────────────────────────────────────────

export const EMPTY_STATE_CONFIG = {
  NO_BILLS: {
    title: '还没有账单可以请教',
    subtitle: 'AI 需要至少一笔账单数据才能开始学习',
    action: '去导入账单',
    actionTarget: 'entry' as const,
  },
  NO_REVIEW_YET: {
    title: 'AI 暂时没有想问的',
    subtitle: '还没开始分类，或对已有的都很有把握',
    action: null,
    actionTarget: null,
  },
  ALL_REVIEWED: {
    title: '教得不错',
    subtitle: 'AI 现在对所有交易都有把握了',
    action: null,
    actionTarget: null,
  },
  FILTER_EMPTY: {
    title: '当前筛选下没有需要请教的',
    subtitle: '试试放宽到"证据有限及以下"或"全部"',
    action: '放宽筛选',
    actionTarget: null,
  },
} as const;
