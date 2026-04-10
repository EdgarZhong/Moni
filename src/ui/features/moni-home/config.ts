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
// 分类系统
// ──────────────────────────────────────────────

/** 单个分类的视觉配置 */
export interface CategoryVisual {
  color: string;
  bg: string;
  icons: string[];
}

/** 全局分类视觉映射（中文分类名 → 视觉配置） */
export const CAT: Record<string, CategoryVisual> = {
  正餐:  { color: "#D85A30", bg: C.pinkBg,    icons: ["🍜", "🍱", "🍚", "🥡"] },
  零食:  { color: "#854F0B", bg: "#FFF8EB",   icons: ["☕", "🧋", "🍪", "🍦"] },
  交通:  { color: "#185FA5", bg: C.blueBg,    icons: ["🚇", "🚕", "⛽", "🚌"] },
  娱乐:  { color: "#7B2D8B", bg: "#F6EEFA",   icons: ["🎬", "🎮", "🎵", "🎭"] },
  大餐:  { color: "#8B2252", bg: "#FFF0F5",   icons: ["🍷", "🥘", "🦞", "🍣"] },
  健康:  { color: "#1A7A4C", bg: "#EEFAF3",   icons: ["💊", "🏥", "💪", "🧘"] },
  购物:  { color: "#534AB7", bg: "#F3EEFA",   icons: ["🛍️", "📦", "👕", "🎁"] },
  教育:  { color: "#2D6A9F", bg: "#EDF5FC",   icons: ["📚", "🎓", "✏️", "💻"] },
  居住:  { color: "#6B5B3E", bg: "#FBF6EE",   icons: ["🏠", "💡", "🔧", "🚿"] },
  旅行:  { color: "#0E7C6B", bg: "#E8FAF5",   icons: ["✈️", "🏨", "🎫", "🗺️"] },
  其他:  { color: "#666",    bg: "#F5F5F5",   icons: ["📝", "💰", "🔖", "📌"] },
};

/** 分类概览横条图使用的色值（与 CAT 独立，以视觉平衡为准） */
export const OVERVIEW_COLORS: Record<string, string> = {
  正餐:  C.coral,
  零食:  "#F3C86B",
  交通:  C.blue,
  娱乐:  "#C8A7E8",
  大餐:  "#E7A0AE",
  健康:  "#77D7BF",
  购物:  "#AFA5E6",
  教育:  "#93C4EA",
  居住:  "#C9B18E",
  旅行:  "#87D7C4",
  其他:  C.gray,
  未分类: C.amber,
};

/** 默认分类顺序（与 CAT 键顺序一致） */
export const CATEGORY_ORDER = Object.keys(CAT);

/** 分类筛选轨道选项（"全部" + 所有分类 + "未分类"） */
export const FILTERS = ["全部", ...CATEGORY_ORDER, "未分类"];

// ──────────────────────────────────────────────
// UI 常量
// ──────────────────────────────────────────────

/** 看板自动轮播间隔（毫秒） */
export const AUTO_CAROUSEL_MS = 30_000;

/** 手动滑动后暂停自动轮播的时间（毫秒，5 分钟） */
export const MANUAL_RESUME_MS = 5 * 60 * 1000;

/**
 * 手动触摸后进入"空闲锁"的等待时间（毫秒，2 分钟）
 * 超过此时间未操作，则恢复自动轮播倒计时
 */
export const MANUAL_IDLE_LOCK_MS = 2 * 60 * 1000;

/**
 * 手机帧容器高度（屏幕自适配）
 * - 使用 dVH 跟随可视视口高度，旋转/地址栏收起时可实时自适应
 */
export const PHONE_FRAME_HEIGHT_CSS = "100dvh";


/** 手机帧容器宽度（屏幕自适配） */
export const PHONE_FRAME_WIDTH_CSS = "100vw";

/**
 * 底部导航安全区内边距
 * 在 Android WebView 取不到 safe-area 时，至少保留 14px，避免贴底遮挡。
 */
export const BOTTOM_NAV_PADDING_BOTTOM = "max(env(safe-area-inset-bottom), 14px)";
