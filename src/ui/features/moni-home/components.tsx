/**
 * Moni 首页 UI 组件集合
 *
 * 包含首页所有展示组件，全部使用内联 style（Memphis 风格，无 Tailwind），
 * 与 Moni-UI-Prototype 视觉完全一致。
 *
 * 迁移自 Moni-UI-Prototype/src/features/moni-home/components.jsx
 * 变更：JSX → TSX，加 Props 类型注解，导入路径改为本仓库，其余逻辑不变。
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  APP_HEADER_MIN_HEIGHT,
  APP_HEADER_PADDING_TOP,
  C,
  LEDGER_HEADER_CONTROL_WIDTH,
} from "./config";
import {
  getCategory,
  normalizeTransactionDetailText,
  resolveTransactionDisplayProductText,
  resolveTransactionDisplayTitle,
  seededShapes,
  type OverviewItem,
} from "./helpers";
import type { LedgerOption } from "@shared/types";
import {
  pickCategoryIcon,
  resolveCategoryVisual,
  UNCLASSIFIED_CATEGORY_VISUAL,
  type CategoryVisual,
} from "@ui/shared/categoryVisuals";

// ──────────────────────────────────────────────
// 内部常量
// ──────────────────────────────────────────────

/** 未分类斜线条纹背景（用于图标区和概览横条） */
const UNCLASSIFIED_STRIPE = `repeating-linear-gradient(45deg,${UNCLASSIFIED_CATEGORY_VISUAL.overviewColor}22,${UNCLASSIFIED_CATEGORY_VISUAL.overviewColor}22 3px,${UNCLASSIFIED_CATEGORY_VISUAL.overviewColor}55 3px,${UNCLASSIFIED_CATEGORY_VISUAL.overviewColor}55 6px)`;

/**
 * 拖拽细则面板的统一几何常量。
 * MoniHome 中的展开判定阈值必须直接消费这里的常量，避免视觉驻留区与真实触发区继续错位。
 */
export const DRAG_PANEL_COLLAPSED_VISIBLE_PX = 100;
/**
 * 分类区和细则区之间的窄安全带。
 * 这里不承载分类命中，也不承载细则展开，纯粹给手指留一个“缓冲 / 取消”位置。
 */
export const DRAG_PANEL_SAFETY_ZONE_HEIGHT_PX = 22;
export const DRAG_PANEL_EXPAND_TRIGGER_MARGIN_PX = 32;
/**
 * 长按刚成立时，先要求手指向下产生一小段真实拖拽位移，再允许面板进入 Expanded。
 * 这样可以挡住“还没往下拖、面板却先外弹”的误判。
 */
export const DRAG_PANEL_EXPAND_ARM_DISTANCE_PX = 12;
export const DRAG_PANEL_RESIDENT_ZONE_HEIGHT_PX = DRAG_PANEL_COLLAPSED_VISIBLE_PX + DRAG_PANEL_EXPAND_TRIGGER_MARGIN_PX;
export const DRAG_PANEL_EXPANDED_VISIBLE_PX = 500;

// ──────────────────────────────────────────────
// 类型定义
// ──────────────────────────────────────────────

/** 趋势折线图单点数据 */
export interface TrendPoint {
  key: string;    // "YYYY-MM-DD"
  label: string;  // "4/7"
  amount: number;
}

/** 流水条目（首页展示用最小字段集） */
export interface HomeTransaction {
  id: number | string;
  /** 原始流水号 */
  originalId?: string | null;
  /** 商户名 */
  n: string;
  /** 金额（元） */
  a: number;
  /** 时间（如 "18:10"） */
  t: string;
  /** 完整时间（如 "4月12日 20:07"） */
  fullTimeLabel?: string;
  /** 来源类型 */
  sourceType?: "wechat" | "alipay" | "manual";
  /** 来源文案 */
  sourceLabel?: string;
  /** 支付方式 */
  pay: string;
  /** 原始分类 */
  rawClass?: string | null;
  /** 交易对方 */
  counterparty?: string | null;
  /** 商品名称 */
  product?: string | null;
  /** 交易状态 */
  transactionStatus?: string | null;
  /** 用户分类（优先级最高） */
  userCat?: string | null;
  /** AI 分类 */
  aiCat?: string | null;
  /** AI 理由 */
  reason?: string | null;
  /** 手记说明 */
  userNote?: string | null;
  /** 交易备注 */
  remark?: string | null;
  /** 收支方向 */
  direction?: "in" | "out";
  /** 是否已锁定/确认 */
  isVerified?: boolean;
  /** 最后更新时间 */
  updatedAt?: string | null;
  /** 图标变体索引（交给统一分类视觉系统决定取哪一个图标变体） */
  ih: number;
}

/** 日卡片数据（包含可见条目过滤后的列表） */
export interface HomeDayGroup {
  id: string;                   // "YYYY-MM-DD"
  label: string;                // "今天" / "昨天" / "4月5日"
  items: HomeTransaction[];     // 该天全部条目
  visibleItems: HomeTransaction[]; // 经过分类过滤后的可见条目
}

interface SourceBadgeVisual {
  label: string;
  chipClassName: string;
}

/**
 * 来源标签是跨首页日卡、拖拽细则、详情页都会反复出现的视觉语义。
 * 这里统一返回 design token class，避免首页继续散落“微信蓝/全部橙色”之类的历史硬编码。
 */
function getSourceBadgeVisual(sourceType?: HomeTransaction["sourceType"]): SourceBadgeVisual {
  if (sourceType === "wechat") {
    return {
      label: "微信",
      chipClassName: "bg-success-surface text-success-text",
    };
  }

  if (sourceType === "alipay") {
    return {
      label: "支付宝",
      chipClassName: "bg-info-surface text-ink",
    };
  }

  if (sourceType === "manual") {
    return {
      label: "随手记",
      chipClassName: "bg-warn-surface text-ink",
    };
  }

  return {
    label: "未知来源",
    chipClassName: "bg-surface text-dim",
  };
}

/** 看板轮播控制接口 */
export interface ControlUpdateRef {
  ref: React.RefObject<HTMLDivElement | null>;
  move: (clientY: number) => void;
}

/**
 * 首页金额展示格式化。
 *
 * 这里不改变业务层真实数值，只在展示层做统一收口：
 * 1. 消除浮点运算后偶发出现的超长小数尾巴
 * 2. 最多保留两位小数
 * 3. 整数不强制补零，避免视觉上过于拥挤
 */
function formatCurrencyAmount(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

// ──────────────────────────────────────────────
// 纯视觉组件
// ──────────────────────────────────────────────

/**
 * Decor — Memphis 背景装饰
 * 使用固定随机种子，保证每次渲染结果一致
 */
export function Decor() {
  const shapes = React.useMemo(() => seededShapes(777, 9, { x: 0, y: 40, w: 390, h: 900 }), []);
  return (
    <svg
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "visible" }}
      width="100%"
      height="100%"
    >
      {shapes.map((shape) => {
        if (shape.type === "circle") {
          return <circle key={shape.id} cx={shape.x} cy={shape.y} r={shape.size / 2} fill={shape.color} opacity={shape.opacity} />;
        }
        if (shape.type === "square") {
          return (
            <rect
              key={shape.id}
              x={shape.x}
              y={shape.y}
              width={shape.size}
              height={shape.size}
              rx="1.5"
              fill={shape.color}
              opacity={shape.opacity}
              transform={`rotate(${shape.rotation} ${shape.x + shape.size / 2} ${shape.y + shape.size / 2})`}
            />
          );
        }
        if (shape.type === "triangle") {
          return (
            <polygon
              key={shape.id}
              points={`${shape.x},${shape.y + shape.size} ${shape.x + shape.size / 2},${shape.y} ${shape.x + shape.size},${shape.y + shape.size}`}
              fill={shape.color}
              opacity={shape.opacity}
            />
          );
        }
        // zigzag：一条横线
        return (
          <line
            key={shape.id}
            x1={shape.x}
            y1={shape.y}
            x2={shape.x + shape.size * 1.6}
            y2={shape.y}
            stroke={shape.color}
            strokeWidth="2"
            strokeLinecap="round"
            opacity={shape.opacity}
          />
        );
      })}
    </svg>
  );
}

/**
 * Logo — Moni SVG 字标（含三色装饰点）
 */
export function Logo() {
  return (
    <svg width="118" height="38" viewBox="0 0 140 42">
      <text x="4" y="32" fill={C.dark} fontSize="28" fontWeight="800" fontFamily="'Nunito',sans-serif" letterSpacing="-1">M</text>
      <circle cx="25" cy="32" r="1.8" fill={C.coral} opacity=".75" />
      <text x="30" y="32" fill={C.dark} fontSize="28" fontWeight="800" fontFamily="'Nunito',sans-serif" letterSpacing="-1">oni</text>
      <circle cx="27" cy="9" r="3.6" fill={C.coral} opacity=".72" />
      <circle cx="20" cy="5" r="2.4" fill={C.blue} opacity=".62" />
      <rect x="23" y="2.5" width="4" height="4" rx=".8" fill={C.yellow} opacity=".55" transform="rotate(20 25 4.5)" />
      <line x1="68" y1="7" x2="75" y2="7" stroke={C.mint} strokeWidth="1.8" strokeLinecap="round" opacity=".35" />
    </svg>
  );
}

interface LedgerHeaderControlProps {
  ledgerName: string;
  onClick?: () => void;
  ariaLabel?: string;
}

/**
 * LedgerHeaderControl — 首页与记账页共用的账本选择器外观。
 *
 * 这次专门抽出来，是因为用户明确要求两页右上角的“日常开销”必须
 * 在位置、宽度、圆角和排版上完全一致；不能再各写一份近似样式。
 */
export function LedgerHeaderControl({ ledgerName, onClick, ariaLabel }: LedgerHeaderControlProps) {
  const interactive = typeof onClick === "function";

  return (
    <div
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        width: LEDGER_HEADER_CONTROL_WIDTH,
        height: 34,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 6,
        padding: "0 14px",
        borderRadius: 999,
        background: C.white,
        border: `1.8px solid ${C.dark}`,
        color: C.dark,
        fontSize: 13,
        fontWeight: 700,
        lineHeight: 1,
        cursor: interactive ? "pointer" : "default",
        boxShadow: "0 1px 0 rgba(0,0,0,.04)",
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          flex: 1,
          minWidth: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          textAlign: "center",
        }}
      >
        {ledgerName}
      </span>
      <svg width="11" height="11" viewBox="0 0 10 10" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M2 3.8L5 6.8L8 3.8" stroke={C.dark} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

interface RootLedgerPageHeaderProps {
  currentLedger: LedgerOption;
  availableLedgers: LedgerOption[];
  onSwitchLedger: (ledgerId: string) => void | Promise<unknown>;
}

/**
 * RootLedgerPageHeader — 首页与记账页自己的顶部页头。
 *
 * 当前实现刻意把“状态宿主”和“视觉页头”拆开：
 * - 账本状态仍可由 AppRoot 常驻持有，保证跨页不闪；
 * - header DOM 则回到页面自己渲染，避免拖拽层、详情页继续被 Root 常驻页头挤压。
 */
export function RootLedgerPageHeader({
  currentLedger,
  availableLedgers,
  onSwitchLedger,
}: RootLedgerPageHeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!dropdownOpen) {
      return undefined;
    }

    /**
     * 账本下拉属于页头局部交互，点击外部关闭的监听也应该留在这里，
     * 而不是继续让 AppRoot 为某个具体页头 DOM 背状态。
     */
    const handlePointerDown = (event: PointerEvent) => {
      if (!dropdownWrapRef.current?.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [dropdownOpen]);

  return (
    <div
      style={{
        padding: `${APP_HEADER_PADDING_TOP} 16px 10px`,
        minHeight: APP_HEADER_MIN_HEIGHT,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: C.bg,
        zIndex: 20,
        flexShrink: 0,
        position: "relative",
      }}
    >
      <Logo />

      <div
        ref={dropdownWrapRef}
        style={{
          width: LEDGER_HEADER_CONTROL_WIDTH,
          display: "flex",
          justifyContent: "flex-end",
          position: "relative",
        }}
      >
        <LedgerHeaderControl
          ledgerName={currentLedger.name}
          ariaLabel="切换账本"
          onClick={() => setDropdownOpen((open) => !open)}
        />

        {dropdownOpen ? (
          <div
            style={{
              position: "absolute",
              top: 40,
              right: 0,
              minWidth: 146,
              maxWidth: 220,
              background: C.white,
              border: `2px solid ${C.dark}`,
              borderRadius: 14,
              boxShadow: "0 8px 20px rgba(0,0,0,.14)",
              overflow: "hidden",
              zIndex: 40,
            }}
          >
            {availableLedgers.map((ledger, index) => {
              const selected = ledger.id === currentLedger.id;

              return (
                <div
                  key={ledger.id}
                  onClick={() => {
                    void Promise.resolve(onSwitchLedger(ledger.id)).catch((error) => {
                      console.error("[RootLedgerPageHeader] Failed to switch ledger:", error);
                    });
                    setDropdownOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 12px",
                    cursor: "pointer",
                    borderBottom: index < availableLedgers.length - 1 ? `1px solid ${C.line}` : "none",
                    background: selected ? C.blueBg : C.white,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: selected ? 700 : 600,
                      color: C.dark,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {ledger.name}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: selected ? C.dark : "transparent",
                      fontWeight: 700,
                    }}
                  >
                    ✓
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 业务展示组件
// ──────────────────────────────────────────────

interface TagChipProps {
  /** 分类名（中文），为 null 时不渲染 */
  category?: string | null;
  /** 当前页面已构建好的分类视觉注册表 */
  categoryVisuals?: Record<string, CategoryVisual>;
  /** 显示未分类警示样式 */
  warning?: boolean;
}

/** TagChip — 分类标签徽章 */
export function TagChip({ category, categoryVisuals, warning }: TagChipProps) {
  if (warning) {
    return (
      <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 999, fontWeight: 700, background: C.pinkBg, color: "#D85A30", border: "1px dashed #D85A30", whiteSpace: "nowrap" }}>
        未分类
      </span>
    );
  }
  if (!category) return null;
  const visual = resolveCategoryVisual(category, categoryVisuals);
  if (!visual) return null;
  return (
    <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 999, fontWeight: 700, background: visual.bg, color: visual.color, whiteSpace: "nowrap" }}>
      {category}
    </span>
  );
}

interface HintCardProps {
  visible: boolean;
  icon?: string;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose: () => void;
}

/** HintCard — 情景提示卡（有则显示，无则消失） */
export function HintCard({ visible, icon = "📄", title, description, actionLabel, onAction, onClose }: HintCardProps) {
  if (!visible || !title || !description) return null;
  return (
    <div className="fi" style={{ margin: "6px 16px", background: C.warmBg, border: `1.5px solid ${C.warmBd}`, borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: "#8B5E2B", fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 10, color: "#A07040" }}>{description}</div>
      </div>
      {actionLabel && (
        <div
          onClick={onAction}
          style={{ fontSize: 11, color: "#8B5E2B", fontWeight: 600, background: C.white, border: "1px solid #E0C09A", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}
        >
          {actionLabel}
        </div>
      )}
      <span style={{ fontSize: 14, color: "#CCC", cursor: "pointer" }} onClick={onClose}>×</span>
    </div>
  );
}

interface StatsBarProps {
  rangeLabel: string;
  expenseTotal: number;
  incomeTotal: number;
  count: number;
  /** 是否为自定义范围（影响笔数标签文案） */
  isCustom: boolean;
}

/** StatsBar — 统计摘要栏（支出 / 收入 / 笔数三卡） */
export function StatsBar({ rangeLabel, expenseTotal, incomeTotal, count, isCustom }: StatsBarProps) {
  return (
    <div style={{ margin: "6px 16px", display: "flex", gap: 6 }}>
      {[
        { label: `${rangeLabel}支出`, value: `¥${expenseTotal.toLocaleString()}`, color: C.coral },
        { label: `${rangeLabel}收入`, value: `¥${incomeTotal.toLocaleString()}`, color: C.mint },
        { label: isCustom ? "区间笔数" : "共计", value: `${count} 笔`, color: C.dark },
      ].map((item) => (
        <div key={item.label} style={{ flex: 1, background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "7px 8px", textAlign: "center" }}>
          <div style={{ fontSize: 9, color: C.sub }}>{item.label}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: item.color, fontFamily: "'Space Mono',monospace" }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

interface DisplayBoardProps {
  currentIndex: number;
  budgetPeriodLabel: string;
  budgetAmount: number;
  spentAmount: number;
  remainingAmount: number;
  remainingDays: number;
  dailyAvailableAmount: number;
  budgetStatusLabel: string;
  /** 预算使用百分比（0-100） */
  budgetPct: number;
  /** 预算状态色值 */
  budgetColor: string;
  /** 是否有预算（无预算时不显示轮播圆点，不显示预算卡） */
  hasBudget: boolean;
  /** 完整趋势历史数据（不受 dateRange 过滤），用于连续滚动渲染 */
  allTrendPoints: TrendPoint[];
  /**
   * 趋势图连续滚动偏移（像素）。
   * 0 = 最左侧（最早数据），maxOffset = 最右侧（最新数据）。
   * 由页面容器在 pointermove 中实时更新，实现跟手效果。
   */
  trendScrollOffsetPx: number;
  onManualSwitch: (index: number) => void;
  boardHandlers: React.HTMLAttributes<HTMLDivElement>;
  trendHandlers: React.HTMLAttributes<HTMLDivElement>;
  /** 外部 ref，DisplayBoard 每次渲染时写入实测的 maxScrollOffset，供父容器拖拽 clamp 使用 */
  maxScrollOffsetRef?: React.MutableRefObject<number>;
}

/** DisplayBoard — 顶部看板（预算卡 + 折线图卡，上下轮播） */
export function DisplayBoard({
  currentIndex,
  budgetPeriodLabel,
  budgetAmount,
  spentAmount,
  remainingAmount,
  remainingDays,
  dailyAvailableAmount,
  budgetStatusLabel,
  budgetPct,
  budgetColor,
  hasBudget,
  allTrendPoints,
  trendScrollOffsetPx,
  onManualSwitch,
  boardHandlers,
  trendHandlers,
  maxScrollOffsetRef,
}: DisplayBoardProps) {
  // 折线图容器宽度：从 window.innerWidth 一次性推算，不使用 ResizeObserver。
  // ResizeObserver 在滚动中途触发会改变 pointWidth / maxScrollOffset，
  // 导致 clamp 跳变（体感上一天一天地跳），因此固定为静态值。
  // 卡片 margin×2(32) + border×2(4) + padding×2(28) + Y轴标注列宽(40) = 104
  const chartViewportWidth = useMemo(
    () => Math.max(200, Math.floor(window.innerWidth - 104)),
    []
  );

  const pointWidth = chartViewportWidth / 7;
  const totalWidth = Math.max(chartViewportWidth, allTrendPoints.length * pointWidth);
  const maxScrollOffset = totalWidth - chartViewportWidth;
  // 把实测的 maxScrollOffset 写回父容器 ref，供拖拽 clamp 使用
  if (maxScrollOffsetRef) maxScrollOffsetRef.current = maxScrollOffset;
  const clampedOffset = Math.max(0, Math.min(maxScrollOffset, trendScrollOffsetPx));

  // 可见窗口起止索引
  const visibleStartIdx = Math.max(0, Math.floor(clampedOffset / pointWidth));
  const visibleEndIdx = Math.min(allTrendPoints.length - 1, visibleStartIdx + 6);

  // 可见窗口内的最大值（动态 Y 轴基准）——仅当有数据时才更新，否则保持 1 避免除零
  const localMax = allTrendPoints.length > 0
    ? Math.max(1, ...allTrendPoints.slice(visibleStartIdx, visibleEndIdx + 1).map((p) => p.amount))
    : 1;

  // displayMax：仅在 localMax 变化（新最大值进入窗口、或旧最大值离开窗口）时才触发平滑动画
  const [displayMax, setDisplayMax] = useState(localMax);
  const displayMaxRef = useRef(localMax);
  const targetMaxRef = useRef(localMax);
  const animFrameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (localMax === targetMaxRef.current) return;
    targetMaxRef.current = localMax;
    const startVal = displayMaxRef.current;
    const endVal = localMax;
    const duration = 450;
    const startTime = performance.now();
    if (animFrameRef.current !== undefined) cancelAnimationFrame(animFrameRef.current);
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      // ease-in-out quad
      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const val = startVal + (endVal - startVal) * eased;
      displayMaxRef.current = val;
      setDisplayMax(val);
      if (t < 1) animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => { if (animFrameRef.current !== undefined) cancelAnimationFrame(animFrameRef.current); };
  }, [localMax]);

  // Y 轴最大值紧凑格式（¥ 前缀由调用方负责）
  const fmtMax = (v: number) => v >= 10000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`;

  // 以下几项仅依赖 allTrendPoints（不依赖 clampedOffset），用 useMemo 缓存
  const lastDataIdx = useMemo(
    () => allTrendPoints.reduce((acc, p, i) => (p.amount > 0 ? i : acc), -1),
    [allTrendPoints]
  );
  const dataSegment = useMemo(
    () => lastDataIdx >= 0 ? allTrendPoints.slice(0, lastDataIdx + 1) : [],
    [allTrendPoints, lastDataIdx]
  );
  const futureSegment = useMemo(() =>
    lastDataIdx >= 0 && lastDataIdx < allTrendPoints.length - 1
      ? allTrendPoints.slice(lastDataIdx)
      : lastDataIdx < 0 && allTrendPoints.length > 0
        ? allTrendPoints
        : [],
    [allTrendPoints, lastDataIdx]
  );

  // SVG 路径字符串：依赖 allTrendPoints + displayMax + pointWidth。
  // 滚动时 displayMax 稳定，路径字符串直接从缓存取，不重算。
  const toPt = (item: TrendPoint, i: number) =>
    `${(i + 0.5) * pointWidth},${50 - (item.amount / displayMax) * 42}`;
  const polygonPoints = useMemo(() => {
    if (dataSegment.length === 0) return "";
    return [
      ...dataSegment.map((item, i) => toPt(item, i)),
      `${(lastDataIdx + 0.5) * pointWidth},50`,
      `0,50`,
    ].join(" ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSegment, displayMax, pointWidth, lastDataIdx]);
  const dataPolylinePoints = useMemo(
    () => dataSegment.map((item, i) => toPt(item, i)).join(" "),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataSegment, displayMax, pointWidth]
  );
  const futurePolylinePoints = useMemo(
    () => futureSegment.map((item, i) => toPt(item, lastDataIdx < 0 ? i : lastDataIdx + i)).join(" "),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [futureSegment, displayMax, pointWidth, lastDataIdx]
  );

  // date label span 数组：仅依赖 allTrendPoints + pointWidth，滚动和动画期间都不会变
  const dateLabels = useMemo(() =>
    allTrendPoints.map((item) => (
      <span key={item.key} style={{ width: pointWidth, flexShrink: 0, textAlign: "center" }}>{item.label}</span>
    )),
    [allTrendPoints, pointWidth]
  );

  const visibleStartKey = allTrendPoints[visibleStartIdx]?.key;
  const visibleEndKey = allTrendPoints[visibleEndIdx]?.key;
  const trendWindowLabel = visibleStartKey && visibleEndKey
    ? `${visibleStartKey.slice(5)} ~ ${visibleEndKey.slice(5)}`
    : "近 7 天支出";

  return (
    <div
      {...boardHandlers}
      style={{ margin: "4px 16px", overflow: "hidden", borderRadius: 14, border: `2px solid ${C.dark}`, height: 132, position: "relative", background: C.white, touchAction: "pan-x" }}
    >
      <div style={{ transition: "transform .45s cubic-bezier(.4,0,.2,1)", transform: `translateY(-${hasBudget ? currentIndex * 132 : 0}px)` }}>
        {/* 预算卡：无预算时彻底不渲染 */}
        {hasBudget && <div style={{ height: 132, padding: "16px 16px 14px", position: "relative", overflow: "hidden" }}>
          {/* 顶部进度条：宽度 = usageRatio * 100%，颜色随预算状态变化 */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg,${budgetColor} ${budgetPct}%,#EEE ${budgetPct}%)` }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: C.sub }}>{budgetPeriodLabel}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: C.dark, letterSpacing: -1, fontFamily: "'Space Mono',monospace" }}>¥{budgetAmount.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: budgetColor, marginTop: 2 }}>
                {budgetStatusLabel} · 已花 ¥{spentAmount.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                剩余 ¥{remainingAmount.toLocaleString()} · 还有 {remainingDays} 天
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: C.sub }}>日均可用</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.dark, fontFamily: "'Space Mono',monospace" }}>¥{dailyAvailableAmount.toLocaleString()}</div>
            </div>
          </div>
        </div>}

        {/* 折线图卡 — 连续滚动式时间轴 */}
        <div {...trendHandlers} style={{ height: 132, padding: "12px 14px", position: "relative", touchAction: "none" }}>
          {/* 顶部标题行：日期范围 + "支出情况" */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: C.sub }}>{trendWindowLabel}</div>
            <div style={{ fontSize: 10, color: C.sub }}>支出情况</div>
          </div>

          {/* SVG 折线图区域 + 右侧 Y 轴最大/最小值标注 */}
          <div style={{ display: "flex", alignItems: "flex-start" }}>
          {/* flex:1 让 SVG 容器撑满剩余空间 */}
          <div style={{ flex: 1, overflow: "hidden", height: 58 }}>
            <svg
              width={totalWidth}
              height="58"
              viewBox={`0 0 ${totalWidth} 58`}
              style={{ transform: `translateX(${-clampedOffset}px)`, transition: "none", display: "block" }}
            >
              {/* 填充区：仅覆盖数据段，随 displayMax 动画同步伸缩 */}
              {polygonPoints && (
                <polygon points={polygonPoints} fill={C.mint} opacity=".08" />
              )}
              {/* 数据段折线（有支出记录，mint 色） */}
              {dataPolylinePoints && (
                <polyline
                  points={dataPolylinePoints}
                  fill="none"
                  stroke={C.mint}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {/* 未来/未导入段折线（灰色虚线，贴底边表示无数据） */}
              {futureSegment.length > 1 && (
                <polyline
                  points={futurePolylinePoints}
                  fill="none"
                  stroke="#C8C8C8"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="4 3"
                />
              )}
            </svg>
          </div>
          {/* Y 轴最大值（顶部对齐）与最小值（底部对齐）；width:40 覆盖五位数安全空间 */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", paddingLeft: 8, width: 40, height: 58, flexShrink: 0 }}>
            <span style={{ fontSize: 8, color: "#BBB", lineHeight: 1, textAlign: "left" }}>¥{fmtMax(displayMax)}</span>
            <span style={{ fontSize: 8, color: "#BBB", lineHeight: 1, textAlign: "left" }}>¥0</span>
          </div>
          </div>{/* end SVG + Y轴 flex 行 */}

          {/* 日期标签条：与 SVG 同步滚动；宽度对齐 SVG 容器 */}
          <div style={{ width: chartViewportWidth, overflow: "hidden" }}>
            <div style={{ display: "flex", fontSize: 8, color: "#BBB", width: totalWidth, transform: `translateX(${-clampedOffset}px)`, transition: "none" }}>
              {dateLabels}
            </div>
          </div>
        </div>
      </div>

      {/* 轮播圆点（仅有预算时显示） */}
      {hasBudget && (
        <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", display: "flex", flexDirection: "column", gap: 5 }}>
          {[0, 1].map((index) => (
            <div
              key={index}
              onClick={() => onManualSwitch(index)}
              style={{ width: 5, height: 5, borderRadius: "50%", background: currentIndex === index ? C.dark : "#CCC", cursor: "pointer" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface OverviewCardProps {
  rangeLabel: string;
  overview: OverviewItem[];
  categoryVisuals: Record<string, CategoryVisual>;
  onOpen: () => void;
}

/** OverviewCard — 分类概览横条图 */
export function OverviewCard({ rangeLabel, overview, categoryVisuals, onOpen }: OverviewCardProps) {
  return (
    <div style={{ margin: "6px 16px", background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "10px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.dark }}>分类概览</div>
        <div onClick={onOpen} style={{ fontSize: 11, color: C.mint, fontWeight: 600, cursor: "pointer" }}>{rangeLabel} ›</div>
      </div>
      <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden" }}>
        {overview.map((item) => (
          <div
            key={item.category}
            style={{
              width: `${Math.max(item.percent, 4)}%`,
              background: item.category === "未分类"
                ? `repeating-linear-gradient(45deg,${UNCLASSIFIED_CATEGORY_VISUAL.overviewColor}33,${UNCLASSIFIED_CATEGORY_VISUAL.overviewColor}33 2px,${UNCLASSIFIED_CATEGORY_VISUAL.overviewColor}55 2px,${UNCLASSIFIED_CATEGORY_VISUAL.overviewColor}55 4px)`
                : (resolveCategoryVisual(item.category, categoryVisuals)?.overviewColor ?? C.gray),
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 10px", marginTop: 6, fontSize: 9, color: "#666" }}>
        {overview.map((item) => (
          <span key={item.category} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span
              style={{
                width: 6, height: 6, borderRadius: 1.5,
                background: item.category === "未分类"
                  ? UNCLASSIFIED_STRIPE
                  : (resolveCategoryVisual(item.category, categoryVisuals)?.overviewColor ?? C.gray),
                border: item.category === "未分类" ? `1px solid ${UNCLASSIFIED_CATEGORY_VISUAL.overviewColor}` : "none",
                display: "inline-block",
              }}
            />
            {item.category} {item.percent}%
          </span>
        ))}
      </div>
    </div>
  );
}

interface TagRailProps {
  filters: string[];
  selectedFilter: string;
  unclassifiedCount: number;
  onSelect: (label: string) => void;
}

/** TagRail — 分类筛选标签轨道（横向滚动，sticky 吸附） */
export function TagRail({ filters, selectedFilter, unclassifiedCount, onSelect }: TagRailProps) {
  return (
    <div style={{ margin: 0, background: "transparent", padding: "0 16px 8px" }}>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, overscrollBehaviorX: "contain" } as React.CSSProperties}>
        {filters.map((label) => {
          const active = selectedFilter === label;
          const warning = label === "未分类";
          return (
            <div
              key={label}
              onClick={() => onSelect(label)}
              style={{
                padding: "5px 12px",
                borderRadius: 999,
                fontSize: 11,
                whiteSpace: "nowrap",
                cursor: "pointer",
                fontWeight: active ? 700 : 600,
                transition: "all .2s",
                flexShrink: 0,
                background: active ? C.dark : warning ? C.pinkBg : C.white,
                color: active ? C.bg : warning ? "#D85A30" : "#666",
                border: active ? "none" : `1.5px solid ${warning ? C.pinkBd : C.border}`,
              }}
            >
              {label}{warning ? ` · ${unclassifiedCount}` : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface DayCardProps {
  day: HomeDayGroup;
  isExpanded: boolean;
  hideCategoryTag?: boolean;
  categoryVisuals: Record<string, CategoryVisual>;
  /** 该天是否正处于 AI 处理状态（显示流光边框和骨架屏） */
  isAi: boolean;
  /** AI 是否处于软停止过渡状态（显示琥珀色"正在完成…"） */
  aiStop: boolean;
  onToggle: () => void;
  onItemPointerDown: (item: HomeTransaction, event: React.PointerEvent) => void;
  onItemPointerMove: (event: React.PointerEvent) => void;
  onItemPointerUp: (event: React.PointerEvent) => void;
  onItemPointerCancel?: (event: React.PointerEvent) => void;
  dayRef: (node: HTMLDivElement | null) => void;
}

/** DayCard — 按天分组流水卡片（三阶段展开：收起/展开/AI工作态） */
export function DayCard({ day, isExpanded, hideCategoryTag = false, categoryVisuals, isAi, aiStop, onToggle, onItemPointerDown, onItemPointerMove, onItemPointerUp, onItemPointerCancel, dayRef }: DayCardProps) {
  /**
   * 日卡条目已改为“收支混排”，因此头部摘要不能再默认把所有金额都当成支出。
   * 当前展示策略：
   * - 有支出时，头部主数值继续优先表达当天支出总额；
   * - 若当天只有收入没有支出，则改为展示收入总额；
   * - 条目行自身始终根据 `direction` 显示正负号与颜色。
   */
  const expenseTotal = day.visibleItems
    .filter((item) => item.direction !== "in")
    .reduce((sum, item) => sum + item.a, 0);
  const incomeTotal = day.visibleItems
    .filter((item) => item.direction === "in")
    .reduce((sum, item) => sum + item.a, 0);
  const hasExpense = expenseTotal > 0;
  const hasIncome = incomeTotal > 0;
  const allClassified = day.items.every((item) => getCategory(item));
  // 完全收起摘要态：未展开 且 不是 AI 处理中
  const isCollapsedSummary = !isExpanded && !isAi;

  return (
    <div
      ref={dayRef}
      className={isAi ? "ab" : ""}
      style={{
        background: C.white,
        borderRadius: 14,
        padding: isCollapsedSummary ? "13px 14px" : "12px 14px",
        marginBottom: 8,
        border: isAi ? undefined : isCollapsedSummary ? `1.5px solid ${C.border}` : `2px solid ${C.dark}`,
        opacity: isCollapsedSummary ? 0.76 : 1,
        transition: "all .25s ease",
      }}
    >
      {/* 卡片头部：日期标签 + AI 处理指示 + 当天双值金额摘要 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={onToggle}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>{day.label}</span>
          {isAi && (
            <span style={{ fontSize: 10, color: aiStop ? C.amber : C.mint, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: aiStop ? C.amber : C.mint, animation: "p 1.5s infinite" }} />
              {aiStop ? "正在完成…" : "AI 处理中"}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontFamily: "'Space Mono',monospace", fontWeight: 500 }}>
          {hasExpense ? <span className="text-coral">-¥{formatCurrencyAmount(expenseTotal)}</span> : null}
          {hasExpense && hasIncome ? <span className="text-dim">/</span> : null}
          {hasIncome ? <span className="text-mint">+¥{formatCurrencyAmount(incomeTotal)}</span> : null}
        </div>
      </div>

      {/* 收起摘要行 */}
      {!isExpanded && !isAi && (
        <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
          {day.visibleItems.length} 笔 · {allClassified ? "全部已分类 ✓" : `${day.visibleItems.filter((item) => !getCategory(item)).length} 笔未分类`}
        </div>
      )}

      {/* 展开后的条目列表 */}
      {(isExpanded || isAi) && (
        <div className="fi" style={{ marginTop: 6 }}>
          {day.visibleItems.map((item, index) => {
            /**
             * 旧实现会在 AI 工作态下只保留第一条真实流水，其余全部替换成骨架。
             * 这会把同一天剩余条目直接“遮掉”，用户无法继续查看完整上下文。
             *
             * 当前口径改为：
             * - AI 工作态只负责高亮整张日卡与头部状态提示；
             * - 卡片体继续完整展示当天真实流水，不再用骨架覆盖后续条目。
             */
            const category = getCategory(item);
            const visual = resolveCategoryVisual(category, categoryVisuals);
            const sourceBadge = getSourceBadgeVisual(item.sourceType);
            // aiOnly：只有 AI 分类，没有用户确认分类
            const aiOnly = !item.userCat;

            return (
              <div
                key={item.id}
                onPointerDown={(event) => onItemPointerDown(item, event)}
                onPointerMove={onItemPointerMove}
                onPointerUp={onItemPointerUp}
                onPointerCancel={onItemPointerCancel ?? onItemPointerUp}
                style={{ display: "flex", alignItems: "center", padding: "7px 0", borderBottom: index < day.visibleItems.length - 1 ? `0.5px solid ${C.line}` : "none", cursor: "pointer", userSelect: "none", touchAction: "none" }}
              >
                {/* 左侧图标区：有分类用 emoji，无分类用斜杠纹 + 问号 */}
                <div style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, marginRight: 10, flexShrink: 0, background: category && visual ? visual.bg : UNCLASSIFIED_STRIPE, border: category ? "none" : `1.5px dashed ${UNCLASSIFIED_CATEGORY_VISUAL.overviewColor}` }}>
                  {category && visual ? pickCategoryIcon(visual, item.ih) : <span style={{ fontSize: 13, color: UNCLASSIFIED_CATEGORY_VISUAL.color, fontWeight: 700 }}>?</span>}
                </div>
                {/* 中间：商户名 + 分类徽章 + AI 理由 + 时间支付方式 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 5, flexWrap: "wrap", minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: C.dark,
                        flex: "1 1 120px",
                        minWidth: 0,
                        whiteSpace: "normal",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                        lineHeight: 1.35,
                      }}
                    >
                      {item.n}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-pill px-[5px] py-[1px] text-[9px] font-bold ${sourceBadge.chipClassName}`}
                    >
                      {item.sourceLabel?.trim() || sourceBadge.label}
                    </span>
                    {!hideCategoryTag && (category ? <TagChip category={category} categoryVisuals={categoryVisuals} /> : <TagChip warning />)}
                  </div>
                  <div style={{ fontSize: 9, color: C.muted, marginTop: 2, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                    {/* 手记说明优先显示 user_note，其余条目在 AI 暂定态显示 reasoning */}
                    {item.sourceType === "manual" && item.userNote && (
                      <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 999, background: "#F5F5F5", color: "#666" }}>
                        {item.userNote}
                      </span>
                    )}
                    {item.sourceType !== "manual" && aiOnly && item.reason && (
                      <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 999, background: C.greenBg, color: C.greenText }}>AI: {item.reason}</span>
                    )}
                    <span>{item.t} · {item.sourceType === "manual" ? "手动记录" : item.pay}</span>
                  </div>
                </div>
                {/* 右侧金额 */}
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: item.direction === "in" ? C.mint : (category ? C.dark : "#D85A30"),
                    flexShrink: 0,
                    marginLeft: 8,
                    fontFamily: "'Space Mono',monospace"
                  }}
                >
                  {item.direction === "in" ? "+" : "−"}¥{formatCurrencyAmount(item.a)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}



interface DragOverlayProps {
  dragItem: HomeTransaction | null;
  dragPoint: { x: number; y: number } | null;
  hoverCategory: string | null;
  panelState?: "collapsed" | "expanded";
  onDrop: (category: string) => void;
  onClose: () => void;
  /** 当前账本可用分类列表（来自 LedgerService，替代全局 CAT） */
  availableCategories?: string[];
  /** 当前页面已构建好的分类视觉注册表 */
  categoryVisuals: Record<string, CategoryVisual>;
}

/**
 * 拖拽预览卡片需要继承首页原条目的图标语义。
 * 若条目已有分类，则继续使用该分类当前在首页列表中的图标与色彩；仅未分类时回退到问号占位。
 */
function resolveDragPreviewVisual(item: HomeTransaction, categoryVisuals?: Record<string, CategoryVisual>) {
  const category = getCategory(item);
  const visual = resolveCategoryVisual(category, categoryVisuals);
  if (!visual) {
    return {
      icon: "?",
      accentColor: UNCLASSIFIED_CATEGORY_VISUAL.color,
      tileBackground: C.orangeBg,
      tileBorder: `1.5px dashed ${UNCLASSIFIED_CATEGORY_VISUAL.color}`,
      isFallback: true,
    };
  }

  return {
    icon: pickCategoryIcon(visual, item.ih),
    accentColor: visual.color,
    tileBackground: visual.bg,
    tileBorder: `1.5px solid ${visual.color}33`,
    isFallback: false,
  };
}

/** DragOverlay — 拖拽分类蒙版（长按条目触发） */
export function DragOverlay({
  dragItem,
  dragPoint,
  hoverCategory,
  panelState = "collapsed",
  onDrop,
  onClose,
  availableCategories,
  categoryVisuals,
}: DragOverlayProps) {
  const CATEGORY_ZONE_TOP_MARGIN_PX = 12;
  /**
   * 分类区、安全带、折叠态细则区三段必须紧密拼接。
   * 因此这里不再额外塞任何补偿间距，只预留“安全带 + 折叠态细则区”本身高度。
   */
  const CATEGORY_ZONE_BOTTOM_GAP_PX = DRAG_PANEL_COLLAPSED_VISIBLE_PX + DRAG_PANEL_SAFETY_ZONE_HEIGHT_PX;
  const CATEGORY_ZONE_TITLE_HEIGHT_PX = 28;
  const PANEL_OFFSCREEN_PX = 56;
  const PANEL_EXPAND_DELTA_PX = DRAG_PANEL_EXPANDED_VISIBLE_PX - DRAG_PANEL_COLLAPSED_VISIBLE_PX;
  const [panelEntered, setPanelEntered] = useState(false);
  const isExpanded = panelState === "expanded";
  const displayTitle = dragItem ? resolveTransactionDisplayTitle(dragItem) : "未知交易";
  const previewVisual = dragItem ? resolveDragPreviewVisual(dragItem, categoryVisuals) : null;
  const displayCategory = dragItem?.userCat?.trim() || dragItem?.aiCat?.trim() || "未分类";
  const detailLine = dragItem?.userCat?.trim()
    ? (dragItem.userNote?.trim() || "")
    : dragItem?.aiCat?.trim()
      ? (dragItem.reason?.trim() || "")
      : "";
  const sourceBadge = getSourceBadgeVisual(dragItem?.sourceType);
  const directionLabel = dragItem?.direction === "in" ? "收入" : "支出";
  const amountLabel = `${directionLabel} ¥${formatCurrencyAmount(dragItem?.a ?? 0)}`;
  const remarkText = normalizeTransactionDetailText(dragItem?.remark);
  const paymentText = dragItem?.pay?.trim() || "未提供";
  const sourceTypeText = dragItem?.sourceType === "wechat"
    ? "微信"
    : dragItem?.sourceType === "alipay"
      ? "支付宝"
      : "随手记";
  const sourceLabelText = dragItem?.sourceLabel?.trim() || sourceBadge.label;
  const productText = dragItem
    ? (resolveTransactionDisplayProductText(dragItem) || normalizeTransactionDetailText(dragItem.n) || "未知交易")
    : "未知交易";
  const counterpartyText = normalizeTransactionDetailText(dragItem?.counterparty);
  const rawClassText = normalizeTransactionDetailText(dragItem?.rawClass);
  const fullTimeText = normalizeTransactionDetailText(dragItem?.fullTimeLabel) || normalizeTransactionDetailText(dragItem?.t) || "时间未知";
  const transactionStatusText = normalizeTransactionDetailText(dragItem?.transactionStatus) || "SUCCESS";
  const shouldShowSourceTypeText = sourceTypeText !== sourceLabelText;
  const amountAccentColor = dragItem?.direction === "in" ? C.mint : C.coral;
  /**
   * 标题和金额在收缩态 / 展开态保持同一套字号体系，避免状态切换时视觉跳变。
   * 金额也不再使用等宽字体，改回与页面标题一致的主字体，只保留 tabular 数字对齐。
   */
  const panelHeadlineTitleStyle = {
    fontSize: 18,
    lineHeight: 1.14,
    fontWeight: 900,
    color: C.dark,
    letterSpacing: "-0.01em",
  } as const;
  const panelHeadlineAmountStyle = {
    fontSize: 18,
    lineHeight: 1.08,
    fontWeight: 900,
    color: amountAccentColor,
    fontFamily: "'Nunito',sans-serif",
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "-0.01em",
  } as const;
  /**
   * 驻留区是“停留查看详情”的稳定语义，不再跟随条目分类颜色切换。
   * 这里统一使用主题青色，避免之前红色系造成的误导和脏感。
   */
  const residentZoneBorderColor = C.mint;
  const residentZoneBackground = "linear-gradient(180deg, rgba(78,205,196,.22) 0%, rgba(255,255,255,.98) 100%)";
  const transitionLaneBackground = "radial-gradient(ellipse at 50% 86%, rgba(78,205,196,.20) 0%, rgba(255,255,255,0) 62%)";
  const detailSections = [
    { label: "交易时间", value: fullTimeText },
    counterpartyText && counterpartyText !== displayTitle ? { label: "交易对方", value: counterpartyText } : null,
    productText && productText !== displayTitle ? { label: "商品说明", value: productText } : null,
    rawClassText ? { label: "原始分类", value: rawClassText } : null,
    { label: "支付方式", value: paymentText },
    transactionStatusText !== "SUCCESS" ? { label: "交易状态", value: transactionStatusText } : null,
    { label: "备注", value: remarkText || "暂无备注" },
  ].filter((section): section is { label: string; value: string } => Boolean(section));
  const panelHeight = DRAG_PANEL_EXPANDED_VISIBLE_PX + PANEL_OFFSCREEN_PX;
  const categoryZoneTranslateY = isExpanded ? -PANEL_EXPAND_DELTA_PX : 0;
  /**
   * 进场动画与展开态位移都落在同一条 transform 公式上，避免 CSS animation
   * 和内联 transform 争抢同一个属性，造成长按刚成立时的瞬时外弹。
   */
  const panelEnterOffsetY = panelEntered ? 0 : DRAG_PANEL_COLLAPSED_VISIBLE_PX + 32;
  const panelTranslateY = (isExpanded ? 0 : PANEL_EXPAND_DELTA_PX) + panelEnterOffsetY;
  const previewTranslateY = isExpanded ? "18%" : "-72%";

  useEffect(() => {
    if (!dragItem) {
      setPanelEntered(false);
      return undefined;
    }

    setPanelEntered(false);
    const rafId = window.requestAnimationFrame(() => {
      setPanelEntered(true);
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [dragItem]);

  // 使用当前账本可用分类；若未传入则回退到已生成的视觉注册表。
  const cats = availableCategories ?? Object.keys(categoryVisuals);
  if (!dragItem) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 400, touchAction: "none", fontFamily: "'Nunito',-apple-system,sans-serif" }}>
      <div
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          top: 0,
          bottom: CATEGORY_ZONE_BOTTOM_GAP_PX,
          paddingTop: CATEGORY_ZONE_TOP_MARGIN_PX,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          opacity: panelEntered ? 1 : 0,
          transform: `translate3d(0, ${categoryZoneTranslateY}px, 0)`,
          transition: "transform 240ms ease-out, opacity 180ms ease-out",
          willChange: "transform, opacity",
          contain: "layout paint style",
        }}
      >
        <div
          style={{
            height: CATEGORY_ZONE_TITLE_HEIGHT_PX,
            fontSize: 14,
            color: C.white,
            fontWeight: 700,
            textAlign: "center",
            marginBottom: 10,
            flexShrink: 0,
          }}
        >
          拖放到分类中
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gridAutoRows: "max-content",
            gap: 8,
            padding: "0 4px 12px",
            overflowY: "auto",
          }}
        >
          {cats.map((category) => {
            const visual = resolveCategoryVisual(category, categoryVisuals);
            if (!visual) return null;
            return (
              <div
                key={category}
                data-drop-category={category}
                onClick={(event) => { event.stopPropagation(); onDrop(category); }}
                style={{
                  background: C.white,
                  border: `2.5px solid ${hoverCategory === category ? visual.color : C.border}`,
                  borderRadius: 12,
                  padding: "10px 8px 12px",
                  textAlign: "center",
                  cursor: "pointer",
                  transform: hoverCategory === category ? "translateY(-2px)" : "translateY(0)",
                  transition: "transform .18s ease-out, border-color .18s ease-out, box-shadow .18s ease-out",
                  boxShadow: hoverCategory === category ? "0 8px 18px rgba(0,0,0,.14)" : "0 1px 0 rgba(0,0,0,.04)",
                }}
              >
                <div style={{ fontSize: 20, marginBottom: 2 }}>{pickCategoryIcon(visual, 0)}</div>
                <div style={{ fontSize: 12, lineHeight: 1.35, fontWeight: 700, color: visual.color, wordBreak: "break-word" }}>{category}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: DRAG_PANEL_COLLAPSED_VISIBLE_PX,
          height: DRAG_PANEL_SAFETY_ZONE_HEIGHT_PX,
          transform: `translate3d(0, ${categoryZoneTranslateY}px, 0)`,
          transition: "transform 240ms ease-out, opacity 180ms ease-out",
          opacity: panelEntered ? 1 : 0,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: -PANEL_OFFSCREEN_PX,
          height: panelHeight,
          transition: "transform 240ms ease-out, opacity 180ms ease-out",
          transform: `translate3d(0, ${panelTranslateY}px, 0)`,
          opacity: panelEntered ? 1 : 0.92,
          borderRadius: 24,
          border: `2px solid ${C.dark}`,
          background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFC 100%)",
          boxShadow: "0 10px 28px rgba(0,0,0,.18)",
          padding: isExpanded ? `16px 16px ${PANEL_OFFSCREEN_PX}px` : "10px 14px 12px",
          pointerEvents: "none",
          overflow: "hidden",
          willChange: "transform, opacity",
          contain: "layout paint style",
        }}
      >
        {!isExpanded ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              columnGap: 12,
              rowGap: 8,
              alignItems: "start",
            }}
          >
            <div style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...panelHeadlineTitleStyle }}>
              {displayTitle}
            </div>
            <div style={{ flexShrink: 0, textAlign: "right", ...panelHeadlineAmountStyle }}>
              {amountLabel}
            </div>
            <div style={{ minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 5, overflow: "hidden" }}>
              <div
                style={{
                  flexShrink: 0,
                  padding: "4px 8px",
                  borderRadius: 999,
                  background: displayCategory === "未分类" ? C.orangeBg : C.blueBg,
                  color: displayCategory === "未分类" ? C.coral : C.dark,
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {displayCategory}
              </div>
              {detailLine ? (
                <div style={{ minWidth: 0, maxWidth: "100%", fontSize: 11, lineHeight: 1.25, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {detailLine}
                </div>
              ) : null}
            </div>
            <div style={{ alignSelf: "stretch", display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
              <div style={{ maxWidth: 112, fontSize: 11, lineHeight: 1.25, color: C.sub, fontWeight: 700, textAlign: "right" }}>
                拖到此处查看交易细则
              </div>
            </div>
          </div>
        ) : (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={panelHeadlineTitleStyle}>{displayTitle}</div>
                  <div style={{ marginTop: 7, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span className={`inline-flex items-center rounded-pill px-[7px] py-[3px] text-[10px] font-extrabold ${sourceBadge.chipClassName}`}>{sourceLabelText || sourceBadge.label}</span>
                    <span style={{ fontSize: 10, color: C.muted }}>{fullTimeText}</span>
                    {shouldShowSourceTypeText ? (
                      <span style={{ fontSize: 10, color: C.muted }}>{sourceTypeText}</span>
                    ) : null}
                  </div>
                </div>
                <div style={{ flexShrink: 0, ...panelHeadlineAmountStyle }}>
                  {amountLabel}
                </div>
              </div>

              <div style={{ borderRadius: 16, border: `1.5px solid ${C.border}`, background: "linear-gradient(180deg, #FCFCFC 0%, #FAFAFA 100%)", padding: "12px 12px" }}>
                <div style={{ fontSize: 10, color: C.sub, fontWeight: 800, marginBottom: 8 }}>交易细则</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {detailSections.map((section) => (
                    <div
                      key={section.label}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "84px 1fr",
                        gap: 10,
                        alignItems: "start",
                        padding: "9px 2px",
                        borderTop: section.label === detailSections[0]?.label ? "none" : `1px dashed ${C.line}`,
                      }}
                    >
                      <div style={{ fontSize: 10, color: C.sub, fontWeight: 800, paddingTop: 2 }}>{section.label}</div>
                      <div style={{ fontSize: 12, lineHeight: 1.42, color: C.dark, fontWeight: 700, wordBreak: "break-word" }}>
                        {section.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                paddingTop: 12,
                background: transitionLaneBackground,
              }}
            >
              <div
                style={{
                  height: DRAG_PANEL_RESIDENT_ZONE_HEIGHT_PX,
                  width: "100%",
                  borderRadius: 18,
                  border: `2px dashed ${residentZoneBorderColor}`,
                  background: residentZoneBackground,
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "center",
                  padding: "12px 12px 8px",
                }}
              >
                <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ fontSize: 11, color: C.dark, fontWeight: 800, letterSpacing: ".04em" }}>停留看细则</div>
                  <div style={{ fontSize: 11, lineHeight: 1.35, color: C.sub, textAlign: "center" }}>上移去归类</div>
                  <div style={{ fontSize: 16, color: C.mint, transform: "translateY(-1px)" }}>⌄</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 拖拽中跟随手指的条目预览 */}
      <div
        style={{ position: "fixed", left: dragPoint?.x ?? 0, top: dragPoint?.y ?? 0, transform: `translate(-50%, ${previewTranslateY})`, background: C.white, borderRadius: 12, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 4px 20px rgba(0,0,0,.2)", pointerEvents: "none" }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: previewVisual?.tileBackground ?? C.orangeBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: previewVisual?.tileBorder ?? "1.5px dashed #D85A30",
          }}
        >
          <span style={{ fontSize: previewVisual?.isFallback ? 12 : 16, color: previewVisual?.accentColor ?? "#D85A30", fontWeight: 700 }}>
            {previewVisual?.icon ?? "?"}
          </span>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>{displayTitle}</div>
          <div style={{ fontSize: 11, color: C.muted }}>¥{dragItem.a}</div>
        </div>
      </div>
      <div onClick={onClose} style={{ position: "absolute", right: 14, top: 12, color: C.white, fontSize: 18, lineHeight: 1, cursor: "pointer" }}>×</div>
    </div>,
    document.body
  );
}

interface ReasonDialogItem {
  /** 商户名 */
  n: string;
  /** 选中的新分类 */
  nc: string;
}

interface ReasonDialogProps {
  item: ReasonDialogItem | null;
  onClose: () => void;
  /** 提交理由时的回调；reason 为空字符串表示用户跳过 */
  onSubmit?: (reason: string) => void;
}

/** ReasonDialog — 分类后可选理由输入弹窗 */
export function ReasonDialog({ item, onClose, onSubmit }: ReasonDialogProps) {
  const [reason, setReason] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (item) setReason("");
  }, [item]);

  useEffect(() => {
    if (!item) {
      return;
    }

    /**
     * 理由弹窗是由一次明确的拖拽分类操作直接触发的，
     * 这里在弹窗出现后的下一帧主动聚焦输入框，让 Android 真机同步唤起虚拟键盘，
     * 用户不需要再额外点一次输入框。
     */
    const timer = window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
    }, 40);

    return () => {
      window.clearTimeout(timer);
    };
  }, [item]);

  if (!item) return null;

  const handleDone = () => {
    onSubmit?.(reason);
    onClose();
  };

  const handleSkip = () => {
    onSubmit?.("");
    onClose();
  };

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Nunito',-apple-system,sans-serif" }}>
      <div className="fi" style={{ background: C.white, borderRadius: 16, padding: 20, width: "100%", maxWidth: 320, border: `2px solid ${C.dark}` }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 4 }}>已归为「{item.nc}」✓</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>想告诉 AI 为什么？（可选）</div>
        <input
          ref={inputRef}
          type="text"
          autoFocus
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="例：这是下午茶不是正餐"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            /**
             * 这里是用户即时输入给 AI 的理由说明，
             * 需要显式走系统字体，避免桌面端出现 serif 回退。
             */
            border: `1.5px solid ${C.border}`,
            fontSize: 13,
            outline: "none",
            fontFamily: "var(--app-font-editable)",
            background: "#FAFAFA",
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <div onClick={handleSkip} style={{ flex: 1, padding: 10, borderRadius: 10, border: `1.5px solid ${C.border}`, textAlign: "center", fontSize: 13, color: "#666", cursor: "pointer" }}>跳过</div>
          <div onClick={handleDone} style={{ flex: 1, padding: 10, borderRadius: 10, background: C.dark, textAlign: "center", fontSize: 13, color: C.bg, fontWeight: 700, cursor: "pointer" }}>完成</div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// DateRangeDialog 内部工具函数
// ──────────────────────────────────────────────

function toDateNumber(value: string): number {
  return new Date(`${value}T00:00:00`).getTime();
}

function formatBoundaryDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function diffDays(start: string, end: string): number {
  return Math.round((toDateNumber(end) - toDateNumber(start)) / 86_400_000);
}

interface DateRangeDialogProps {
  visible: boolean;
  rangeMode: string;
  customStart: string;
  customEnd: string;
  minDate: string;
  maxDate: string;
  onClose: () => void;
  onQuickSelect: (mode: string) => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  onConfirmCustom: () => void;
}

/**
 * DateRangeDialog — 时间范围选择器
 *
 * 入口：分类概览右上角"本月 >"。
 * 包含快捷项（今天/本周/本月/近三月/全部）和双滑块自定义范围。
 *
 * 重要口径：
 * - 该面板只维护“草稿态”，点击快捷项或拖动滑块时不立即提交首页过滤。
 * - 轨道 MIN / MAX 永远等于账本实际数据范围，不再被快捷项外扩。
 * - `customStart/customEnd` 代表当前草稿下应显示在滑块上的有效区间位置。
 */
export function DateRangeDialog({ visible, rangeMode, customStart, customEnd, minDate, maxDate, onClose, onQuickSelect, onCustomStartChange, onCustomEndChange, onConfirmCustom }: DateRangeDialogProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const [dragThumb, setDragThumb] = useState<"start" | "end" | null>(null);
  const railMinDate = minDate;
  const railMaxDate = maxDate;
  const totalDays = Math.max(diffDays(railMinDate, railMaxDate), 1);
  const [draftStartDay, setDraftStartDay] = useState(() => diffDays(railMinDate, customStart));
  const [draftEndDay, setDraftEndDay] = useState(() => diffDays(railMinDate, customEnd));

  // 用 ref 跟踪最新草稿值，避免拖拽闭包读到过时状态
  const draftRef = useRef({ start: draftStartDay, end: draftEndDay });
  draftRef.current = { start: draftStartDay, end: draftEndDay };

  const draftStartValue = addDays(railMinDate, draftStartDay);
  const draftEndValue = addDays(railMinDate, draftEndDay);
  const startPercent = (draftStartDay / totalDays) * 100;
  const endPercent = (draftEndDay / totalDays) * 100;

  /**
   * 面板打开或父层草稿变化时，同步当前应展示的起止日期到局部拖拽草稿。
   * 这里的 `customStart/customEnd` 已经是父层算好的“有效显示区间”，
   * 因此直接映射到滑块位置即可。
   */
  useEffect(() => {
    if (!visible || dragThumb) return;
    setDraftStartDay(Math.max(0, Math.min(totalDays, diffDays(railMinDate, customStart))));
    setDraftEndDay(Math.max(0, Math.min(totalDays, diffDays(railMinDate, customEnd))));
  }, [visible, customStart, customEnd, dragThumb, railMinDate, totalDays]);

  // 卸载时清理 rAF
  useEffect(() => () => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
  }, []);

  // 同步草稿值到父组件
  const syncToParent = (nextStart: number, nextEnd: number) => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      onCustomStartChange(addDays(railMinDate, nextStart));
      onCustomEndChange(addDays(railMinDate, nextEnd));
    });
  };

  const updateDraftRange = (nextStart: number, nextEnd: number) => {
    const clampedStart = Math.max(0, Math.min(nextStart, nextEnd));
    const clampedEnd = Math.min(totalDays, Math.max(nextEnd, clampedStart));
    setDraftStartDay(clampedStart);
    setDraftEndDay(clampedEnd);
    syncToParent(clampedStart, clampedEnd);
  };

  // 全局监听 pointermove/pointerup，支持跨元素拖拽
  // 通过 draftRef 读取最新草稿值，避免闭包捕获过时的 state
  useEffect(() => {
    if (!dragThumb) return undefined;
    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();
      const rect = railRef.current?.getBoundingClientRect();
      if (!rect) return;
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const nextDay = Math.round(ratio * totalDays);
      const { start: curStart, end: curEnd } = draftRef.current;
      if (dragThumb === "start") {
        updateDraftRange(nextDay, curEnd);
      } else {
        updateDraftRange(curStart, nextDay);
      }
    };
    const handlePointerUp = () => setDragThumb(null);
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [dragThumb, railMinDate, totalDays]);

  if (!visible) return null;

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div className="fi" onClick={(event) => event.stopPropagation()} style={{ background: C.white, borderRadius: 16, padding: 20, width: "100%", maxWidth: 332, border: `2px solid ${C.dark}` }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 12 }}>选择时间范围</div>
        {/* 快捷选项
            这里不用 flex-wrap，而改为固定 4 列网格。
            原因是激活态会改变字重与视觉样式；若按钮宽度继续由内容决定，
            同一视口下就会因为重排阈值轻微变化而发生“上一帧在第一行，下一帧掉到第二行”的抖动。
            固定网格后，每个按钮始终占自己的稳定槽位，切换选中态时只改颜色与字重，不再改布局。 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginBottom: 16 }}>
          {["今天", "本周", "本月", "近三月", "全部"].map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => onQuickSelect(label)}
              style={{
                width: "100%",
                minHeight: 40,
                padding: "8px 0",
                borderRadius: 20,
                fontSize: 13,
                cursor: "pointer",
                fontWeight: rangeMode === label ? 700 : 500,
                background: rangeMode === label ? C.dark : C.white,
                color: rangeMode === label ? C.bg : "#666",
                border: `1.5px solid ${rangeMode === label ? C.dark : C.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                /**
                 * 快捷范围按钮属于静态操作文案，不是可编辑内容；
                 * 这里显式保留品牌字体，避免后续再次被误归到输入字体规则里。
                 */
                fontFamily: "var(--app-font-brand)",
                lineHeight: 1,
                appearance: "none",
                WebkitAppearance: "none",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.sub, marginBottom: 10 }}>自定义范围</div>
        {/* 日期输入框 */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
          <input
            type="date"
            value={draftStartValue}
            min={railMinDate}
            max={draftEndValue}
            onChange={(event) => {
              const nextStart = Math.max(0, Math.min(diffDays(railMinDate, event.target.value), draftEndDay));
              updateDraftRange(nextStart, draftEndDay);
            }}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 8,
              /**
               * 日期输入框属于原生编辑控件，
               * 统一使用系统字体，保持浏览器与 Android 选择器显示一致。
               */
              border: `1.5px solid ${C.border}`,
              fontSize: 12,
              fontFamily: "var(--app-font-editable)",
            }}
          />
          <span style={{ color: C.muted }}>—</span>
          <input
            type="date"
            value={draftEndValue}
            min={draftStartValue}
            max={railMaxDate}
            onChange={(event) => {
              const nextEnd = Math.min(totalDays, Math.max(diffDays(railMinDate, event.target.value), draftStartDay));
              updateDraftRange(draftStartDay, nextEnd);
            }}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 8,
              /**
               * 结束日期输入与开始日期保持同一条规则：
               * 静态标签保留品牌字体，可编辑字段切换到系统字体。
               */
              border: `1.5px solid ${C.border}`,
              fontSize: 12,
              fontFamily: "var(--app-font-editable)",
            }}
          />
        </div>
        {/* 双滑块轨道 */}
        <div style={{ background: "#FAFAFA", border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "14px 12px", marginBottom: 16 }}>
          <div ref={railRef} style={{ position: "relative", height: 36, touchAction: "none" }}>
            {/* 底色轨道 */}
            <div style={{ position: "absolute", left: 0, right: 0, top: 15, height: 6, borderRadius: 999, background: "#ECE8E3" }} />
            {/* 选中区间高亮 */}
            <div style={{ position: "absolute", left: `${startPercent}%`, width: `${Math.max(endPercent - startPercent, 0)}%`, top: 15, height: 6, borderRadius: 999, background: C.dark, transition: dragThumb ? "none" : "left 0.2s ease, width 0.2s ease" }} />
            {/* 两个滑块 */}
            {(["start", "end"] as const).map((key) => {
              const left = key === "start" ? startPercent : endPercent;
              return (
                <button
                  key={key}
                  type="button"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setDragThumb(key);
                  }}
                  style={{ position: "absolute", left: `${left}%`, top: 6, width: 18, height: 24, borderRadius: 999, transform: "translateX(-50%)", border: `2px solid ${C.dark}`, background: C.white, boxShadow: "0 2px 10px rgba(0,0,0,.12)", cursor: "grab", transition: dragThumb ? "none" : "left 0.2s ease" }}
                />
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.sub, marginTop: 10 }}>
            <span>MIN: {formatBoundaryDate(railMinDate)}</span>
            <span>MAX: {formatBoundaryDate(railMaxDate)}</span>
          </div>
        </div>
        {/* 底部按钮 */}
        <div style={{ display: "flex", gap: 8 }}>
          <div onClick={onClose} style={{ flex: 1, padding: 10, borderRadius: 10, border: `1.5px solid ${C.border}`, textAlign: "center", fontSize: 13, color: "#666", cursor: "pointer" }}>取消</div>
          <div onClick={onConfirmCustom} style={{ flex: 1, padding: 10, borderRadius: 10, background: C.dark, textAlign: "center", fontSize: 13, color: C.bg, fontWeight: 700, cursor: "pointer" }}>确定</div>
        </div>
      </div>
    </div>
  );
}
