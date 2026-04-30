/**
 * Moni 首页 UI 组件集合
 *
 * 包含首页所有展示组件，全部使用内联 style（Memphis 风格，无 Tailwind），
 * 与 Moni-UI-Prototype 视觉完全一致。
 *
 * 迁移自 Moni-UI-Prototype/src/features/moni-home/components.jsx
 * 变更：JSX → TSX，加 Props 类型注解，导入路径改为本仓库，其余逻辑不变。
 */

import React, { useEffect, useRef, useState } from "react";
import { BOTTOM_NAV_PADDING_BOTTOM, C, CAT, LEDGER_HEADER_CONTROL_WIDTH, OVERVIEW_COLORS } from "./config";
import { getCategory, seededShapes, type OverviewItem } from "./helpers";

// ──────────────────────────────────────────────
// 内部常量
// ──────────────────────────────────────────────

/** 未分类斜线条纹背景（用于图标区和概览横条） */
const UNCLASSIFIED_STRIPE = `repeating-linear-gradient(45deg,${OVERVIEW_COLORS["未分类"]}22,${OVERVIEW_COLORS["未分类"]}22 3px,${OVERVIEW_COLORS["未分类"]}55 3px,${OVERVIEW_COLORS["未分类"]}55 6px)`;

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
  /** 图标变体索引（对应 CAT[category].icons[ih % 4]） */
  ih: number;
}

/** 日卡片数据（包含可见条目过滤后的列表） */
export interface HomeDayGroup {
  id: string;                   // "YYYY-MM-DD"
  label: string;                // "今天" / "昨天" / "4月5日"
  items: HomeTransaction[];     // 该天全部条目
  visibleItems: HomeTransaction[]; // 经过分类过滤后的可见条目
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

/** NavIcon — 底部导航中央品牌 M 图标 */
export function NavIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 52 52">
      <path d="M12 40C12 40 12 16 14.5 12C16 10 17 10.5 23 24C23 24 24 26.5 25 24C26 21.5 29 10.5 30.5 12C32 13.5 33 40 33 40" stroke="#F5F0EB" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="39" cy="13" r="4.4" fill={C.coral} opacity=".88" />
      <circle cx="31" cy="7.2" r="3" fill={C.blue} opacity=".76" />
      <rect x="34" y="5.1" width="4.6" height="4.6" rx="1" fill={C.yellow} opacity=".68" transform="rotate(18 36.4 7.5)" />
    </svg>
  );
}

/** GearIcon — 齿轮图标（设置按钮） */
export function GearIcon({ active }: { active?: boolean }) {
  const stroke = active ? C.dark : "#8E8E8E";
  const strokeWidth = active ? 1.9 : 1.6;
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3.2" stroke={stroke} strokeWidth={strokeWidth} />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.92 4.92l1.56 1.56M17.52 17.52l1.56 1.56M2.5 12h2.2M19.3 12h2.2M4.92 19.08l1.56-1.56M17.52 6.48l1.56-1.56" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

/** NoteIcon — 记账图标 */
export function NoteIcon({ active }: { active?: boolean }) {
  const strokeColor = active ? "#222" : "#8E8E8E";
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="3" width="16" height="18" rx="3" stroke={strokeColor} strokeWidth="1.6" />
      <path d="M8 8h8M8 12h8M12 16h4" stroke={strokeColor} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 9v6M9 12h6" stroke={strokeColor} strokeWidth="1.4" strokeLinecap="round" opacity=".55" />
    </svg>
  );
}

// ──────────────────────────────────────────────
// 业务展示组件
// ──────────────────────────────────────────────

interface TagChipProps {
  /** 分类名（中文），为 null 时不渲染 */
  category?: string | null;
  /** 显示未分类警示样式 */
  warning?: boolean;
}

/** TagChip — 分类标签徽章 */
export function TagChip({ category, warning }: TagChipProps) {
  if (warning) {
    return (
      <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 999, fontWeight: 700, background: C.pinkBg, color: "#D85A30", border: "1px dashed #D85A30", whiteSpace: "nowrap" }}>
        未分类
      </span>
    );
  }
  if (!category) return null;
  const meta = CAT[category];
  if (!meta) return null;
  return (
    <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 999, fontWeight: 700, background: meta.bg, color: meta.color, whiteSpace: "nowrap" }}>
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
  trendData: TrendPoint[];
  trendTrackMax: number;
  trendWindowLabel: string;
  hasEarlierTrendWindow: boolean;
  hasLaterTrendWindow: boolean;
  /**
   * 当前趋势图正在进行的拖拽预览位移。
   * 图表先跟手偏移，松手后由页面容器折算成最终的日期窗口偏移。
   */
  trendDragOffsetPx: number;
  onManualSwitch: (index: number) => void;
  onTrendForward: () => void;
  onTrendBackward: () => void;
  boardHandlers: React.HTMLAttributes<HTMLDivElement>;
  trendHandlers: React.HTMLAttributes<HTMLDivElement>;
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
  trendData,
  trendTrackMax,
  trendWindowLabel,
  hasEarlierTrendWindow,
  hasLaterTrendWindow,
  trendDragOffsetPx,
  onManualSwitch,
  onTrendForward,
  onTrendBackward,
  boardHandlers,
  trendHandlers,
}: DisplayBoardProps) {
  const chartViewportWidth = 260;
  const chartStep = chartViewportWidth / 6;
  const chartTrackWidth = chartViewportWidth;
  const safeTrendMax = Math.max(trendTrackMax, 1);

  return (
    <div
      {...boardHandlers}
      style={{ margin: "4px 16px", overflow: "hidden", borderRadius: 14, border: `2px solid ${C.dark}`, height: 132, position: "relative", background: C.white, touchAction: "pan-x" }}
    >
      <div style={{ transition: "transform .45s cubic-bezier(.4,0,.2,1)", transform: `translateY(-${currentIndex * 132}px)` }}>
        {/* 预算卡 */}
        <div style={{ height: 132, padding: "16px 16px 14px", position: "relative", overflow: "hidden" }}>
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
        </div>

        {/* 折线图卡 */}
        <div {...trendHandlers} style={{ height: 132, padding: "12px 14px", position: "relative", touchAction: "pan-y" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: C.sub }}>{trendWindowLabel}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* 左箭头：向历史方向（更早） */}
              <span onClick={onTrendForward} style={{ fontSize: 16, cursor: "pointer", opacity: hasEarlierTrendWindow ? 0.55 : 0.2, userSelect: "none" }}>‹</span>
              {/* 右箭头：向最新方向 */}
              <span onClick={onTrendBackward} style={{ fontSize: 16, cursor: "pointer", opacity: hasLaterTrendWindow ? 0.55 : 0.2, userSelect: "none" }}>›</span>
            </div>
          </div>
          <div style={{ width: "100%", overflow: "hidden", height: 58 }}>
            <svg
              width={chartTrackWidth}
              height="58"
              viewBox={`0 0 ${chartTrackWidth} 58`}
              preserveAspectRatio="none"
              style={{
                transform: `translateX(${trendDragOffsetPx}px)`,
                transition: trendDragOffsetPx === 0 ? "transform .18s ease-out" : "none",
              }}
            >
              <polyline
                points={trendData.map((item, index) => `${index * chartStep},${50 - (item.amount / safeTrendMax) * 42}`).join(" ")}
                fill="none"
                stroke={C.mint}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polygon
                points={`${trendData.map((item, index) => `${index * chartStep},${50 - (item.amount / safeTrendMax) * 42}`).join(" ")} ${chartTrackWidth},50 0,50`}
                fill={C.mint}
                opacity=".08"
              />
            </svg>
          </div>
          <div style={{ width: "100%", overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                fontSize: 8,
                color: "#BBB",
                width: chartTrackWidth,
                transform: `translateX(${trendDragOffsetPx}px)`,
                transition: trendDragOffsetPx === 0 ? "transform .18s ease-out" : "none",
              }}
            >
              {trendData.map((item) => (
                <span key={item.key} style={{ width: chartStep, flexShrink: 0, textAlign: "center" }}>{item.label}</span>
              ))}
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
  onOpen: () => void;
}

/** OverviewCard — 分类概览横条图 */
export function OverviewCard({ rangeLabel, overview, onOpen }: OverviewCardProps) {
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
                ? `repeating-linear-gradient(45deg,${OVERVIEW_COLORS["未分类"]}33,${OVERVIEW_COLORS["未分类"]}33 2px,${OVERVIEW_COLORS["未分类"]}55 2px,${OVERVIEW_COLORS["未分类"]}55 4px)`
                : OVERVIEW_COLORS[item.category] ?? C.gray,
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
                background: item.category === "未分类" ? UNCLASSIFIED_STRIPE : OVERVIEW_COLORS[item.category] ?? C.gray,
                border: item.category === "未分类" ? `1px solid ${OVERVIEW_COLORS["未分类"]}` : "none",
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
  /** 该天是否正处于 AI 处理状态（显示流光边框和骨架屏） */
  isAi: boolean;
  /** AI 是否处于软停止过渡状态（显示琥珀色"正在完成…"） */
  aiStop: boolean;
  onToggle: () => void;
  onItemPointerDown: (item: HomeTransaction, event: React.PointerEvent) => void;
  onItemPointerMove: (event: React.PointerEvent) => void;
  onItemPointerUp: (event: React.PointerEvent) => void;
  dayRef: (node: HTMLDivElement | null) => void;
}

/** DayCard — 按天分组流水卡片（三阶段展开：收起/展开/AI工作态） */
export function DayCard({ day, isExpanded, hideCategoryTag = false, isAi, aiStop, onToggle, onItemPointerDown, onItemPointerMove, onItemPointerUp, dayRef }: DayCardProps) {
  const total = day.visibleItems.reduce((sum, item) => sum + item.a, 0);
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
      {/* 卡片头部：日期标签 + AI 处理指示 + 当天支出合计 */}
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
        <span style={{ fontSize: 12, color: C.coral, fontFamily: "'Space Mono',monospace", fontWeight: 500 }}>−¥{formatCurrencyAmount(total)}</span>
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
            // AI 处理中：第一条正常渲染，其余显示骨架屏
            if (isAi && index >= 1) {
              return (
                <div key={item.id} style={{ display: "flex", alignItems: "center", padding: "7px 0", borderBottom: index < day.visibleItems.length - 1 ? `0.5px solid ${C.line}` : "none" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "#F5F5F5", marginRight: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div className="sk" style={{ width: 14, height: 3 }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="sk" style={{ width: 90, height: 10, marginBottom: 4 }} />
                    <div className="sk" style={{ width: 54, height: 8 }} />
                  </div>
                  <div className="sk" style={{ width: 32, height: 10 }} />
                </div>
              );
            }

            const category = getCategory(item);
            const meta = category ? CAT[category] : null;
            // aiOnly：只有 AI 分类，没有用户确认分类
            const aiOnly = !item.userCat;

            return (
              <div
                key={item.id}
                onPointerDown={(event) => onItemPointerDown(item, event)}
                onPointerMove={onItemPointerMove}
                onPointerUp={onItemPointerUp}
                onPointerCancel={onItemPointerUp}
                style={{ display: "flex", alignItems: "center", padding: "7px 0", borderBottom: index < day.visibleItems.length - 1 ? `0.5px solid ${C.line}` : "none", cursor: "pointer", userSelect: "none", touchAction: "none" }}
              >
                {/* 左侧图标区：有分类用 emoji，无分类用斜杠纹 + 问号 */}
                <div style={{ width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, marginRight: 10, flexShrink: 0, background: category && meta ? meta.bg : UNCLASSIFIED_STRIPE, border: category ? "none" : `1.5px dashed ${OVERVIEW_COLORS["未分类"]}` }}>
                  {category && meta ? meta.icons[item.ih % meta.icons.length] : <span style={{ fontSize: 13, color: "#D85A30", fontWeight: 700 }}>?</span>}
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
                    <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 999, background: C.blueBg, color: "#3A6EA5" }}>
                      {item.sourceLabel ?? "来源未知"}
                    </span>
                    {!hideCategoryTag && (category ? <TagChip category={category} /> : <TagChip warning />)}
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
                <div style={{ fontSize: 14, fontWeight: 600, color: category ? C.dark : "#D85A30", flexShrink: 0, marginLeft: 8, fontFamily: "'Space Mono',monospace" }}>¥{formatCurrencyAmount(item.a)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface BottomNavProps {
  aiOn: boolean;
  aiStop: boolean;
  controlOpen: boolean;
  controlHit: string | null;
  onStartControl: (clientY: number, pointerId: number) => void;
  onEndControl: () => void;
  onCancelControl: () => void;
  onUpdateControlHit: ControlUpdateRef;
  /** 点击设置按钮的回调 */
  onSettings?: () => void;
  /** 点击记账按钮的回调 */
  onBookkeeping?: () => void;
  /** 当前激活页面 */
  activePage?: 'home' | 'entry' | 'settings';
}

/**
 * BottomNav — 底部三栏导航
 *
 * 中央按钮：
 * - 短按：回到首页主舞台
 * - 长按 420ms：弹出 AI 控制条，手指不离屏滑选开启/关闭
 *
 * 手势修复规范（来自 Moni CLAUDE.md）：
 * - onPointerMove 绑在父容器上（指针已被父容器隐式捕获）
 * - 控制条子元素不绑 onPointerMove（避免隐式捕获失效）
 * - 移除 onPointerLeave（防止误取消）
 */
export function BottomNav({ aiOn, aiStop, controlOpen, controlHit, onStartControl, onEndControl, onCancelControl, onUpdateControlHit, onSettings, onBookkeeping, activePage = 'home' }: BottomNavProps) {
  const isEntryActive = activePage === 'entry';
  const isSettingsActive = activePage === 'settings';
  return (
    <div style={{ background: C.white, borderTop: `1.5px solid ${C.border}`, paddingTop: 3, paddingBottom: BOTTOM_NAV_PADDING_BOTTOM, display: "flex", justifyContent: "space-around", alignItems: "flex-end", flexShrink: 0, zIndex: 20 }}>
      {/* 左：设置 */}
      <div style={{ textAlign: "center", padding: "4px 16px", cursor: "pointer" }} onClick={onSettings}>
        <GearIcon active={isSettingsActive} />
        <div style={{ fontSize: 10, color: isSettingsActive ? C.dark : C.muted, fontWeight: isSettingsActive ? 700 : 400, marginTop: 2 }}>设置</div>
      </div>

      {/* 中：品牌按钮 + AI 控制条 */}
      <div
        style={{ position: "relative", textAlign: "center", cursor: "pointer", touchAction: "none" }}
        onPointerDown={(event) => onStartControl(event.clientY, event.pointerId)}
        onPointerMove={(event) => {
          if (controlOpen) {
            onUpdateControlHit.move(event.clientY);
          }
        }}
        onPointerUp={onEndControl}
        onPointerCancel={onCancelControl}
      >
        {controlOpen && (
          <div
            ref={onUpdateControlHit.ref}
            style={{ position: "absolute", bottom: 62, left: "50%", transform: "translateX(-50%)", width: 56, height: 108, borderRadius: 28, overflow: "hidden", border: `2px solid ${C.dark}`, display: "flex", flexDirection: "column", boxShadow: "0 6px 20px rgba(0,0,0,.15)", zIndex: 30, background: C.white }}
          >
            <div style={{ flex: 1, background: controlHit === "开启" ? C.mint : C.white, color: controlHit === "开启" ? C.white : C.mint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, borderBottom: `1px solid ${C.border}` }}>
              开启
            </div>
            <div style={{ flex: 1, background: controlHit === "关闭" ? C.coral : C.white, color: controlHit === "关闭" ? C.white : C.coral, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
              关闭
            </div>
          </div>
        )}

        <div style={{ marginTop: -12 }}>
          <div
            className={aiOn || aiStop ? "ag" : ""}
            style={{ width: 52, height: 52, background: C.dark, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(2deg)", transition: "box-shadow .6s", boxShadow: aiStop ? `0 0 0 2.5px ${C.amber},0 0 10px ${C.amber}44` : undefined }}
          >
            <NavIcon />
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, marginTop: 3, color: aiOn ? (aiStop ? C.amber : C.mint) : C.dark }}>
            {aiOn ? (aiStop ? "停止中…" : "运行中") : "首页"}
          </div>
        </div>
      </div>

      {/* 右：记账 */}
      <div style={{ textAlign: "center", padding: "4px 16px", cursor: "pointer" }} onClick={onBookkeeping}>
        <NoteIcon active={isEntryActive} />
        <div style={{ fontSize: 10, color: isEntryActive ? C.dark : C.muted, fontWeight: isEntryActive ? 700 : 400, marginTop: 2 }}>记账</div>
      </div>
    </div>
  );
}

interface DragOverlayProps {
  dragItem: HomeTransaction | null;
  dragPoint: { x: number; y: number } | null;
  hoverCategory: string | null;
  panelState?: "collapsed" | "expanded";
  onHover: (category: string) => void;
  onLeave: () => void;
  onDrop: (category: string) => void;
  onClose: () => void;
  /** 当前账本可用分类列表（来自 LedgerService，替代全局 CAT） */
  availableCategories?: string[];
}

function normalizeDetailText(value?: string | null): string {
  if (!value || value === "/") return "";
  return value.trim();
}

/**
 * 支付平台原始文案里常带“商品:”“备注:”这类前缀。
 * 这些前缀会干扰用户在拖拽时快速识别交易，因此面板内展示前先做一层轻量清洗。
 */
function stripRedundantPrefix(value: string): string {
  return value.replace(/^(收款方备注:|商品:|备注:|付款方备注:)\s*/u, "").trim();
}

/**
 * 拖拽细则面板需要独立计算“交易身份标题”。
 * 这里遵循规格：优先交易对方，其次清洗后的商品名称，再其次原始分类，最后才退回首页卡片标题。
 */
function resolveDragDisplayTitle(item: HomeTransaction): string {
  const counterpartyText = normalizeDetailText(item.counterparty);
  if (counterpartyText) return counterpartyText;

  const productText = stripRedundantPrefix(normalizeDetailText(item.product));
  if (productText) return productText;

  const rawClassText = normalizeDetailText(item.rawClass);
  if (rawClassText) return rawClassText;

  return normalizeDetailText(item.n) || "未知交易";
}

/**
 * 拖拽预览卡片需要继承首页原条目的图标语义。
 * 若条目已有分类，则继续使用该分类当前在首页列表中的图标与色彩；仅未分类时回退到问号占位。
 */
function resolveDragPreviewVisual(item: HomeTransaction) {
  const category = getCategory(item);
  const meta = category ? CAT[category] : null;
  if (!meta) {
    return {
      icon: "?",
      accentColor: "#D85A30",
      tileBackground: C.orangeBg,
      tileBorder: "1.5px dashed #D85A30",
      isFallback: true,
    };
  }

  return {
    icon: meta.icons[item.ih % meta.icons.length],
    accentColor: meta.color,
    tileBackground: meta.bg,
    tileBorder: `1.5px solid ${meta.color}33`,
    isFallback: false,
  };
}

/** DragOverlay — 拖拽分类蒙版（长按条目触发） */
export function DragOverlay({
  dragItem,
  dragPoint,
  hoverCategory,
  panelState = "collapsed",
  onHover,
  onLeave,
  onDrop,
  onClose,
  availableCategories,
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
  const displayTitle = dragItem ? resolveDragDisplayTitle(dragItem) : "未知交易";
  const previewVisual = dragItem ? resolveDragPreviewVisual(dragItem) : null;
  const displayCategory = dragItem?.userCat?.trim() || dragItem?.aiCat?.trim() || "未分类";
  const detailLine = dragItem?.userCat?.trim()
    ? (dragItem.userNote?.trim() || "")
    : dragItem?.aiCat?.trim()
      ? (dragItem.reason?.trim() || "")
      : "";
  const directionLabel = dragItem?.direction === "in" ? "收入" : "支出";
  const amountLabel = `${directionLabel} ¥${formatCurrencyAmount(dragItem?.a ?? 0)}`;
  const remarkText = normalizeDetailText(dragItem?.remark);
  const paymentText = dragItem?.pay?.trim() || "未提供";
  const sourceTypeText = dragItem?.sourceType === "wechat"
    ? "微信"
    : dragItem?.sourceType === "alipay"
      ? "支付宝"
      : "手动";
  const sourceLabelText = dragItem?.sourceLabel?.trim() || "来源未知";
  const productText = stripRedundantPrefix(normalizeDetailText(dragItem?.product)) || normalizeDetailText(dragItem?.n) || "未知交易";
  const counterpartyText = normalizeDetailText(dragItem?.counterparty);
  const rawClassText = normalizeDetailText(dragItem?.rawClass);
  const fullTimeText = normalizeDetailText(dragItem?.fullTimeLabel) || normalizeDetailText(dragItem?.t) || "时间未知";
  const transactionStatusText = normalizeDetailText(dragItem?.transactionStatus) || "SUCCESS";
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

  // 使用当前账本可用分类；若未传入则回退到全局 CAT 键
  const cats = availableCategories ?? Object.keys(CAT);
  if (!dragItem) return null;
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 50, touchAction: "none" }}>
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
            const meta = CAT[category];
            if (!meta) return null;
            return (
              <div
                key={category}
                data-drop-category={category}
                onPointerEnter={() => onHover(category)}
                onPointerLeave={onLeave}
                onClick={(event) => { event.stopPropagation(); onDrop(category); }}
                style={{
                  background: C.white,
                  border: `2.5px solid ${hoverCategory === category ? meta.color : C.border}`,
                  borderRadius: 12,
                  padding: "10px 8px 12px",
                  textAlign: "center",
                  cursor: "pointer",
                  transform: hoverCategory === category ? "translateY(-2px)" : "translateY(0)",
                  transition: "transform .18s ease-out, border-color .18s ease-out, box-shadow .18s ease-out",
                  boxShadow: hoverCategory === category ? "0 8px 18px rgba(0,0,0,.14)" : "0 1px 0 rgba(0,0,0,.04)",
                }}
              >
                <div style={{ fontSize: 20, marginBottom: 2 }}>{meta.icons[0]}</div>
                <div style={{ fontSize: 12, lineHeight: 1.35, fontWeight: 700, color: meta.color, wordBreak: "break-word" }}>{category}</div>
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
                    <span style={{ fontSize: 10, padding: "3px 7px", borderRadius: 999, background: C.orangeBg, color: C.dark, fontWeight: 800 }}>{sourceLabelText}</span>
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
    </div>
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

  useEffect(() => {
    if (item) setReason("");
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
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div className="fi" style={{ background: C.white, borderRadius: 16, padding: 20, width: "100%", maxWidth: 320, border: `2px solid ${C.dark}` }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 4 }}>已归为「{item.nc}」✓</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>想告诉 AI 为什么？（可选）</div>
        <input
          type="text"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="例：这是下午茶不是正餐"
          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 13, outline: "none", fontFamily: "inherit", background: "#FAFAFA" }}
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
 */
export function DateRangeDialog({ visible, rangeMode, customStart, customEnd, minDate, maxDate, onClose, onQuickSelect, onCustomStartChange, onCustomEndChange, onConfirmCustom }: DateRangeDialogProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const [dragThumb, setDragThumb] = useState<"start" | "end" | null>(null);
  const totalDays = Math.max(diffDays(minDate, maxDate), 1);
  const [draftStartDay, setDraftStartDay] = useState(() => diffDays(minDate, customStart));
  const [draftEndDay, setDraftEndDay] = useState(() => diffDays(minDate, customEnd));

  // 用 ref 跟踪最新草稿值，避免拖拽闭包读到过时状态
  const draftRef = useRef({ start: draftStartDay, end: draftEndDay });
  draftRef.current = { start: draftStartDay, end: draftEndDay };

  const draftStartValue = addDays(minDate, draftStartDay);
  const draftEndValue = addDays(minDate, draftEndDay);
  const startPercent = (draftStartDay / totalDays) * 100;
  const endPercent = (draftEndDay / totalDays) * 100;

  // 面板打开时同步外部传入的起止日期到草稿值（拖拽中跳过，避免回写冲突）
  useEffect(() => {
    if (!visible || dragThumb) return;
    setDraftStartDay(Math.max(0, Math.min(totalDays, diffDays(minDate, customStart))));
    setDraftEndDay(Math.max(0, Math.min(totalDays, diffDays(minDate, customEnd))));
  }, [visible, customStart, customEnd, minDate, totalDays]);

  // 卸载时清理 rAF
  useEffect(() => () => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
  }, []);

  // 同步草稿值到父组件
  const syncToParent = (nextStart: number, nextEnd: number) => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      onCustomStartChange(addDays(minDate, nextStart));
      onCustomEndChange(addDays(minDate, nextEnd));
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
  }, [dragThumb, totalDays, minDate]);

  if (!visible) return null;

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div className="fi" onClick={(event) => event.stopPropagation()} style={{ background: C.white, borderRadius: 16, padding: 20, width: "100%", maxWidth: 332, border: `2px solid ${C.dark}` }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 12 }}>选择时间范围</div>
        {/* 快捷选项 */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {["今天", "本周", "本月", "近三月", "全部"].map((label) => (
            <div key={label} onClick={() => onQuickSelect(label)} style={{ padding: "8px 16px", borderRadius: 20, fontSize: 13, cursor: "pointer", fontWeight: rangeMode === label ? 700 : 500, background: rangeMode === label ? C.dark : C.white, color: rangeMode === label ? C.bg : "#666", border: rangeMode === label ? "none" : `1.5px solid ${C.border}` }}>
              {label}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.sub, marginBottom: 10 }}>自定义范围</div>
        {/* 日期输入框 */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
          <input
            type="date"
            value={draftStartValue}
            min={minDate}
            max={draftEndValue}
            onChange={(event) => {
              const nextStart = Math.max(0, Math.min(diffDays(minDate, event.target.value), draftEndDay));
              updateDraftRange(nextStart, draftEndDay);
            }}
            style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 12, fontFamily: "inherit" }}
          />
          <span style={{ color: C.muted }}>—</span>
          <input
            type="date"
            value={draftEndValue}
            min={draftStartValue}
            max={maxDate}
            onChange={(event) => {
              const nextEnd = Math.min(totalDays, Math.max(diffDays(minDate, event.target.value), draftStartDay));
              updateDraftRange(draftStartDay, nextEnd);
            }}
            style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 12, fontFamily: "inherit" }}
          />
        </div>
        {/* 双滑块轨道 */}
        <div style={{ background: "#FAFAFA", border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "14px 12px", marginBottom: 16 }}>
          <div ref={railRef} style={{ position: "relative", height: 36, touchAction: "none" }}>
            {/* 底色轨道 */}
            <div style={{ position: "absolute", left: 0, right: 0, top: 15, height: 6, borderRadius: 999, background: "#ECE8E3" }} />
            {/* 选中区间高亮 */}
            <div style={{ position: "absolute", left: `${startPercent}%`, width: `${Math.max(endPercent - startPercent, 0)}%`, top: 15, height: 6, borderRadius: 999, background: C.dark }} />
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
                  style={{ position: "absolute", left: `${left}%`, top: 6, width: 18, height: 24, borderRadius: 999, transform: "translateX(-50%)", border: `2px solid ${C.dark}`, background: C.white, boxShadow: "0 2px 10px rgba(0,0,0,.12)", cursor: "grab" }}
                />
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.sub, marginTop: 10 }}>
            <span>MIN: {formatBoundaryDate(minDate)}</span>
            <span>MAX: {formatBoundaryDate(maxDate)}</span>
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
