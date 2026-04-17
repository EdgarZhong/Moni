/**
 * MoniHome — Moni 首页主容器
 *
 * 首页只消费 useMoniHomeData 提供的 facade wrapper，不直接下潜到底层 service。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AUTO_CAROUSEL_MS,
  APP_HEADER_MIN_HEIGHT,
  APP_HEADER_PADDING_TOP,
  C,
  LEDGER_HEADER_CONTROL_WIDTH,
  MANUAL_IDLE_LOCK_MS,
  MANUAL_RESUME_MS,
  PHONE_FRAME_HEIGHT_CSS,
  PHONE_FRAME_WIDTH_CSS,
} from "@ui/features/moni-home/config";
import { buildOverview, getCategory, getRange, isInRange } from "@ui/features/moni-home/helpers";
import {
  BottomNav,
  DateRangeDialog,
  DayCard,
  Decor,
  DisplayBoard,
  DragOverlay,
  HintCard,
  LedgerHeaderControl,
  Logo,
  OverviewCard,
  ReasonDialog,
  StatsBar,
  TagRail,
  type HomeDayGroup,
  type HomeTransaction,
} from "@ui/features/moni-home/components";
import { triggerImpact } from "@system/device/impact";
import { useMoniHomeData } from "@ui/hooks/useMoniHomeData";
import { useKeyboard } from "@ui/hooks/useKeyboard";

interface DragLock {
  bodyOverflow: string;
  containerOverflowY: string | undefined;
  containerTouchAction: string | undefined;
}

interface SwipeState {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  axis: "vertical" | "horizontal" | null;
}

interface TrendDragState extends SwipeState {
  /**
   * 趋势图当前跟手预览位移。
   * 我们先在 UI 层做有限位移预览，松手后再折算成真实日期偏移，
   * 让用户感知到“自由滑动”，而不是每次只触发一个固定步长。
   */
  offsetPx: number;
}

interface PressState {
  item: HomeTransaction;
  pointerId: number;
  startX: number;
  startY: number;
  startScrollTop: number;
  startedAt: number;
  mode: "pending" | "scroll";
}

interface ReasonItem {
  n: string;
  nc: string;
}

interface MoniHomeProps {
  onNavigate?: (page: "home" | "entry" | "settings") => void;
}

interface DetailContext {
  item: HomeTransaction;
  dayId: string;
  dayLabel: string;
}

interface TransactionDetailPanelProps {
  detail: DetailContext;
  availableCategories: string[];
  onClose: () => void;
  onUpdateCategory: (transactionId: string, category: string, reasoning?: string) => void;
  onUpdateUserReasoning: (transactionId: string, note: string) => void;
  onUpdateRemark: (transactionId: string, note: string) => void;
  onSetTransactionVerification: (transactionId: string, isVerified: boolean) => void;
}

function TransactionDetailPanel({
  detail,
  availableCategories,
  onClose,
  onUpdateCategory,
  onUpdateUserReasoning,
  onUpdateRemark,
  onSetTransactionVerification,
}: TransactionDetailPanelProps) {
  const EXIT_ANIMATION_MS = 220;
  const OPEN_GUARD_MS = 260;
  const [reasoningInput, setReasoningInput] = useState("");
  const [noteInput, setNoteInput] = useState(detail.item.remark ?? "");
  const [selectedCategory, setSelectedCategory] = useState(getCategory(detail.item));
  const [isVerified, setIsVerified] = useState(Boolean(detail.item.isVerified));
  const [isClosing, setIsClosing] = useState(false);
  const initialCategoryRef = useRef(getCategory(detail.item));
  const touchStartRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const openedAtRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setReasoningInput("");
    setNoteInput(detail.item.remark ?? "");
    const initialCategory = getCategory(detail.item);
    initialCategoryRef.current = initialCategory;
    setSelectedCategory(initialCategory);
    setIsVerified(Boolean(detail.item.isVerified));
    setIsClosing(false);
    openedAtRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.item.id]);

  const requestClose = useCallback((source: "backdrop" | "gesture" | "button" = "backdrop") => {
    if (isClosing) return;
    if (source === "backdrop" && Date.now() - openedAtRef.current < OPEN_GUARD_MS) {
      return;
    }
    if (selectedCategory && selectedCategory !== initialCategoryRef.current) {
      onUpdateCategory(String(detail.item.id), selectedCategory);
      initialCategoryRef.current = selectedCategory;
    }
    setIsClosing(true);
    window.setTimeout(() => {
      onClose();
    }, EXIT_ANIMATION_MS);
  }, [detail.item.id, isClosing, onClose, onUpdateCategory, selectedCategory]);

  const handleUpdateCategory = useCallback((category: string) => {
    setSelectedCategory(category);
  }, []);

  const handleSaveReasoning = useCallback(() => {
    onUpdateUserReasoning(String(detail.item.id), reasoningInput.trim());
  }, [detail.item.id, onUpdateUserReasoning, reasoningInput]);

  const handleSaveNote = useCallback(() => {
    onUpdateRemark(String(detail.item.id), noteInput.trim());
  }, [detail.item.id, noteInput, onUpdateRemark]);

  const handleToggleVerified = useCallback(() => {
    const next = !isVerified;
    setIsVerified(next);
    onSetTransactionVerification(String(detail.item.id), next);
  }, [detail.item.id, isVerified, onSetTransactionVerification]);

  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, at: Date.now() };
  }, []);

  const handleTouchEnd = useCallback((event: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const endTouch = event.changedTouches[0];
    const deltaX = endTouch.clientX - touchStartRef.current.x;
    const deltaY = Math.abs(endTouch.clientY - touchStartRef.current.y);
    const elapsed = Date.now() - touchStartRef.current.at;

    // 用面板自身坐标判断边缘，而非视口坐标
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) {
      const startRelX = touchStartRef.current.x - rect.left;
      const fromLeftEdge = startRelX < 50 && deltaX > 50;
      const fromRightEdge = startRelX > rect.width - 50 && deltaX < -50;
      if ((fromLeftEdge || fromRightEdge) && deltaY < 50 && elapsed < 350) {
        requestClose("gesture");
      }
    }

    touchStartRef.current = null;
  }, [requestClose]);

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 70, background: "rgba(0,0,0,.35)" }} onClick={() => requestClose("backdrop")}>
      <div
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={isClosing ? "frx" : "fr"}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "100%",
          height: "100%",
          background: C.bg,
          borderLeft: `2px solid ${C.dark}`,
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}`, background: C.white }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.dark }}>交易详情</div>
            <div style={{ fontSize: 11, color: C.sub }}>{detail.dayLabel} · {detail.item.t}</div>
          </div>
          <div onClick={() => requestClose("button")} style={{ fontSize: 20, color: C.muted, lineHeight: 1, cursor: "pointer" }}>×</div>
        </div>

        <div style={{ padding: "14px 16px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>商户 / 主题</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.dark }}>{detail.item.n}</div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800, color: detail.item.direction === "in" ? C.mint : C.coral, fontFamily: "'Space Mono',monospace" }}>
              {detail.item.direction === "in" ? "+" : "-"}¥{detail.item.a}
            </div>
          </div>

          <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 8, fontWeight: 700 }}>分类</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {availableCategories.map((category) => {
                const active = selectedCategory === category;
                return (
                  <div
                    key={category}
                    onClick={() => handleUpdateCategory(category)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: `1.5px solid ${active ? C.dark : C.border}`,
                      background: active ? C.dark : C.white,
                      color: active ? C.bg : C.dark,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {category}
                  </div>
                );
              })}
            </div>
          </div>

          {detail.item.reason && (
            <div style={{ background: C.greenBg, border: `1.5px solid ${C.mint}33`, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: C.greenText, fontWeight: 700, marginBottom: 4 }}>AI 判断理由</div>
              <div style={{ fontSize: 12, color: C.greenText }}>{detail.item.reason}</div>
            </div>
          )}

          <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700 }}>修正理由（可选）</div>
            <input
              type="text"
              value={reasoningInput}
              onChange={(event) => setReasoningInput(event.target.value)}
              placeholder="例如：这是下午茶不是正餐"
              style={{ width: "100%", borderRadius: 10, border: `1.5px solid ${C.border}`, padding: "10px 12px", fontSize: 12, color: C.dark, outline: "none", fontFamily: "inherit" }}
            />
            <div
              onClick={handleSaveReasoning}
              style={{ marginTop: 8, display: "inline-block", padding: "7px 12px", borderRadius: 8, background: C.dark, color: C.bg, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              确定修正理由
            </div>
          </div>

          <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 12, color: C.dark, fontWeight: 700 }}>锁定该分类</div>
              <div
                onClick={handleToggleVerified}
                style={{
                  width: 42,
                  height: 24,
                  borderRadius: 999,
                  border: `1.5px solid ${isVerified ? C.mint : C.border}`,
                  background: isVerified ? C.mint : "#F4F4F4",
                  position: "relative",
                  cursor: "pointer",
                }}
              >
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: C.white, position: "absolute", top: 1, left: isVerified ? 21 : 2, transition: "left .18s ease" }} />
              </div>
            </div>
          </div>

          <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 6, fontWeight: 700 }}>备注</div>
            <textarea
              value={noteInput}
              onChange={(event) => setNoteInput(event.target.value)}
              rows={3}
              placeholder="给这笔交易补充说明"
              style={{ width: "100%", borderRadius: 10, border: `1.5px solid ${C.border}`, padding: "10px 12px", fontSize: 12, color: C.dark, outline: "none", resize: "vertical", fontFamily: "inherit" }}
            />
            <div
              onClick={handleSaveNote}
              style={{ marginTop: 8, display: "inline-block", padding: "7px 12px", borderRadius: 8, background: C.dark, color: C.bg, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              保存备注
            </div>
          </div>

          <div style={{ fontSize: 11, color: C.muted, textAlign: "right" }}>{detail.dayId} · {detail.item.sourceLabel ?? "未知来源"}</div>
        </div>
      </div>
    </div>
  );
}

export default function MoniHome({ onNavigate }: MoniHomeProps) {
  const {
    days: realDays,
    income: realIncome,
    trendCard,
    currentLedger,
    availableLedgers,
    hintCards,
    hasBudget,
    budgetCard,
    availableCategories,
    isLoading,
    unclassifiedCount,
    aiEngineUiState,
    dataRange,
    homeDateRange,
    actions,
  } = useMoniHomeData();

  const [carouselIndex, setCarouselIndex] = useState(0);

  const [selectedFilter, setSelectedFilter] = useState("全部");
  const [rangeMode, setRangeMode] = useState("本月");
  const [customStart, setCustomStart] = useState(dataRange.min ?? new Date().toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(dataRange.max ?? new Date().toISOString().slice(0, 10));
  const [rangeDialogOpen, setRangeDialogOpen] = useState(false);

  const [hintVisible, setHintVisible] = useState(true);
  const [dragItem, setDragItem] = useState<HomeTransaction | null>(null);
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [hoverCategory, setHoverCategory] = useState<string | null>(null);
  const [reasonItem, setReasonItem] = useState<ReasonItem | null>(null);
  const [detailTxId, setDetailTxId] = useState<string | null>(null);
  const [ledgerDropdownOpen, setLedgerDropdownOpen] = useState(false);
  const [trendDragOffsetPx, setTrendDragOffsetPx] = useState(0);

  const [controlOpen, setControlOpen] = useState(false);
  const [controlHit, setControlHit] = useState<string | null>(null);
  const [optimisticStopping, setOptimisticStopping] = useState(false);

  const [stickyRail, setStickyRail] = useState(false);
  const [scrollStage, setScrollStage] = useState<"初始" | "过渡" | "完全">("初始");
  const [expandedDays, setExpandedDays] = useState<string[]>([]);

  const [manualTouchedAt, setManualTouchedAt] = useState<number | null>(null);
  const [resumeClock, setResumeClock] = useState(Date.now());

  const scrollRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlRef = useRef<HTMLDivElement>(null);
  const boardSwipeRef = useRef<SwipeState | null>(null);
  const trendSwipeRef = useRef<TrendDragState | null>(null);
  const pressRef = useRef<PressState | null>(null);
  const hoverCategoryRef = useRef<string | null>(null);
  const dragLockRef = useRef<DragLock | null>(null);
  const pendingDropRef = useRef<{ txId: string; category: string } | null>(null);
  const ledgerDropdownWrapRef = useRef<HTMLDivElement>(null);

  const primaryHint = hintCards[0] ?? null;
  const aiStop = aiEngineUiState.status === "draining" || optimisticStopping;
  const aiOn = aiEngineUiState.status === "running" || aiEngineUiState.status === "draining" || optimisticStopping;
  const aiCurrentDates = aiEngineUiState.activeDates;
  const currentLedgerName = currentLedger.name || availableLedgers.find((ledger) => ledger.id === currentLedger.id)?.name || "未设置账本";
  /**
   * 趋势图每跨一格对应一天。
   * 这里复用 DisplayBoard 当前 260 宽度 / 6 间隔的视觉节奏，保证拖拽位移和日期位移直觉一致。
   */
  const TREND_DAY_STEP_PX = 260 / 6;
  const MAX_TREND_DRAG_PREVIEW_PX = TREND_DAY_STEP_PX * 3;
  const clampDateString = useCallback((value: string, min: string, max: string) => {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }, []);

  const railFilters = useMemo(() => {
    const categories = availableCategories.filter((category) => category && category !== "uncategorized");
    return ["全部", "未分类", ...categories];
  }, [availableCategories]);

  useEffect(() => {
    if (!railFilters.includes(selectedFilter)) {
      setSelectedFilter("全部");
    }
  }, [railFilters, selectedFilter]);

  const rangeBounds = useMemo(() => {
    const fallback = new Date().toISOString().slice(0, 10);
    return {
      min: dataRange.min ?? fallback,
      max: dataRange.max ?? fallback,
    };
  }, [dataRange.max, dataRange.min]);

  const range = useMemo(
    () => getRange(rangeMode, customStart, customEnd, rangeBounds.min, rangeBounds.max),
    [customEnd, customStart, rangeBounds.max, rangeBounds.min, rangeMode],
  );

  useEffect(() => {
    actions.setHomeDateRange({ start: range.start, end: range.end });
  }, [actions.setHomeDateRange, range.end, range.start]);

  useEffect(() => {
    if (!rangeBounds.min || !rangeBounds.max) {
      return;
    }

    const nextStart = clampDateString(customStart, rangeBounds.min, rangeBounds.max);
    const nextEnd = clampDateString(customEnd, rangeBounds.min, rangeBounds.max);

    if (nextStart !== customStart) {
      setCustomStart(nextStart);
    }
    if (nextEnd !== customEnd) {
      setCustomEnd(nextEnd < nextStart ? nextStart : nextEnd);
    }
  }, [clampDateString, customEnd, customStart, rangeBounds.max, rangeBounds.min]);

  useEffect(() => {
    if (aiEngineUiState.status !== "running") {
      setOptimisticStopping(false);
    }
  }, [aiEngineUiState.status]);

  useEffect(() => {
    if (!rangeBounds.min || !rangeBounds.max) {
      return;
    }
    setCustomStart(rangeBounds.min);
    setCustomEnd(rangeBounds.max);
    if (homeDateRange.start && homeDateRange.end) {
      setCustomStart(homeDateRange.start);
      setCustomEnd(homeDateRange.end);
    }
    setRangeMode("本月");
    actions.setTrendWindowOffset(0);
  }, [currentLedger.id, rangeBounds.max, rangeBounds.min]);

  const trendTrackMax = Math.max(...trendCard.points.map((item) => item.amount), 1);

  const rangeDays = useMemo(() => realDays.filter((day) => isInRange(day.id, range)), [realDays, range]);

  const filterItems = useCallback(
    (items: HomeTransaction[]) => {
      if (selectedFilter === "全部") return items;
      if (selectedFilter === "未分类") return items.filter((item) => !getCategory(item));
      return items.filter((item) => getCategory(item) === selectedFilter);
    },
    [selectedFilter],
  );

  const renderDays = useMemo<HomeDayGroup[]>(
    () => rangeDays.map((day) => ({ ...day, visibleItems: filterItems(day.items) })).filter((day) => day.visibleItems.length > 0),
    [rangeDays, filterItems],
  );
  const detailContext = useMemo<DetailContext | null>(() => {
    if (!detailTxId) return null;
    for (const day of realDays) {
      const matched = day.items.find((item) => String(item.id) === detailTxId);
      if (matched) {
        return {
          item: matched,
          dayId: day.id,
          dayLabel: day.label,
        };
      }
    }
    return null;
  }, [detailTxId, realDays]);

  const latestId = renderDays[0]?.id;
  const expenseItems = useMemo(() => rangeDays.flatMap((day) => day.items), [rangeDays]);
  const expenseTotal = expenseItems.reduce((sum, item) => sum + item.a, 0);
  const incomeTotal = realIncome.filter((item) => isInRange(item.date, range)).reduce((sum, item) => sum + item.amount, 0);
  const txCount = expenseItems.length;
  const overview = useMemo(() => buildOverview(expenseItems), [expenseItems]);

  const budgetPct = budgetCard ? Math.round(budgetCard.usageRatio * 100) : 0;
  const budgetColor = budgetCard
    ? budgetCard.status === "exceeded" ? C.coral : budgetCard.status === "warning" ? C.amber : C.mint
    : C.mint;
  const budgetStatusLabel = budgetCard
    ? budgetCard.status === "exceeded"
      ? "预算已超支"
      : budgetCard.status === "warning"
        ? "预算接近上限"
        : "预算状态良好"
    : "预算未设置";

  const syncExpandedDays = useCallback(
    (nextStage: "初始" | "过渡" | "完全") => {
      if (nextStage === "初始") {
        setExpandedDays(latestId ? [latestId] : []);
      } else if (nextStage === "完全") {
        setExpandedDays(renderDays.map((day) => day.id));
      }
    },
    [latestId, renderDays],
  );

  const expandVisibleCollapsedDays = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const visibleIds = renderDays
      .filter((day) => {
        const rect = dayRefs.current[day.id]?.getBoundingClientRect();
        return rect && rect.top >= containerRect.top + 24 && rect.top < containerRect.bottom - 72;
      })
      .map((day) => day.id);
    if (visibleIds.length > 0) {
      setExpandedDays((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  }, [renderDays]);

  const resetInitialExpanded = useCallback(() => {
    setExpandedDays(latestId ? [latestId] : []);
  }, [latestId]);

  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const stickyAt = railRef.current ? Math.max(railRef.current.offsetTop - 8, 120) : 240;
    const sticky = container.scrollTop >= stickyAt;
    const nextStage = container.scrollTop < 18 ? "初始" : container.scrollTop < stickyAt ? "过渡" : "完全";
    setStickyRail(sticky);
    setScrollStage((prev) => {
      if (prev !== nextStage) syncExpandedDays(nextStage);
      return nextStage;
    });
    if (nextStage === "过渡") expandVisibleCollapsedDays();
    if (nextStage === "初始") resetInitialExpanded();
  }, [expandVisibleCollapsedDays, resetInitialExpanded, syncExpandedDays]);

  useEffect(() => {
    if (scrollStage === "初始") resetInitialExpanded();
    if (scrollStage === "完全") setExpandedDays(renderDays.map((day) => day.id));
  }, [scrollStage, renderDays, resetInitialExpanded]);

  useEffect(() => {
    if (!hasBudget) return undefined;
    const now = Date.now();
    if (manualTouchedAt) {
      const idleLockUntil = manualTouchedAt + MANUAL_IDLE_LOCK_MS;
      const resumeAt = manualTouchedAt + MANUAL_RESUME_MS;
      if (now < idleLockUntil) {
        const timer = setTimeout(() => setResumeClock(Date.now()), idleLockUntil - now);
        return () => clearTimeout(timer);
      }
      if (now < resumeAt) {
        const timer = setTimeout(() => setResumeClock(Date.now()), resumeAt - now);
        return () => clearTimeout(timer);
      }
    }
    const timer = setTimeout(() => {
      setCarouselIndex((prev) => (prev + 1) % 2);
      setResumeClock(Date.now());
    }, AUTO_CAROUSEL_MS);
    return () => clearTimeout(timer);
  }, [carouselIndex, hasBudget, manualTouchedAt, resumeClock]);

  const manualSwitch = useCallback((nextIndex: number) => {
    if (!hasBudget) return;
    setCarouselIndex(nextIndex);
    setManualTouchedAt(Date.now());
    setResumeClock(Date.now());
  }, [hasBudget]);

  const handleBoardSwipeEnd = useCallback(() => {
    if (!boardSwipeRef.current) return;
    const { sx, sy, ex, ey } = boardSwipeRef.current;
    const deltaX = ex - sx;
    const deltaY = ey - sy;
    if (Math.abs(deltaY) > 28 && Math.abs(deltaY) > Math.abs(deltaX)) {
      if (deltaY < 0) manualSwitch(Math.min(1, carouselIndex + 1));
      else manualSwitch(Math.max(0, carouselIndex - 1));
    }
    boardSwipeRef.current = null;
  }, [carouselIndex, manualSwitch]);

  const handleBoardPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    boardSwipeRef.current = { sx: event.clientX, sy: event.clientY, ex: event.clientX, ey: event.clientY, axis: null };
  }, []);

  const handleBoardPointerMove = useCallback((event: React.PointerEvent) => {
    if (!boardSwipeRef.current) return;
    const next = { ...boardSwipeRef.current, ex: event.clientX, ey: event.clientY };
    if (!next.axis) {
      const dX = Math.abs(next.ex - next.sx);
      const dY = Math.abs(next.ey - next.sy);
      if (dX > 8 || dY > 8) next.axis = dY >= dX ? "vertical" : "horizontal";
    }
    if (next.axis === "vertical") event.preventDefault();
    boardSwipeRef.current = next;
  }, []);

  const handleTrendSwipeEnd = useCallback(() => {
    if (!trendSwipeRef.current) return;
    const { sx, ex, sy, ey, axis, offsetPx } = trendSwipeRef.current;
    const deltaX = ex - sx;
    const deltaY = ey - sy;
    if (axis === "horizontal") {
      /**
       * 过去是“只要横向划一下，就固定跳 1 天”。
       * 现在改成按真实拖拽距离折算天数，这样一次拖动可以连续跨过多天。
       */
      const offsetDays = Math.round(-offsetPx / TREND_DAY_STEP_PX);
      if (offsetDays !== 0) {
        actions.setTrendWindowOffset(Math.max(0, trendCard.windowOffset + offsetDays));
      }
    } else if (Math.abs(deltaY) > 28 && Math.abs(deltaY) > Math.abs(deltaX)) {
      if (deltaY > 0) manualSwitch(Math.max(0, carouselIndex - 1));
      else manualSwitch(Math.min(1, carouselIndex + 1));
    }
    setTrendDragOffsetPx(0);
    trendSwipeRef.current = null;
  }, [TREND_DAY_STEP_PX, actions, carouselIndex, manualSwitch, trendCard.windowOffset]);

  const handleTrendPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.stopPropagation();
    trendSwipeRef.current = {
      sx: event.clientX,
      ex: event.clientX,
      sy: event.clientY,
      ey: event.clientY,
      axis: null,
      offsetPx: 0,
    };
  }, []);

  const handleTrendPointerMove = useCallback((event: React.PointerEvent) => {
    if (!trendSwipeRef.current) return;
    event.stopPropagation();
    const next = { ...trendSwipeRef.current, ex: event.clientX, ey: event.clientY };
    if (!next.axis) {
      const dX = Math.abs(next.ex - next.sx);
      const dY = Math.abs(next.ey - next.sy);
      if (dX > 8 || dY > 8) next.axis = dX >= dY ? "horizontal" : "vertical";
    }
    if (next.axis === "horizontal") {
      event.preventDefault();
      next.offsetPx = Math.max(-MAX_TREND_DRAG_PREVIEW_PX, Math.min(MAX_TREND_DRAG_PREVIEW_PX, next.ex - next.sx));
      setTrendDragOffsetPx(next.offsetPx);
    }
    trendSwipeRef.current = next;
  }, [MAX_TREND_DRAG_PREVIEW_PX]);

  const startHold = useCallback((callback: () => void) => {
    if (holdRef.current != null) clearTimeout(holdRef.current);
    holdRef.current = setTimeout(callback, 420);
  }, []);

  const stopHold = useCallback(() => {
    if (holdRef.current != null) clearTimeout(holdRef.current);
  }, []);

  const cancelPendingPress = useCallback(() => {
    pressRef.current = null;
    stopHold();
  }, [stopHold]);

  const lockDragScroll = useCallback(() => {
    if (dragLockRef.current) return;
    dragLockRef.current = {
      bodyOverflow: document.body.style.overflow,
      containerOverflowY: scrollRef.current?.style.overflowY,
      containerTouchAction: scrollRef.current?.style.touchAction,
    };
    document.body.style.overflow = "hidden";
    if (scrollRef.current) {
      scrollRef.current.style.overflowY = "hidden";
      scrollRef.current.style.touchAction = "none";
    }
  }, []);

  const unlockDragScroll = useCallback(() => {
    if (!dragLockRef.current) return;
    document.body.style.overflow = dragLockRef.current.bodyOverflow;
    if (scrollRef.current) {
      scrollRef.current.style.overflowY = dragLockRef.current.containerOverflowY ?? "auto";
      scrollRef.current.style.touchAction = dragLockRef.current.containerTouchAction ?? "auto";
    }
    dragLockRef.current = null;
  }, []);

  const resolveHoverCategory = useCallback((clientX: number, clientY: number) => {
    const target = document.elementFromPoint(clientX, clientY)?.closest("[data-drop-category]");
    const category = target?.getAttribute("data-drop-category") ?? null;
    hoverCategoryRef.current = category;
    setHoverCategory(category);
  }, []);

  const handleItemPointerDown = useCallback(
    (item: HomeTransaction, event: React.PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pressRef.current = {
        item,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startScrollTop: scrollRef.current?.scrollTop ?? 0,
        startedAt: Date.now(),
        mode: "pending",
      };
      startHold(() => {
        const point = { x: pressRef.current?.startX ?? event.clientX, y: pressRef.current?.startY ?? event.clientY };
        lockDragScroll();
        setDragItem(item);
        setDragPoint(point);
        hoverCategoryRef.current = null;
        setHoverCategory(null);
        void triggerImpact("light");
      });
    },
    [lockDragScroll, startHold],
  );

  const handleItemPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!pressRef.current || pressRef.current.pointerId !== event.pointerId || dragItem) return;
      const pressState = pressRef.current;
      const deltaX = event.clientX - pressState.startX;
      const deltaY = event.clientY - pressState.startY;
      if (pressState.mode === "scroll") {
        if (scrollRef.current) scrollRef.current.scrollTop = pressState.startScrollTop - deltaY;
        return;
      }
      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        if (Math.abs(deltaY) > Math.abs(deltaX)) {
          stopHold();
          pressRef.current = { ...pressState, mode: "scroll" };
          if (scrollRef.current) scrollRef.current.scrollTop = pressState.startScrollTop - deltaY;
          return;
        }
        cancelPendingPress();
      }
    },
    [cancelPendingPress, dragItem, stopHold],
  );

  const handleItemPointerUp = useCallback((event: React.PointerEvent) => {
    const pressState = pressRef.current;
    if (pressRef.current) pressRef.current = null;
    if (dragItem) return;

    stopHold();
    if (!pressState || pressState.pointerId !== event.pointerId || pressState.mode !== "pending") return;

    const deltaX = Math.abs(event.clientX - pressState.startX);
    const deltaY = Math.abs(event.clientY - pressState.startY);
    const duration = Date.now() - pressState.startedAt;
    const isTap = deltaX <= 8 && deltaY <= 8 && duration < 420;
    if (isTap) {
      setDetailTxId(String(pressState.item.id));
    }
  }, [dragItem, stopHold]);

  const handleDropCategory = useCallback(
    (category: string) => {
      if (!dragItem) return;
      setReasonItem({ n: dragItem.n, nc: category });
      pendingDropRef.current = { txId: String(dragItem.id), category };
      unlockDragScroll();
      setDragItem(null);
      setDragPoint(null);
      setHoverCategory(null);
      hoverCategoryRef.current = null;
      void triggerImpact("medium");
    },
    [dragItem, unlockDragScroll],
  );

  useEffect(() => {
    if (!dragItem) return undefined;
    const handlePointerMove = (event: PointerEvent) => {
      setDragPoint({ x: event.clientX, y: event.clientY });
      resolveHoverCategory(event.clientX, event.clientY);
    };
    /**
     * 只有用户真实抬手（pointerup）时才允许提交分类。
     *
     * 真机触摸流里，系统可能因为手势仲裁、滚动接管、来电/通知、WebView 自身策略等原因
     * 触发 pointercancel。此前这里把 pointercancel 与 pointerup 共用同一套逻辑，
     * 导致“手指尚未松开，只是移动到分类框上方”时，一旦收到 cancel，
     * 就会错误地把当前 hover 分类当成最终 drop 结果提交。
     *
     * 桌面浏览器用鼠标时通常只会在真实松手后触发 pointerup，
     * 因此 DevTools 移动端模拟很难稳定复现这个问题。
     */
    const handlePointerUp = (event: PointerEvent) => {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-drop-category]");
      const category = target?.getAttribute("data-drop-category") ?? hoverCategoryRef.current;
      if (category) {
        handleDropCategory(category);
        return;
      }
      unlockDragScroll();
      setDragItem(null);
      setDragPoint(null);
      setHoverCategory(null);
      hoverCategoryRef.current = null;
    };
    /**
     * pointercancel 只表示当前触摸流被中断，不代表用户完成了放手。
     * 因此这里必须无条件取消拖拽，不能提交任何分类结果。
     */
    const handlePointerCancel = () => {
      unlockDragScroll();
      setDragItem(null);
      setDragPoint(null);
      setHoverCategory(null);
      hoverCategoryRef.current = null;
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [dragItem, handleDropCategory, resolveHoverCategory, unlockDragScroll]);

  useEffect(() => () => {
    stopHold();
    unlockDragScroll();
  }, [stopHold, unlockDragScroll]);

  const handleStartControl = useCallback(() => {
    startHold(() => {
      setControlOpen(true);
      setControlHit(null);
      void triggerImpact("light");
    });
  }, [startHold]);

  const handleEndControl = useCallback(() => {
    stopHold();
    if (!controlOpen) return;
    if (controlHit === "开启") {
      setOptimisticStopping(false);
      void actions.startAiProcessing().catch((error) => {
        console.error("[MoniHome] Failed to start AI processing:", error);
      });
      void triggerImpact("medium");
    }
    if (controlHit === "关闭" && aiOn) {
      setOptimisticStopping(true);
      actions.stopAiProcessing();
      void triggerImpact("medium");
    }
    setControlOpen(false);
    setControlHit(null);
  }, [actions, aiOn, controlHit, controlOpen, stopHold]);

  const handleCancelControl = useCallback(() => {
    stopHold();
    if (controlOpen) {
      setControlOpen(false);
      setControlHit(null);
    }
  }, [controlOpen, stopHold]);

  const updateControlHit = useCallback((clientY: number) => {
    const rect = controlRef.current?.getBoundingClientRect();
    if (!rect) return;
    setControlHit(clientY - rect.top < rect.height / 2 ? "开启" : "关闭");
  }, []);

  const toggleDay = useCallback((dayId: string) => {
    if (scrollStage === "完全") return;
    setExpandedDays((prev) => (prev.includes(dayId) ? prev.filter((item) => item !== dayId) : [...prev, dayId]));
  }, [scrollStage]);

  useEffect(() => {
    hoverCategoryRef.current = hoverCategory;
  }, [hoverCategory]);

  useEffect(() => {
    if (!ledgerDropdownOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const root = ledgerDropdownWrapRef.current;
      if (!root) {
        return;
      }
      if (!root.contains(event.target as Node)) {
        setLedgerDropdownOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [ledgerDropdownOpen]);

  useEffect(() => {
    setHintVisible(Boolean(primaryHint));
  }, [primaryHint]);

  useEffect(() => {
    if (detailTxId && !detailContext) {
      setDetailTxId(null);
    }
  }, [detailContext, detailTxId]);

  const boardHandlers = {
    onPointerDown: handleBoardPointerDown,
    onPointerMove: handleBoardPointerMove,
    onPointerUp: handleBoardSwipeEnd,
    onPointerCancel: () => { boardSwipeRef.current = null; },
  };

  const trendHandlers = {
    onPointerDown: handleTrendPointerDown,
    onPointerMove: handleTrendPointerMove,
    onPointerUp: handleTrendSwipeEnd,
    onPointerCancel: () => {
      trendSwipeRef.current = null;
      setTrendDragOffsetPx(0);
    },
  };

  const { isKeyboardVisible } = useKeyboard();

  return (
    <div
      style={{
        width: PHONE_FRAME_WIDTH_CSS,
        maxWidth: "100vw",
        margin: 0,
        background: C.bg,
        overflow: "hidden",
        position: "relative",
        fontFamily: "'Nunito',-apple-system,sans-serif",
        height: PHONE_FRAME_HEIGHT_CSS,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes rb {
          0%   { border-color: ${C.coral} }
          25%  { border-color: ${C.yellow} }
          50%  { border-color: ${C.blue} }
          75%  { border-color: ${C.mint} }
          100% { border-color: ${C.coral} }
        }
        @keyframes rbs {
          0%   { box-shadow: 0 0 0 2.5px ${C.coral},0 0 12px ${C.coral}44 }
          25%  { box-shadow: 0 0 0 2.5px ${C.yellow},0 0 12px ${C.yellow}44 }
          50%  { box-shadow: 0 0 0 2.5px ${C.blue},0 0 12px ${C.blue}44 }
          75%  { box-shadow: 0 0 0 2.5px ${C.mint},0 0 12px ${C.mint}44 }
          100% { box-shadow: 0 0 0 2.5px ${C.coral},0 0 12px ${C.coral}44 }
        }
        @keyframes p  { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
        @keyframes sk { 0%,100% { opacity: .42 } 50% { opacity: .16 } }
        @keyframes fu { from { transform: translateY(10px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes fr { from { transform: translateX(100%); opacity: .9 } to { transform: translateX(0); opacity: 1 } }
        @keyframes frx { from { transform: translateX(0); opacity: 1 } to { transform: translateX(100%); opacity: .92 } }
        .ab { animation: rb 3s linear infinite; border-width: 2.5px; border-style: solid }
        .ag { animation: rbs 3s linear infinite }
        .sk { animation: sk 1.7s ease-in-out infinite; background: #ddd; border-radius: 4px }
        .fi { animation: fu .28s ease-out }
        .fr { animation: fr .24s ease-out }
        .frx { animation: frx .22s ease-out forwards }
        * { box-sizing: border-box }
        html, body { touch-action: manipulation; -webkit-touch-callout: none; overscroll-behavior: none }
        input, textarea, button { touch-action: manipulation }
        ::-webkit-scrollbar { display: none }
      `}</style>

      <Decor />

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
          ref={ledgerDropdownWrapRef}
          style={{
            width: LEDGER_HEADER_CONTROL_WIDTH,
            display: "flex",
            justifyContent: "flex-end",
            position: "relative",
          }}
        >
          <LedgerHeaderControl ledgerName={currentLedgerName} onClick={() => setLedgerDropdownOpen((open) => !open)} ariaLabel="切换账本" />
          {ledgerDropdownOpen && (
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
                      void actions.switchLedger(ledger.id).catch((error) => {
                        console.error("[MoniHome] Failed to switch ledger:", error);
                      });
                      setLedgerDropdownOpen(false);
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
                    <div style={{ fontSize: 13, fontWeight: selected ? 700 : 600, color: C.dark, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {ledger.name}
                    </div>
                    <div style={{ fontSize: 12, color: selected ? C.dark : "transparent", fontWeight: 700 }}>✓</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        data-scroll-container
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: "auto", overflowX: "hidden", position: "relative", zIndex: 1 }}
      >
        <DisplayBoard
          currentIndex={carouselIndex}
          budgetPeriodLabel={budgetCard?.periodLabel ?? "本月预算"}
          budgetAmount={budgetCard?.budgetAmount ?? 0}
          spentAmount={budgetCard?.spentAmount ?? 0}
          remainingAmount={budgetCard?.remainingAmount ?? 0}
          remainingDays={budgetCard?.remainingDays ?? 0}
          dailyAvailableAmount={budgetCard?.dailyAvailableAmount ?? 0}
          budgetStatusLabel={budgetStatusLabel}
          budgetPct={budgetPct}
          budgetColor={budgetColor}
          hasBudget={hasBudget}
          trendData={trendCard.points}
          trendTrackMax={trendTrackMax}
          trendWindowLabel={trendCard.windowStart && trendCard.windowEnd
            ? `${trendCard.windowStart.slice(5)} ~ ${trendCard.windowEnd.slice(5)}`
            : "近 7 天支出"}
          hasEarlierTrendWindow={trendCard.hasEarlierWindow}
          hasLaterTrendWindow={trendCard.hasLaterWindow}
          trendDragOffsetPx={trendDragOffsetPx}
          onManualSwitch={manualSwitch}
          onTrendForward={() => {
            if (trendCard.hasEarlierWindow) {
              actions.setTrendWindowOffset(trendCard.windowOffset + 1);
            }
          }}
          onTrendBackward={() => {
            if (trendCard.hasLaterWindow) {
              actions.setTrendWindowOffset(Math.max(0, trendCard.windowOffset - 1));
            }
          }}
          boardHandlers={boardHandlers}
          trendHandlers={trendHandlers}
        />

        <HintCard
          visible={hintVisible}
          icon={primaryHint?.type === "budget_alert" ? "⚠️" : "💡"}
          title={primaryHint?.title}
          description={primaryHint?.description}
          onClose={() => setHintVisible(false)}
        />

        <StatsBar
          rangeLabel={range.label}
          expenseTotal={expenseTotal}
          incomeTotal={incomeTotal}
          count={txCount}
          isCustom={rangeMode === "自定义"}
        />

        <OverviewCard rangeLabel={range.label} overview={overview} onOpen={() => setRangeDialogOpen(true)} />

        <div
          ref={railRef}
          style={{ position: "sticky", top: 0, zIndex: 15, background: C.bg, paddingTop: 8, borderBottom: `1px solid ${stickyRail ? C.border : "transparent"}` }}
        >
          <TagRail filters={railFilters} selectedFilter={selectedFilter} unclassifiedCount={unclassifiedCount} onSelect={setSelectedFilter} />
        </div>

        <div style={{ padding: "6px 16px 96px" }}>
          {renderDays.map((day) => (
            <DayCard
              key={day.id}
              day={day}
              isExpanded={expandedDays.includes(day.id)}
              hideCategoryTag={selectedFilter !== "全部"}
              isAi={aiOn && aiCurrentDates.includes(day.id)}
              aiStop={aiStop}
              onToggle={() => toggleDay(day.id)}
              onItemPointerDown={handleItemPointerDown}
              onItemPointerMove={handleItemPointerMove}
              onItemPointerUp={handleItemPointerUp}
              dayRef={(node) => { dayRefs.current[day.id] = node; }}
            />
          ))}

          {!isLoading && renderDays.length === 0 && (
            <div style={{ padding: "24px 8px", textAlign: "center", fontSize: 12, color: C.muted }}>
              当前范围内暂无流水。
            </div>
          )}
        </div>
      </div>

      {!isKeyboardVisible && (
        <BottomNav
          aiOn={aiOn}
          aiStop={aiStop}
          controlOpen={controlOpen}
          controlHit={controlHit}
          onStartControl={handleStartControl}
          onEndControl={handleEndControl}
          onCancelControl={handleCancelControl}
          onUpdateControlHit={{ ref: controlRef, move: updateControlHit }}
          onBookkeeping={onNavigate ? () => onNavigate("entry") : undefined}
          onSettings={onNavigate ? () => onNavigate("settings") : undefined}
        />
      )}

      {controlOpen && (
        <div
          onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); setControlOpen(false); setControlHit(null); }}
          style={{ position: "absolute", inset: 0, zIndex: 25, background: "transparent" }}
        />
      )}

      <DragOverlay
        dragItem={dragItem}
        dragPoint={dragPoint}
        hoverCategory={hoverCategory}
        onHover={setHoverCategory}
        onLeave={() => { setHoverCategory(null); hoverCategoryRef.current = null; }}
        onDrop={handleDropCategory}
        onClose={() => { unlockDragScroll(); setDragItem(null); setDragPoint(null); setHoverCategory(null); hoverCategoryRef.current = null; }}
        availableCategories={availableCategories}
      />

      <ReasonDialog
        item={reasonItem}
        onClose={() => { setReasonItem(null); pendingDropRef.current = null; }}
        onSubmit={(reason) => {
          const pending = pendingDropRef.current;
          if (pending) {
            actions.updateCategory(pending.txId, pending.category, reason);
            pendingDropRef.current = null;
          }
          setReasonItem(null);
        }}
      />

      {detailContext && (
        <TransactionDetailPanel
          detail={detailContext}
          availableCategories={availableCategories}
          onClose={() => setDetailTxId(null)}
          onUpdateCategory={actions.updateCategory}
          onUpdateUserReasoning={actions.updateUserReasoning}
          onUpdateRemark={actions.updateRemark}
          onSetTransactionVerification={actions.setTransactionVerification}
        />
      )}

      <DateRangeDialog
        visible={rangeDialogOpen}
        rangeMode={rangeMode}
        customStart={customStart}
        customEnd={customEnd}
        minDate={rangeBounds.min}
        maxDate={rangeBounds.max}
        onClose={() => setRangeDialogOpen(false)}
        onQuickSelect={(mode) => { setRangeMode(mode); setRangeDialogOpen(false); }}
        onCustomStartChange={setCustomStart}
        onCustomEndChange={setCustomEnd}
        onConfirmCustom={() => { setRangeMode("自定义"); setRangeDialogOpen(false); }}
      />
    </div>
  );
}
