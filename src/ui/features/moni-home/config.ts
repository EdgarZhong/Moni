/**
 * Moni 首页配置
 *
 * 包含品牌色系、分类系统、Mock 数据常量等。
 * 迁移自 Moni-UI-Prototype/src/features/moni-home/config.js
 * Mock 数据（DAYS/INCOME/TREND）仅用于开发期占位，集成后由真实账本数据替换。
 */

// ──────────────────────────────────────────────
// 品牌色值（Memphis 风格）
// ──────────────────────────────────────────────

/** 全局色值常量 */
export const C = {
  /** 背景暖米色 */
  bg: "#F5F0EB",
  white: "#FFF",
  dark: "#222",
  /** 品牌珊瑚红 */
  coral: "#FF6B6B",
  /** 品牌天蓝 */
  blue: "#7EC8E3",
  /** 品牌黄 */
  yellow: "#F9D56E",
  /** 品牌薄荷绿 */
  mint: "#4ECDC4",
  /** 预算警戒琥珀橙 */
  amber: "#E88B4D",
  muted: "#999",
  sub: "#888",
  border: "#DDD",
  line: "#EEE",
  warmBg: "#FFF8F0",
  warmBd: "#F0C89A",
  pinkBg: "#FFF0F0",
  pinkBd: "#FFB8B8",
  greenBg: "#F0F8F0",
  greenText: "#3B6D11",
  blueBg: "#EBF5FF",
  orangeBg: "#FFF5EB",
  purple: "#B8A0D2",
  burgundy: "#C97B84",
  gray: "#C5C5C5",
} as const;

// ──────────────────────────────────────────────
// 分类视觉系统
// ──────────────────────────────────────────────

/**
 * 分类视觉已迁移到 `src/ui/shared/categoryVisuals.ts` 统一维护：
 * - 默认标签的兼容视觉
 * - 用户自定义标签的动态配色
 * - 首页 / 详情页 / 记账页的共用图标语义
 *
 * 这里不再保留任何按分类名硬编码的旧映射表，避免未来维护时误接回旧系统。
 */

// ──────────────────────────────────────────────
// UI 常量
// ──────────────────────────────────────────────

/** 看板自动轮播间隔（毫秒） */
export const AUTO_CAROUSEL_MS = 15_000;

/** 手动滑动后暂停自动轮播的时间（毫秒，2 分钟） */
export const MANUAL_RESUME_MS = 2 * 60 * 1000;

/**
 * 手动触摸后进入"空闲锁"的等待时间（毫秒，2 分钟）
 * 超过此时间未操作，则恢复自动轮播倒计时
 */
export const MANUAL_IDLE_LOCK_MS = 2 * 60 * 1000;

/**
 * 手机帧容器高度（屏幕自适配）
 * - 默认读取应用根层写入的稳定画布高度
 * - 浏览器开发态若未注入该变量，则自动回退到 `100dvh`
 * - Android 真机键盘弹出时，不再直接跟随当前可视视口缩短
 */
export const PHONE_FRAME_HEIGHT_CSS = "var(--app-root-height)";


/** 手机帧容器宽度（屏幕自适配） */
export const PHONE_FRAME_WIDTH_CSS = "100vw";

/** 浏览器与通用画布内都保持不变的基础顶部留白。 */
export const APP_HEADER_BASE_PADDING_TOP_PX = 6;

/**
 * 统一顶栏顶部留白。
 * 这里仍坚持“两层语义”：
 * 1. 设备自身的 safe area
 * 2. 画布内标题区基础顶边距
 *
 * Android 原生环境额外通过 `--app-header-native-safe-area-trim` 对“safe area 那一层”
 * 做统一回收；浏览器里可见的基础 padding 不在这里被改动。
 */
export const APP_HEADER_PADDING_TOP = `calc(env(safe-area-inset-top, 0px) + ${APP_HEADER_BASE_PADDING_TOP_PX}px + var(--app-header-native-safe-area-trim, 0px))`;

/**
 * 统一顶栏最小高度。
 * 无论右侧是账本胶囊、设置标签还是返回按钮，标题行都保持同一高度。
 */
export const APP_HEADER_MIN_HEIGHT = 36;

/**
 * 全屏覆盖二级页的统一层级。
 * 必须明确高于 Root 层 `BottomNav`（当前为 300），
 * 这样详情页、密码页这类“无 footer”的页面才能像覆盖底下 header 一样，
 * 在滑入/滑出过程中自然盖住底部导航，而不是先把导航卸载掉。
 */
export const FULL_SCREEN_OVERLAY_Z_INDEX = 420;

/**
 * 首页与记账页右上角账本选择器的统一宽度。
 * 固定宽度可以消除“同名账本在不同页面左右错位、长度变化”的视觉抖动。
 */
export const LEDGER_HEADER_CONTROL_WIDTH = 132;

/**
 * 底部导航安全区内边距
 * 在 Android WebView 取不到 safe-area 时，至少保留 14px，避免贴底遮挡。
 */
export const BOTTOM_NAV_PADDING_BOTTOM = "calc(env(safe-area-inset-bottom) + 12px)";
