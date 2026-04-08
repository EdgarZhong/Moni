/**
 * MoniHome — Moni 首页主容器
 *
 * 负责：
 * 1. 编排首页组件顺序（Decor / Header / DisplayBoard / HintCard / StatsBar / OverviewCard / TagRail / DayCard 列表 / BottomNav）
 * 2. 管理滚动阶段（初始 / 过渡 / 完全）
 * 3. 协调看板轮播、折线图横滑、分类筛选、日卡片展开等跨组件交互
 * 4. 协调拖拽分类、AI 控制条、时间范围面板等浮层交互
 *
 * 数据通过 useMoniHomeData Hook 从 LedgerService + BudgetManager 聚合获取。
 * 后续 T7 会替换为真实的 useMoniHomeData Hook。
 *
 * 迁移自 Moni-UI-Prototype/src/pages/MoniHomePrototype.jsx
 * 变更：JSX → TSX，加类型注解，导入路径改为本仓库，接入真实业务数据。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AUTO_CAROUSEL_MS,
  C,
  FILTERS,
  MANUAL_IDLE_LOCK_MS,
  MANUAL_RESUME_MS,
  PHONE_FRAME_HEIGHT,
} from "@ui/features/moni-home/config";
import { buildOverview, getCategory, getRange, isInRange } from "@ui/features/moni-home/helpers";
import { LedgerService } from "@logic/application/services/LedgerService";
import { LedgerManager } from "@logic/application/services/LedgerManager";
import { BatchProcessor } from "@logic/application/ai/BatchProcessor";
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
  type HomeTransaction,
  type HomeDayGroup,
} from "@ui/features/moni-home/components";
import { triggerImpact } from "@system/device/impact";
import { useMoniHomeData } from "@ui/hooks/useMoniHomeData";
import { OnboardingBanner } from "@ui/components/moni/OnboardingBanner";

// ──────────────────────────────────────────────
// 主组件
// ──────────────────────────────────────────────

/** 拖拽滚动锁快照类型 */
interface DragLock {
  bodyOverflow: string;
  containerOverflowY: string | undefined;
  containerTouchAction: string | undefined;
}

/** 看板滑动状态 */
interface SwipeState {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  axis: "vertical" | "horizontal" | null;
}

/** 条目按压状态 */
interface PressState {
  item: HomeTransaction;
  pointerId: number;
  startX: number;
  startY: number;
  startScrollTop: number;
  mode: "pending" | "scroll";
}

/** ReasonDialog 传入的条目类型 */
interface ReasonItem {
  n: string;
  nc: string;
}

export default function MoniHome() {
  // ── 工具函数 ──────────────────────────────────
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  // ── 真实业务数据 ───────────────────────────────
  const {
    days: realDays,
    income: realIncome,
    trend: realTrend,
    hasBudget,
    budgetCard,
    availableCategories,
    ledgerId,
  } = useMoniHomeData();

  // ── 看板状态 ──────────────────────────────────
  /** 当前看板轮播索引（0 = 预算卡，1 = 折线图卡） */
  const [carouselIndex, setCarouselIndex] = useState(0);
  /** 折线图横向偏移步数（从最新向历史方向） */
  const [trendOffset, setTrendOffset] = useState(0);
  /** 折线图拖拽中的像素偏移量 */
  const [trendDragShift, setTrendDragShift] = useState(0);

  // ── 过滤与范围 ────────────────────────────────
  const [selectedFilter, setSelectedFilter] = useState("全部");
  const [rangeMode, setRangeMode] = useState("本月");
  const [customStart, setCustomStart] = useState("2026-03-01");
  const [customEnd, setCustomEnd] = useState("2026-04-07");
  const [rangeDialogOpen, setRangeDialogOpen] = useState(false);

  // ── AI 状态 ───────────────────────────────────
  /** AI 引擎是否处于"运行中" */
  const [aiOn, setAiOn] = useState(false);
  /** AI 引擎是否处于"软停止过渡中" */
  const [aiStop, setAiStop] = useState(false);
  /** AI 当前正在处理的日期（用于 DayCard isAi 染色） */
  const [aiCurrentDate, setAiCurrentDate] = useState<string | null>(null);

  // ── 情景提示卡 ────────────────────────────────
  const [hintVisible, setHintVisible] = useState(true);

  // ── 拖拽分类 ──────────────────────────────────
  const [dragItem, setDragItem] = useState<HomeTransaction | null>(null);
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [hoverCategory, setHoverCategory] = useState<string | null>(null);
  const [reasonItem, setReasonItem] = useState<ReasonItem | null>(null);

  // ── AI 控制条 ─────────────────────────────────
  const [controlOpen, setControlOpen] = useState(false);
  const [controlHit, setControlHit] = useState<string | null>(null);

  // ── 滚动阶段 ──────────────────────────────────
  const [stickyRail, setStickyRail] = useState(false);
  const [scrollStage, setScrollStage] = useState<"初始" | "过渡" | "完全">("初始");
  const [expandedDays, setExpandedDays] = useState<string[]>([]);

  // ── 自动轮播计时 ──────────────────────────────
  const [manualTouchedAt, setManualTouchedAt] = useState<number | null>(null);
  const [resumeClock, setResumeClock] = useState(Date.now());

  // ── Refs ──────────────────────────────────────
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
  /** 拖拽后待写回的条目信息（等 ReasonDialog 确认后写入 LedgerService） */
  const pendingDropRef = useRef<{ txId: string; category: string } | null>(null);

  // ── 计算衍生值 ────────────────────────────────

  const range = useMemo(() => getRange(rangeMode, customStart, customEnd), [rangeMode, customStart, customEnd]);

  /** 所有数据的日期边界（用于 DateRangeDialog 的 min/max） */
  const rangeBounds = useMemo(() => {
    const dates = [
      ...realDays.map((day) => day.id),
      ...realIncome.map((item) => item.date),
      ...realTrend.map((item) => item.key),
    ].sort();
    return {
      min: dates[0] ?? new Date().toISOString().slice(0, 10),
      max: dates[dates.length - 1] ?? new Date().toISOString().slice(0, 10),
    };
  }, [realDays, realIncome, realTrend]);

  const maxTrendOffset = Math.max(0, realTrend.length - 7);
  const trendStepPx = 260 / 6;
  const trendStartIndex = Math.max(0, realTrend.length - 7 - trendOffset);
  const trendMinTranslate = -(maxTrendOffset * trendStepPx);
  const trendBaseTranslate = -(trendStartIndex * trendStepPx);
  const trendTrackTranslate = clamp(trendBaseTranslate + trendDragShift, trendMinTranslate, 0);
  const trendTrackMax = Math.max(...realTrend.map((item) => item.amount), 1);

  /** 当前时间范围内的天数组 */
  const rangeDays = useMemo(() => realDays.filter((day) => isInRange(day.id, range)), [realDays, range]);

  /** 根据分类过滤条目 */
  const filterItems = useCallback(
    (items: HomeTransaction[]) => {
      if (selectedFilter === "全部") return items;
      if (selectedFilter === "未分类") return items.filter((item) => !getCategory(item));
      return items.filter((item) => getCategory(item) === selectedFilter);
    },
    [selectedFilter],
  );

  /** 过滤后的渲染天列表（带 visibleItems） */
  const renderDays = useMemo<HomeDayGroup[]>(
    () => rangeDays.map((day) => ({ ...day, visibleItems: filterItems(day.items) })).filter((day) => day.visibleItems.length > 0),
    [rangeDays, filterItems],
  );

  /** 渲染列表中最新一天的 id */
  const latestId = renderDays[0]?.id;

  /** 当前范围内所有支出条目（扁平化） */
  const expenseItems = useMemo(() => rangeDays.flatMap((day) => day.items), [rangeDays]);

  const expenseTotal = expenseItems.reduce((sum, item) => sum + item.a, 0);
  const incomeTotal = realIncome.filter((item) => isInRange(item.date, range)).reduce((sum, item) => sum + item.amount, 0);
  const txCount = expenseItems.length;
  const unclassifiedCount = expenseItems.filter((item) => !getCategory(item)).length;

  /** 分类概览横条图数据 */
  const overview = useMemo(() => buildOverview(expenseItems), [expenseItems]);

  /**
   * 预算进度（从 BudgetManager 读模型中取，没有预算时 budgetPct=0）
   * budgetCard 由 useMoniHomeData 从 BudgetManager.computeMonthlyBudgetSummary 计算
   */
  const budgetPct = budgetCard ? Math.round(budgetCard.usageRatio * 100) : 0;
  const budgetColor = budgetCard
    ? budgetCard.status === 'exceeded' ? C.coral : budgetCard.status === 'warning' ? C.amber : C.mint
    : C.mint;

  // ── 滚动阶段联动展开 ─────────────────────────

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

  /** 将当前可视区域内的收起日卡片展开（过渡阶段） */
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
      return nextStage as "初始" | "过渡" | "完全";
    });
    if (nextStage === "过渡") expandVisibleCollapsedDays();
    if (nextStage === "初始") resetInitialExpanded();
  }, [expandVisibleCollapsedDays, resetInitialExpanded, syncExpandedDays]);

  useEffect(() => {
    if (scrollStage === "初始") resetInitialExpanded();
    if (scrollStage === "完全") setExpandedDays(renderDays.map((day) => day.id));
  }, [scrollStage, renderDays, resetInitialExpanded]);

  // ── 看板自动轮播 ─────────────────────────────

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
  }, [carouselIndex, manualTouchedAt, resumeClock]);

  const manualSwitch = useCallback((nextIndex: number) => {
    if (!hasBudget) return;
    setCarouselIndex(nextIndex);
    setManualTouchedAt(Date.now());
    setResumeClock(Date.now());
  }, []);

  // ── 看板上下滑 ───────────────────────────────

  const handleBoardSwipeEnd = useCallback(() => {
    if (!boardSwipeRef.current) return;
    const { sx, sy, ex, ey } = boardSwipeRef.current;
    const deltaX = ex - sx, deltaY = ey - sy;
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
      const dX = Math.abs(next.ex - next.sx), dY = Math.abs(next.ey - next.sy);
      if (dX > 8 || dY > 8) next.axis = dY >= dX ? "vertical" : "horizontal";
    }
    if (next.axis === "vertical") event.preventDefault();
    boardSwipeRef.current = next;
  }, []);

  // ── 折线图横滑 ───────────────────────────────

  const handleTrendSwipeEnd = useCallback(() => {
    if (!trendSwipeRef.current) return;
    const { sx, ex, sy, ey, axis } = trendSwipeRef.current;
    const deltaX = ex - sx, deltaY = ey - sy;
    if (axis === "horizontal") {
      const nextStartIndex = clamp(Math.round(-trendTrackTranslate / trendStepPx), 0, maxTrendOffset);
      setTrendOffset(maxTrendOffset - nextStartIndex);
      setTrendDragShift(0);
    } else if (Math.abs(deltaY) > 28 && Math.abs(deltaY) > Math.abs(deltaX)) {
      if (deltaY > 0) manualSwitch(Math.max(0, carouselIndex - 1));
      else manualSwitch(Math.min(1, carouselIndex + 1));
    }
    setTrendDragShift(0);
    trendSwipeRef.current = null;
  }, [carouselIndex, manualSwitch, maxTrendOffset, trendStepPx, trendTrackTranslate]);

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
      const dX = Math.abs(next.ex - next.sx), dY = Math.abs(next.ey - next.sy);
      if (dX > 8 || dY > 8) next.axis = dX >= dY ? "horizontal" : "vertical";
    }
    if (next.axis === "horizontal") {
      event.preventDefault();
      setTrendDragShift(event.clientX - next.sx);
    }
    trendSwipeRef.current = next;
  }, []);

  // ── 长按计时器 ───────────────────────────────

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

  // ── 拖拽滚动锁 ───────────────────────────────

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

  // ── 拖拽分类 ─────────────────────────────────

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
        item, pointerId: event.pointerId,
        startX: event.clientX, startY: event.clientY,
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
          // 纵向移动超过阈值：转为滚动模式，取消长按
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
      // 将待写回的条目 ID 暂存，onSubmit 时用
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

  // 拖拽中全局追踪指针
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

  // 组件卸载时清理
  useEffect(() => () => {
    stopHold();
    unlockDragScroll();
  }, [stopHold, unlockDragScroll]);

  // ── AI 控制条 ────────────────────────────────

  // 初始化账本管理器（加载账本索引 + 触发 LedgerService 数据加载）
  useEffect(() => {
    LedgerManager.getInstance().init().catch(err => {
      console.error('[MoniHome] LedgerManager init failed:', err);
    });
  }, []);

  // 订阅 BatchProcessor 状态，驱动 aiOn / aiStop / aiCurrentDate UI 态
  useEffect(() => {
    const processor = BatchProcessor.getInstance();
    const unsub = processor.on('status', ({ status, progress }) => {
      if (status === 'ANALYZING') {
        setAiOn(true);
        setAiStop(processor.isStopping);
        setAiCurrentDate(progress.currentDate || null);
      } else if (status === 'IDLE') {
        setAiOn(false);
        setAiStop(false);
        setAiCurrentDate(null);
      } else if (status === 'ERROR') {
        setAiOn(false);
        setAiStop(false);
        setAiCurrentDate(null);
      }
    });
    return unsub;
  }, []);

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
      // 接入真实 BatchProcessor
      void BatchProcessor.getInstance().run();
      void triggerImpact("medium");
    }
    if (controlHit === "关闭" && aiOn) {
      BatchProcessor.getInstance().stop();
      setAiStop(true);
      void triggerImpact("medium");
    }
    setControlOpen(false);
    setControlHit(null);
  }, [aiOn, controlHit, controlOpen, stopHold]);

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

  // ── 日卡片展开/收起 ──────────────────────────

  const toggleDay = useCallback((dayId: string) => {
    if (scrollStage === "完全") return;
    setExpandedDays((prev) => (prev.includes(dayId) ? prev.filter((item) => item !== dayId) : [...prev, dayId]));
  }, [scrollStage]);

  useEffect(() => {
    hoverCategoryRef.current = hoverCategory;
  }, [hoverCategory]);

  // ── 事件处理器对象（传给子组件避免内联 closure 重渲染） ──

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
    onPointerCancel: () => { setTrendDragShift(0); trendSwipeRef.current = null; },
  };

  // ── 渲染 ─────────────────────────────────────

  return (
    <div style={{ width: "100%", maxWidth: 390, margin: "0 auto", background: C.bg, borderRadius: 24, border: `2.5px solid ${C.dark}`, overflow: "hidden", position: "relative", fontFamily: "'Nunito',-apple-system,sans-serif", height: PHONE_FRAME_HEIGHT, display: "flex", flexDirection: "column", paddingTop: "env(safe-area-inset-top)" }}>
      {/* Google Fonts 加载 */}
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      {/* 全局 CSS：Moni 动画关键帧 + 骨架屏 + 全局手势防御规则 */}
      <style>{`
        /* 流光边框动画（AI 处理中日卡片） */
        @keyframes rb {
          0%   { border-color: ${C.coral} }
          25%  { border-color: ${C.yellow} }
          50%  { border-color: ${C.blue} }
          75%  { border-color: ${C.mint} }
          100% { border-color: ${C.coral} }
        }
        /* 流光发光动画（底部导航中央按钮） */
        @keyframes rbs {
          0%   { box-shadow: 0 0 0 2.5px ${C.coral},0 0 12px ${C.coral}44 }
          25%  { box-shadow: 0 0 0 2.5px ${C.yellow},0 0 12px ${C.yellow}44 }
          50%  { box-shadow: 0 0 0 2.5px ${C.blue},0 0 12px ${C.blue}44 }
          75%  { box-shadow: 0 0 0 2.5px ${C.mint},0 0 12px ${C.mint}44 }
          100% { box-shadow: 0 0 0 2.5px ${C.coral},0 0 12px ${C.coral}44 }
        }
        /* AI 处理中指示点呼吸 */
        @keyframes p  { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
        /* 骨架屏闪烁 */
        @keyframes sk { 0%,100% { opacity: .42 } 50% { opacity: .16 } }
        /* 弹出动画（弹窗/控制条） */
        @keyframes fu { from { transform: translateY(10px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        /* 类名应用 */
        .ab { animation: rb 3s linear infinite; border-width: 2.5px; border-style: solid }
        .ag { animation: rbs 3s linear infinite }
        .sk { animation: sk 1.7s ease-in-out infinite; background: #ddd; border-radius: 4px }
        .fi { animation: fu .28s ease-out }
        * { box-sizing: border-box }
        /* 全局手势防御（来自 Moni CLAUDE.md §手势代码规范） */
        html, body { touch-action: manipulation; -webkit-touch-callout: none; overscroll-behavior: none }
        input, textarea, button { touch-action: manipulation }
        ::-webkit-scrollbar { display: none }
      `}</style>

      {/* Memphis 背景装饰 */}
      <Decor />

      {/* ── Header（粘性固定）── */}
      <div style={{ padding: "12px 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "center", background: C.bg, zIndex: 20, flexShrink: 0, position: "relative" }}>
        <Logo />
        {/* 账本选择器（mock 阶段：仅显示文案，T7 接入真实账本切换） */}
        <div style={{ fontSize: 12, color: "#666", background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 20, padding: "4px 14px", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          日常开销
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M2 4L5 7L8 4" stroke="#888" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* ── 可滚动内容区 ── */}
      <div
        ref={scrollRef}
        data-scroll-container
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: "auto", overflowX: "hidden", position: "relative", zIndex: 1 }}
      >
        {/* Zone A：看板轮播（预算卡 + 折线图卡） */}
        <DisplayBoard
          currentIndex={carouselIndex}
          budgetPct={budgetPct}
          budgetColor={budgetColor}
          hasBudget={hasBudget}
          trendData={realTrend}
          trendTrackMax={trendTrackMax}
          trendTrackTranslate={trendTrackTranslate}
          trendIsDragging={trendDragShift !== 0}
          maxTrendOffset={maxTrendOffset}
          onManualSwitch={manualSwitch}
          onTrendForward={() => { setTrendDragShift(0); setTrendOffset((prev) => Math.min(maxTrendOffset, prev + 1)); }}
          onTrendBackward={() => { setTrendDragShift(0); setTrendOffset((prev) => Math.max(0, prev - 1)); }}
          boardHandlers={boardHandlers}
          trendHandlers={trendHandlers}
        />

        {/* Zone B：情景提示卡 */}
        <HintCard visible={hintVisible} onClose={() => setHintVisible(false)} />

        {/* Zone B2：预算引导横幅（首次使用引导，有交易且未设预算时显示） */}
        <OnboardingBanner
          ledgerId={ledgerId}
          hasTransactions={realDays.length > 0}
          onDismiss={() => { /* 横幅自行管理可见性，此处无需额外操作 */ }}
        />

        {/* Zone C：统计摘要栏 */}
        <StatsBar
          rangeLabel={range.label}
          expenseTotal={expenseTotal}
          incomeTotal={incomeTotal}
          count={txCount}
          isCustom={rangeMode === "自定义"}
        />

        {/* Zone D：分类概览卡（右上角为 DateRangeDialog 入口） */}
        <OverviewCard rangeLabel={range.label} overview={overview} onOpen={() => setRangeDialogOpen(true)} />

        {/* Zone E：分类筛选 Tab 轨道（sticky） */}
        <div
          ref={railRef}
          style={{ position: "sticky", top: 0, zIndex: 15, background: C.bg, paddingTop: 8, borderBottom: `1px solid ${stickyRail ? C.border : "transparent"}` }}
        >
          <TagRail filters={FILTERS} selectedFilter={selectedFilter} unclassifiedCount={unclassifiedCount} onSelect={setSelectedFilter} />
        </div>

        {/* Zone F：日卡片流水列表 */}
        <div style={{ padding: "6px 16px 96px" }}>
          {renderDays.map((day) => (
            <DayCard
              key={day.id}
              day={day}
              isExpanded={expandedDays.includes(day.id)}
              // 当前 AI 正在处理该天时高亮（aiCurrentDate 来自 BatchProcessor 状态）
              isAi={(aiOn || aiStop) && day.id === aiCurrentDate}
              aiStop={aiStop}
              onToggle={() => toggleDay(day.id)}
              onItemPointerDown={handleItemPointerDown}
              onItemPointerMove={handleItemPointerMove}
              onItemPointerUp={handleItemPointerUp}
              dayRef={(node) => { dayRefs.current[day.id] = node; }}
            />
          ))}
        </div>
      </div>

      {/* ── 底部导航 ── */}
      <BottomNav
        aiOn={aiOn}
        aiStop={aiStop}
        controlOpen={controlOpen}
        controlHit={controlHit}
        onStartControl={handleStartControl}
        onEndControl={handleEndControl}
        onCancelControl={handleCancelControl}
        onUpdateControlHit={{ ref: controlRef, move: updateControlHit }}
      />

      {/* 控制条背景遮罩（点击关闭控制条） */}
      {controlOpen && (
        <div
          onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); setControlOpen(false); setControlHit(null); }}
          style={{ position: "absolute", inset: 0, zIndex: 25, background: "transparent" }}
        />
      )}

      {/* 拖拽分类蒙版 */}
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

      {/* 分类后理由输入弹窗 */}
      <ReasonDialog
        item={reasonItem}
        onClose={() => { setReasonItem(null); pendingDropRef.current = null; }}
        onSubmit={(reason) => {
          // 将拖拽分类结果写回 LedgerService
          const pending = pendingDropRef.current;
          if (pending) {
            LedgerService.getInstance().updateCategory(pending.txId, pending.category, reason);
            pendingDropRef.current = null;
          }
          setReasonItem(null);
        }}
      />

      {/* 时间范围选择器 */}
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
