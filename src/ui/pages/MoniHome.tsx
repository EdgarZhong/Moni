/**
 * MoniHome — Moni 首页主容器
 *
 * 首页只消费 useMoniHomeData 提供的 facade wrapper，不直接下潜到底层 service。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AUTO_CAROUSEL_MS,
  C,
  MANUAL_IDLE_LOCK_MS,
  MANUAL_RESUME_MS,
  PHONE_FRAME_HEIGHT,
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

interface PressState {
  item: HomeTransaction;
  pointerId: number;
  startX: number;
  startY: number;
  startScrollTop: number;
  mode: "pending" | "scroll";
}

interface ReasonItem {
  n: string;
  nc: string;
}

interface MoniHomeProps {
  onNavigate?: (page: "home" | "entry") => void;
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

  const [controlOpen, setControlOpen] = useState(false);
  const [controlHit, setControlHit] = useState<string | null>(null);

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
  const trendSwipeRef = useRef<SwipeState | null>(null);
  const pressRef = useRef<PressState | null>(null);
  const hoverCategoryRef = useRef<string | null>(null);
  const dragLockRef = useRef<DragLock | null>(null);
  const pendingDropRef = useRef<{ txId: string; category: string } | null>(null);

  const primaryHint = hintCards[0] ?? null;
  const aiOn = aiEngineUiState.status === "running" || aiEngineUiState.status === "draining";
  const aiStop = aiEngineUiState.status === "draining";
  const aiCurrentDate = aiEngineUiState.activeDate;
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
    const { sx, ex, sy, ey, axis } = trendSwipeRef.current;
    const deltaX = ex - sx;
    const deltaY = ey - sy;
    if (axis === "horizontal") {
      if (deltaX < -28 && trendCard.hasEarlierWindow) {
        actions.setTrendWindowOffset(trendCard.windowOffset + 1);
      } else if (deltaX > 28 && trendCard.hasLaterWindow) {
        actions.setTrendWindowOffset(Math.max(0, trendCard.windowOffset - 1));
      }
    } else if (Math.abs(deltaY) > 28 && Math.abs(deltaY) > Math.abs(deltaX)) {
      if (deltaY > 0) manualSwitch(Math.max(0, carouselIndex - 1));
      else manualSwitch(Math.min(1, carouselIndex + 1));
    }
    trendSwipeRef.current = null;
  }, [actions, carouselIndex, manualSwitch, trendCard.hasEarlierWindow, trendCard.hasLaterWindow, trendCard.windowOffset]);

  const handleTrendPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.stopPropagation();
    trendSwipeRef.current = { sx: event.clientX, ex: event.clientX, sy: event.clientY, ey: event.clientY, axis: null };
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
    }
    trendSwipeRef.current = next;
  }, []);

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

  const handleItemPointerUp = useCallback(() => {
    if (pressRef.current) pressRef.current = null;
    if (!dragItem) stopHold();
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
    const handlePointerEnd = (event: PointerEvent) => {
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
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
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
      void actions.startAiProcessing().catch((error) => {
        console.error("[MoniHome] Failed to start AI processing:", error);
      });
      void triggerImpact("medium");
    }
    if (controlHit === "关闭" && aiOn) {
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
    setHintVisible(Boolean(primaryHint));
  }, [primaryHint]);

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
    onPointerCancel: () => { trendSwipeRef.current = null; },
  };

  return (
    <div style={{ width: "100%", maxWidth: 390, margin: "0 auto", background: C.bg, borderRadius: 24, border: `2.5px solid ${C.dark}`, overflow: "hidden", position: "relative", fontFamily: "'Nunito',-apple-system,sans-serif", height: PHONE_FRAME_HEIGHT, display: "flex", flexDirection: "column", paddingTop: "env(safe-area-inset-top)" }}>
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
        .ab { animation: rb 3s linear infinite; border-width: 2.5px; border-style: solid }
        .ag { animation: rbs 3s linear infinite }
        .sk { animation: sk 1.7s ease-in-out infinite; background: #ddd; border-radius: 4px }
        .fi { animation: fu .28s ease-out }
        * { box-sizing: border-box }
        html, body { touch-action: manipulation; -webkit-touch-callout: none; overscroll-behavior: none }
        input, textarea, button { touch-action: manipulation }
        ::-webkit-scrollbar { display: none }
      `}</style>

      <Decor />

      <div style={{ padding: "12px 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "center", background: C.bg, zIndex: 20, flexShrink: 0, position: "relative" }}>
        <Logo />
        <div style={{ fontSize: 12, color: "#666", background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 20, padding: "4px 12px", display: "flex", alignItems: "center", gap: 6 }}>
          <select
            value={currentLedger.id}
            onChange={(event) => {
              void actions.switchLedger(event.target.value).catch((error) => {
                console.error("[MoniHome] Failed to switch ledger:", error);
              });
            }}
            style={{ border: "none", background: "transparent", color: "inherit", fontSize: 12, fontFamily: "inherit", outline: "none", cursor: "pointer", maxWidth: 120 }}
          >
            {availableLedgers.map((ledger) => (
              <option key={ledger.id} value={ledger.id}>
                {ledger.name}
              </option>
            ))}
          </select>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 4L5 7L8 4" stroke="#888" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
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
              isAi={aiOn && day.id === aiCurrentDate}
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
      />

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
