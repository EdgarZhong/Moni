/**
 * MoniHome — Moni 首页主容器
 *
 * 首页只消费 useMoniHomeData 提供的 facade wrapper，不直接下潜到底层 service。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AUTO_CAROUSEL_MS,
  C,
  MANUAL_RESUME_MS,
  PHONE_FRAME_WIDTH_CSS,
} from "@ui/features/moni-home/config";
import { buildOverview, getCategory, getRange, isInRange } from "@ui/features/moni-home/helpers";
import {
  DateRangeDialog,
  DayCard,
  Decor,
  DRAG_PANEL_COLLAPSED_VISIBLE_PX,
  DRAG_PANEL_EXPAND_ARM_DISTANCE_PX,
  DisplayBoard,
  DragOverlay,
  OverviewCard,
  ReasonDialog,
  RootLedgerPageHeader,
  StatsBar,
  TagRail,
  type HomeDayGroup,
  type HomeTransaction,
} from "@ui/features/moni-home/components";
import { HomeHintCard } from "@ui/features/moni-home/HomeHintCard";
import {
  restoreHomeRangeUiSessionState,
  saveHomeRangeUiSessionState,
  subscribeHomeRangeUiOverride,
  toLocalDateKey,
} from "@ui/features/moni-home/homeRangeUiSession";
import { TransactionDetailPage } from "@ui/features/moni-home/TransactionDetailPage";
import { triggerImpact } from "@system/device/impact";
import { useMoniHomeData } from "@ui/hooks/useMoniHomeData";
import { useBackHandler } from "@ui/hooks/useBackHandler";
import { useHomeListGestureController } from "@ui/hooks/useHomeListGestureController";
import type { LedgerOption } from "@shared/types";
import { buildCategoryVisualRegistry } from "@ui/shared/categoryVisuals";


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


interface ReasonItem {
  n: string;
  nc: string;
}

interface MoniHomeProps {
  onNavigate?: (page: "home" | "entry" | "settings") => void;
  onOpenSettingsSubPage?: (page: "selfDesc" | "budget") => void;
  currentLedger: LedgerOption;
  availableLedgers: LedgerOption[];
  onSwitchLedger: (ledgerId: string) => void | Promise<unknown>;
  onBottomNavVisibilityChange?: (visible: boolean) => void;
}

interface DetailContext {
  item: HomeTransaction;
  dayId: string;
  dayLabel: string;
}

export default function MoniHome({
  onNavigate,
  onOpenSettingsSubPage,
  currentLedger: shellCurrentLedger,
  availableLedgers,
  onSwitchLedger,
}: MoniHomeProps) {
  const {
    days: realDays,
    income: realIncome,
    totalTransactionCount,
    trendCard,
    currentLedger,
    categoryDefinitions,
    hintCards,
    hasBudget,
    budgetCard,
    availableCategories,
    isLoading,
    unclassifiedCount,
    aiEngineUiState,
    dataRange,
    actions,
  } = useMoniHomeData();

  const [carouselIndex, setCarouselIndex] = useState(0);

  const [selectedFilter, setSelectedFilter] = useState("全部");
  const [rangeMode, setRangeMode] = useState("本月");
  const [customStart, setCustomStart] = useState(dataRange.min ?? new Date().toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(dataRange.max ?? new Date().toISOString().slice(0, 10));
  const [rangeDialogOpen, setRangeDialogOpen] = useState(false);
  const [draftRangeMode, setDraftRangeMode] = useState("本月");
  const [draftCustomStart, setDraftCustomStart] = useState(dataRange.min ?? new Date().toISOString().slice(0, 10));
  const [draftCustomEnd, setDraftCustomEnd] = useState(dataRange.max ?? new Date().toISOString().slice(0, 10));
  // restore effect 完成后置为当前账本 ID，save effect 用它判断"恢复已完成"再写缓存
  const [restoredLedgerId, setRestoredLedgerId] = useState<string | null>(null);

  const [hintVisible, setHintVisible] = useState(true);
  const [dragItem, setDragItem] = useState<HomeTransaction | null>(null);
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [hoverCategory, setHoverCategory] = useState<string | null>(null);
  const [dragPanelState, setDragPanelState] = useState<"collapsed" | "expanded">("collapsed");
  const [reasonItem, setReasonItem] = useState<ReasonItem | null>(null);
  const [detailTxId, setDetailTxId] = useState<string | null>(null);
  // 趋势图连续滚动位移（像素）：0=最早，大值=最新。初始设为超大值，让组件自动 clamp 到最新位置
  const [trendScrollOffsetPx, setTrendScrollOffsetPx] = useState(9999);
  // DisplayBoard 每次渲染时写入实测 maxScrollOffset，拖拽时用来正确 clamp
  const trendMaxScrollRef = useRef(9999);

  const [stickyRail, setStickyRail] = useState(false);
  const [scrollStage, setScrollStage] = useState<"初始" | "过渡" | "完全">("初始");
  const [expandedDays, setExpandedDays] = useState<string[]>([]);

  const [manualTouchedAt, setManualTouchedAt] = useState<number | null>(null);
  // 用 ref 在 setTimeout 回调触发时读取最新值，防止竞态漏触发
  const manualTouchedAtRef = useRef<number | null>(null);
  manualTouchedAtRef.current = manualTouchedAt;

  const scrollRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const boardSwipeRef = useRef<SwipeState | null>(null);
  // 趋势图拖拽轨迹追踪（记录拖拽起点和起始滚动偏移，支持轴判定）
  const trendScrollRef = useRef<{ startX: number; startY: number; startOffset: number; axis: "h" | "v" | null } | null>(null);
  const hoverCategoryRef = useRef<string | null>(null);
  const dragLockRef = useRef<DragLock | null>(null);
  const dragPanelStateRef = useRef<"collapsed" | "expanded">("collapsed");
  const dragActivationPointRef = useRef<{ x: number; y: number } | null>(null);
  const dragExpandArmedRef = useRef(false);
  const pendingDropRef = useRef<{ txId: string; category: string } | null>(null);
  const restoredRangeSessionKeyRef = useRef<string | null>(null);

  const primaryHint = hintCards[0] ?? null;
  const primaryHintAction = primaryHint?.action ?? null;
  const aiStop = aiEngineUiState.status === "draining";
  const aiOn = aiEngineUiState.status === "running" || aiEngineUiState.status === "draining";
  const aiCurrentDates = aiEngineUiState.activeDates;
  /**
   * 组件内部继续使用稳定的日期格式化 helper，
   * 但实现直接复用外层的 `toLocalDateKey`，避免存在两套口径。
   */
  const toDateKey = useCallback((value: Date) => toLocalDateKey(value), []);

  const railFilters = useMemo(() => {
    const categories = availableCategories.filter((category) => category && category !== "uncategorized");
    return ["全部", "未分类", ...categories];
  }, [availableCategories]);

  /**
   * 首页所有分类视觉都从同一份 registry 读取。
   * 这样日卡、概览、拖拽投放格、详情页就不会再各自维护硬编码映射。
   */
  const categoryVisuals = useMemo(
    () => buildCategoryVisualRegistry(categoryDefinitions),
    [categoryDefinitions],
  );

  /**
   * 概览与拖拽投放区都应使用账本当前真实分类顺序。
   * 若某些旧数据分类仍短暂存在于记录里但当前定义里已没有，也在末尾补上，
   * 避免出现“条目有标签，但概览和投放区完全没有这个分类”的断裂。
   */
  const orderedCategoryKeys = useMemo(() => {
    const keys = categoryDefinitions
      .map((definition) => definition.key)
      .filter((key) => key && key !== "uncategorized");

    const extraKeys = Array.from(new Set(
      realDays
        .flatMap((day) => day.items)
        .map((item) => getCategory(item))
        .filter((key): key is string => Boolean(key && key !== "uncategorized")),
    )).filter((key) => !keys.includes(key));

    return [...keys, ...extraKeys];
  }, [categoryDefinitions, realDays]);

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

  /**
   * 统一计算"一个范围选择"在首页里的三层含义：
   * 1. requested：快捷键/自定义真正要求的原始日期；
   * 2. visual：映射到滑块上的显示位置，永远限制在账本数据范围内；
   * 3. applied：真正提交给首页过滤和 AI 消费的范围，语义上等于交集；
   *    若无交集，则用 `isEmpty` 显式表达空结果，而不是偷偷折成边界日。
   */
  const buildRangeSelection = useCallback((mode: string, start: string, end: string) => {
    const requested = getRange(mode, start, end, rangeBounds.min, rangeBounds.max);
    const requestedStart = toDateKey(requested.start);
    const requestedEnd = toDateKey(requested.end);
    const intersects = !(requestedEnd < rangeBounds.min || requestedStart > rangeBounds.max);

    const visualStart = requestedEnd < rangeBounds.min
      ? rangeBounds.min
      : requestedStart > rangeBounds.max
        ? rangeBounds.max
        : (requestedStart < rangeBounds.min ? rangeBounds.min : requestedStart);
    const visualEnd = requestedEnd < rangeBounds.min
      ? rangeBounds.min
      : requestedStart > rangeBounds.max
        ? rangeBounds.max
        : (requestedEnd > rangeBounds.max ? rangeBounds.max : requestedEnd);

    return {
      label: requested.label,
      requested: {
        start: requestedStart,
        end: requestedEnd,
      },
      visual: {
        start: visualStart,
        end: visualEnd,
      },
      applied: {
        start: new Date(`${visualStart}T00:00:00`),
        end: new Date(`${visualEnd}T00:00:00`),
        isEmpty: !intersects,
      },
    };
  }, [rangeBounds.max, rangeBounds.min, toDateKey]);

  const committedRangeSelection = useMemo(
    () => buildRangeSelection(rangeMode, customStart, customEnd),
    [buildRangeSelection, customEnd, customStart, rangeMode],
  );
  const draftRangeSelection = useMemo(
    () => buildRangeSelection(draftRangeMode, draftCustomStart, draftCustomEnd),
    [buildRangeSelection, draftCustomEnd, draftCustomStart, draftRangeMode],
  );

  useEffect(() => {
    /**
     * 真实账本边界加载完成前不提交范围：
     * 未加载时 rangeBounds 是 today/today 兜底值，提交后 homeDateRange 变成"today"，
     * restore effect 会把它误反推为"今天"，覆盖掉正确的"本月"默认值。
     */
    if (!dataRange.min || !dataRange.max) {
      return;
    }
    actions.setHomeDateRange(committedRangeSelection.applied);
  }, [actions.setHomeDateRange, committedRangeSelection, dataRange.max, dataRange.min]);

  useEffect(() => {
    /**
     * 首页范围 UI 只在"切换到新账本"时恢复一次。
     * session key 只用账本 ID，不带数据边界：
     * - 账本边界是数据派生，不代表用户意图；
     * - 原先把边界混入 key，导致数据加载时触发二次 restore，
     *   用错误时机写入的"本月"覆盖了用户真实选择。
     * 账本边界变化（导入新数据）时交集由 committedRangeSelection 重算即可，无需再触发 restore。
     */
    if (restoredRangeSessionKeyRef.current === currentLedger.id) {
      return;
    }

    const restored = restoreHomeRangeUiSessionState(currentLedger.id);

    restoredRangeSessionKeyRef.current = currentLedger.id;
    setRangeMode(restored.rangeMode);
    setCustomStart(restored.customStart);
    setCustomEnd(restored.customEnd);
    setDraftRangeMode(restored.draftRangeMode);
    setDraftCustomStart(restored.draftCustomStart);
    setDraftCustomEnd(restored.draftCustomEnd);
    setRestoredLedgerId(currentLedger.id);
    // 账本切换时，趋势图回到最新位置（超大值 → clamp 到 maxOffset）
    setTrendScrollOffsetPx(9999);
  }, [currentLedger.id]);

  useEffect(() => {
    /**
     * 某些跨层交互（例如零记忆弹窗选择“只分类 7 天”）发生在 AppRoot，
     * 当时并不持有 MoniHome 的本地 state setter。
     * 这里订阅 UI 侧“外部范围覆盖”事件，让当前已挂载的首页实例也能立即同步到新范围，
     * 避免只改 facade 的 data range、却遗漏了 DateRangePicker 本地显示态。
     */
    return subscribeHomeRangeUiOverride((payload) => {
      if (payload.ledgerId !== currentLedger.id) {
        return;
      }
      setRangeMode(payload.state.rangeMode);
      setCustomStart(payload.state.customStart);
      setCustomEnd(payload.state.customEnd);
      setDraftRangeMode(payload.state.draftRangeMode);
      setDraftCustomStart(payload.state.draftCustomStart);
      setDraftCustomEnd(payload.state.draftCustomEnd);
      setRestoredLedgerId(payload.ledgerId);
    });
  }, [currentLedger.id]);

  useEffect(() => {
    /**
     * restoredLedgerId 在 restore effect 完成后才被置为 currentLedger.id。
     * 在此之前跳过写缓存，避免把 Render 1 的初始占位值（today/本月）污染缓存。
     * 这样空账本（dataRange 永远为 null）的用户选择也能正确持久化。
     */
    if (!currentLedger.id || restoredLedgerId !== currentLedger.id) {
      return;
    }

    saveHomeRangeUiSessionState(currentLedger.id, {
      rangeMode,
      customStart,
      customEnd,
      draftRangeMode,
      draftCustomStart,
      draftCustomEnd,
    });
  }, [
    currentLedger.id,
    restoredLedgerId,
    customEnd,
    customStart,
    draftCustomEnd,
    draftCustomStart,
    draftRangeMode,
    rangeMode,
  ]);


  /**
   * `realDays` 已经是 facade 按 `homeDateRange` 过滤后的结果。
   * 这里不能再按滑块视觉位置二次过滤，否则会把"无交集"错误折叠成边界那一天。
   */
  const rangeDays = realDays;

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
  /**
   * 首页日卡现在会同时展示收入与支出条目，
   * 但“支出统计 / 分类概览 / 预算相关消费感知”仍只应基于真实支出计算。
   * 因此这里显式把支出条目单独筛出来，避免收入混进 overview 和 expenseTotal。
   */
  const expenseItems = useMemo(
    () => rangeDays.flatMap((day) => day.items).filter((item) => item.direction !== "in"),
    [rangeDays],
  );
  const expenseTotal = expenseItems.reduce((sum, item) => sum + item.a, 0);
  const committedIncomeRange = useMemo(
    () => ({
      start: committedRangeSelection.applied.start,
      end: committedRangeSelection.applied.end,
      label: committedRangeSelection.label,
    }),
    [committedRangeSelection.applied.end, committedRangeSelection.applied.start, committedRangeSelection.label],
  );
  const incomeTotal = committedRangeSelection.applied.isEmpty
    ? 0
    : realIncome.filter((item) => isInRange(item.date, committedIncomeRange)).reduce((sum, item) => sum + item.amount, 0);
  const txCount = committedRangeSelection.applied.isEmpty ? 0 : totalTransactionCount;
  const overview = useMemo(
    () => buildOverview(expenseItems, orderedCategoryKeys),
    [expenseItems, orderedCategoryKeys],
  );

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

  /**
   * handleScroll 使用 rAF 节流，避免在滚动热路径中频繁 setState。
   */
  const handleScrollRef = useRef(false);
  const handleScroll = useCallback(() => {
    if (handleScrollRef.current) return;
    handleScrollRef.current = true;

    requestAnimationFrame(() => {
      handleScrollRef.current = false;
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
    });
  }, [expandVisibleCollapsedDays, resetInitialExpanded, syncExpandedDays]);

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

  // ─── 手势状态机集成 ────────────────────────────────────

  const gesture = useHomeListGestureController<HomeTransaction>({
    scrollRef,
    longPressMs: 420,
    moveThreshold: 8,
    axisLockRatio: 1.15,
    onTapItem: (item) => {
      void actions.markPostAiInteractionCompleted();
      setDetailTxId(String(item.id));
    },
    onDragStart: ({ item, x, y }) => {
      lockDragScroll();
      dragPanelStateRef.current = "collapsed";
      dragActivationPointRef.current = { x, y };
      dragExpandArmedRef.current = false;
      setDragPanelState("collapsed");
      setDragItem(item);
      setDragPoint({ x, y });
      hoverCategoryRef.current = null;
      setHoverCategory(null);
      void triggerImpact("light");
    },
    onDragMove: () => {
      // 拖拽移动由 window-level pointermove listener 处理（setDragPoint / resolveHoverCategory / 面板展开）
    },
    onDragEnd: () => {
      // 分类 drop 由 window-level pointerup listener 处理，这里只释放滚动锁定
      unlockDragScroll();
    },
    onDragCancel: () => {
      unlockDragScroll();
    },
    lockHomeScroll: lockDragScroll,
    unlockHomeScroll: unlockDragScroll,
    onScroll: handleScroll, // rAF 节流后的滚动回调
  });

  useEffect(() => {
    if (scrollStage === "初始") resetInitialExpanded();
    if (scrollStage === "完全") setExpandedDays(renderDays.map((day) => day.id));
  }, [scrollStage, renderDays, resetInitialExpanded]);

  // 无预算时把轮播 index 归零，避免预算恢复后仍停在旧位置
  useEffect(() => {
    if (!hasBudget) setCarouselIndex(0);
  }, [hasBudget]);

  // Effect 1：暂停期倒计时，到期后清除 manualTouchedAt，让 Effect 2 恢复轮播
  useEffect(() => {
    if (!manualTouchedAt) return undefined;
    const remaining = MANUAL_RESUME_MS - (Date.now() - manualTouchedAt);
    if (remaining <= 0) { setManualTouchedAt(null); return undefined; }
    const t = setTimeout(() => setManualTouchedAt(null), remaining);
    return () => clearTimeout(t);
  }, [manualTouchedAt]);

  // Effect 2：自动轮播；暂停期内（manualTouchedAt 非空）直接跳过不启动
  useEffect(() => {
    if (!hasBudget || manualTouchedAt !== null) return undefined;
    const t = setTimeout(() => {
      // 回调执行时再次通过 ref 校验，防止 cleanup 与回调入队之间的极短竞态
      if (manualTouchedAtRef.current !== null) return;
      setCarouselIndex((prev) => (prev + 1) % 2);
    }, AUTO_CAROUSEL_MS);
    return () => clearTimeout(t);
  }, [carouselIndex, hasBudget, manualTouchedAt]);

  const manualSwitch = useCallback((nextIndex: number) => {
    if (!hasBudget) return;
    setCarouselIndex(nextIndex);
    setManualTouchedAt(Date.now());
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

  // 趋势图连续滚动：按下时捕获指针，移动时实时更新滚动位移，抬手时保持当前位置
  const handleTrendPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.stopPropagation();
    // 任何触摸趋势图的动作都算"人手操作"，重置自动轮播暂停计时
    setManualTouchedAt(Date.now());
    // 捕获指针确保手指移出元素范围后仍持续收到事件
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
    // 用 DisplayBoard 实测的 maxScrollOffset 做双边 clamp，防止 startOffset 偏离有效范围
    // 导致后续拖拽出现大死区或跳变
    const clampedStart = Math.max(0, Math.min(trendMaxScrollRef.current, trendScrollOffsetPx));
    trendScrollRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startOffset: clampedStart,
      axis: null,
    };
  }, [trendScrollOffsetPx]);

  const handleTrendPointerMove = useCallback((event: React.PointerEvent) => {
    if (!trendScrollRef.current) return;
    event.stopPropagation();
    const { startX, startY, startOffset, axis } = trendScrollRef.current;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    // 判定轴方向（8px 死区）
    if (!trendScrollRef.current.axis) {
      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        trendScrollRef.current.axis = Math.abs(deltaX) >= Math.abs(deltaY) ? "h" : "v";
      }
      return;
    }

    if (axis === "h") {
      // 右划（deltaX > 0）= 看更早数据 → offset 减小；左划 = 看更新数据 → offset 增大
      // 双边 clamp 保证状态始终在有效范围内，消除大死区跳变
      setTrendScrollOffsetPx(Math.max(0, Math.min(trendMaxScrollRef.current, startOffset - deltaX)));
    }
    // 竖向轴期间不更新滚动，等 pointerup 时处理卡片切换
  }, []);

  const handleTrendPointerUp = useCallback((event: React.PointerEvent) => {
    if (!trendScrollRef.current) return;
    const { startX, startY, axis } = trendScrollRef.current;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    // 竖向切换：axis=v 且竖向位移 > 28px 且竖向明显大于横向（与 boardSwipeEnd 防护保持一致）
    if (axis === "v" && Math.abs(deltaY) > 28 && Math.abs(deltaY) > Math.abs(deltaX)) {
      if (deltaY > 0) manualSwitch(Math.max(0, carouselIndex - 1));
      else manualSwitch(Math.min(1, carouselIndex + 1));
    }
    trendScrollRef.current = null;
  }, [carouselIndex, manualSwitch]);


  /**
   * 拖拽态退出时统一清理底部细则面板与拖拽浮层的瞬时状态。
   * 这样无论是正常投放、取消，还是 pointercancel，中间态都不会泄漏到下一次长按。
   */
  const resetDragOverlay = useCallback(() => {
    setDragItem(null);
    setDragPoint(null);
    setHoverCategory(null);
    hoverCategoryRef.current = null;
    dragPanelStateRef.current = "collapsed";
    dragActivationPointRef.current = null;
    dragExpandArmedRef.current = false;
    setDragPanelState("collapsed");
  }, []);

  const resolveHoverCategory = useCallback((clientX: number, clientY: number) => {
    const target = document.elementFromPoint(clientX, clientY)?.closest("[data-drop-category]");
    const category = target?.getAttribute("data-drop-category") ?? null;
    hoverCategoryRef.current = category;
    setHoverCategory(category);
  }, []);


  const handleDropCategory = useCallback(
    (category: string) => {
      if (!dragItem) return;
      setReasonItem({ n: dragItem.n, nc: category });
      pendingDropRef.current = { txId: String(dragItem.id), category };
      unlockDragScroll();
      resetDragOverlay();
      void triggerImpact("medium");
    },
    [dragItem, resetDragOverlay, unlockDragScroll],
  );

  useEffect(() => {
    if (!dragItem) return undefined;
    const handlePointerMove = (event: PointerEvent) => {
      setDragPoint({ x: event.clientX, y: event.clientY });
      resolveHoverCategory(event.clientX, event.clientY);
      /**
       * 细则展开阈值必须是父层里的固定几何分界线：
       * 视口底边向上减去收缩态面板可见高度。
       * 这样分类区整体在 Expanded 时被上推，也不会污染真实触发线。
       */
      const threshold = window.innerHeight - DRAG_PANEL_COLLAPSED_VISIBLE_PX;
      /**
       * 只有当用户在长按成立后真正向下拖出一小段位移时，才允许 Expanded 介入。
       * 这样可以挡住"用户本来准备直接上拖去分类，面板却先自己弹开"的打扰。
       */
      if (!dragExpandArmedRef.current) {
        const activationPoint = dragActivationPointRef.current;
        if (activationPoint && event.clientY - activationPoint.y >= DRAG_PANEL_EXPAND_ARM_DISTANCE_PX) {
          dragExpandArmedRef.current = true;
        }
      }
      const nextState: "collapsed" | "expanded" = dragExpandArmedRef.current && event.clientY >= threshold ? "expanded" : "collapsed";
      if (dragPanelStateRef.current !== nextState) {
        dragPanelStateRef.current = nextState;
        setDragPanelState(nextState);
      }
    };
    /**
     * 只有用户真实抬手（pointerup）时才允许提交分类。
     *
     * 真机触摸流里，系统可能因为手势仲裁、滚动接管、来电/通知、WebView 自身策略等原因
     * 触发 pointercancel。此前这里把 pointercancel 与 pointerup 共用同一套逻辑，
     * 导致"手指尚未松开，只是移动到分类框上方"时，一旦收到 cancel，
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
      resetDragOverlay();
    };
    /**
     * pointercancel 只表示当前触摸流被中断，不代表用户完成了放手。
     * 因此这里必须无条件取消拖拽，不能提交任何分类结果。
     */
    const handlePointerCancel = () => {
      unlockDragScroll();
      resetDragOverlay();
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [dragItem, handleDropCategory, resetDragOverlay, resolveHoverCategory, unlockDragScroll]);

  useEffect(() => () => {
    unlockDragScroll();
  }, [unlockDragScroll]);

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
    onPointerUp: handleTrendPointerUp,
    onPointerCancel: () => { trendScrollRef.current = null; },
  };

  /**
   * 打开面板时，把"已提交生效态"复制成一份草稿。
   * 后续快捷键/滑块/日期输入都只改草稿，不立刻影响首页内容。
   */
  const openRangeDialog = useCallback(() => {
    setDraftRangeMode(rangeMode);
    setDraftCustomStart(customStart);
    setDraftCustomEnd(customEnd);
    setRangeDialogOpen(true);
  }, [customEnd, customStart, rangeMode]);

  // 返回键优先级（从低到高 push，互斥状态，确保每次只有一个激活）：
  // 日期范围对话框 → 理由对话框 → 拖拽蒙版
  useBackHandler(() => { setRangeDialogOpen(false); }, rangeDialogOpen);
  useBackHandler(() => { setReasonItem(null); pendingDropRef.current = null; }, reasonItem !== null);
  useBackHandler(() => { unlockDragScroll(); resetDragOverlay(); }, dragItem !== null);

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
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
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

      <RootLedgerPageHeader
        currentLedger={shellCurrentLedger}
        availableLedgers={availableLedgers}
        onSwitchLedger={onSwitchLedger}
      />

      <div
        ref={scrollRef}
        data-scroll-container
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: "auto", overflowX: "hidden", position: "relative", zIndex: 1, WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"] }}
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
          allTrendPoints={trendCard.allPoints}
          trendScrollOffsetPx={trendScrollOffsetPx}
          onManualSwitch={manualSwitch}
          boardHandlers={boardHandlers}
          trendHandlers={trendHandlers}
          maxScrollOffsetRef={trendMaxScrollRef}
        />

        <HomeHintCard
          visible={hintVisible}
          icon={primaryHint?.type === "budget_alert" ? "⚠️" : primaryHint?.type === "budget_nudge" ? "💰" : "💡"}
          title={primaryHint?.title}
          description={primaryHint?.description}
          actionLabel={primaryHintAction?.label ?? null}
          onAction={
            primaryHintAction
              ? () => {
                  if (primaryHintAction.target === "entry_import") {
                    onNavigate?.("entry");
                    return;
                  }
                  if (primaryHintAction.target === "settings_self_description") {
                    onOpenSettingsSubPage?.("selfDesc");
                    return;
                  }
                  if (primaryHintAction.target === "settings_budget") {
                    onOpenSettingsSubPage?.("budget");
                  }
                }
              : null
          }
          onClose={() => setHintVisible(false)}
        />

        <StatsBar
          rangeLabel={committedRangeSelection.label}
          expenseTotal={expenseTotal}
          incomeTotal={incomeTotal}
          count={txCount}
          isCustom={rangeMode === "自定义"}
        />

        <OverviewCard
          rangeLabel={committedRangeSelection.label}
          overview={overview}
          categoryVisuals={categoryVisuals}
          onOpen={openRangeDialog}
        />

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
              onItemPointerDown={gesture.onItemPointerDown}
              onItemPointerMove={gesture.onItemPointerMove}
              onItemPointerUp={gesture.onItemPointerUp}
              onItemPointerCancel={gesture.onItemPointerCancel}
              categoryVisuals={categoryVisuals}
              dayRef={(node) => { dayRefs.current[day.id] = node; }}
            />
          ))}

          {!isLoading && renderDays.length === 0 && (
            <div style={{ padding: "24px 8px", textAlign: "center", fontSize: 12, color: C.muted }}>
              当前范围内暂无流水。
            </div>
          )}

          {/* 快速返回顶部：仅当分类轮盘已贴住 header 时显示 */}
          {scrollStage === "完全" && (
            <div
              onClick={() => {
                const container = scrollRef.current;
                if (!container) return;
                const start = container.scrollTop;
                if (start <= 0) return;
                const startTime = performance.now();
                const duration = 1000;
                const scrollToTop = (now: number) => {
                  const elapsed = now - startTime;
                  const progress = Math.min(elapsed / duration, 1);
                  const ease = 1 - Math.pow(1 - progress, 3);
                  container.scrollTop = start * (1 - ease);
                  if (progress < 1) {
                    requestAnimationFrame(scrollToTop);
                  }
                };
                requestAnimationFrame(scrollToTop);
              }}
              style={{
                padding: "12px 0 8px",
                textAlign: "center",
                fontSize: 11,
                color: C.muted,
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              点击此处可快速返回顶部↥
            </div>
          )}
        </div>
      </div>

      <DragOverlay
        dragItem={dragItem}
        dragPoint={dragPoint}
        hoverCategory={hoverCategory}
        panelState={dragPanelState}
        onDrop={handleDropCategory}
        onClose={() => { unlockDragScroll(); resetDragOverlay(); }}
        availableCategories={orderedCategoryKeys}
        categoryVisuals={categoryVisuals}
      />

      <ReasonDialog
        item={reasonItem}
        onClose={() => { setReasonItem(null); pendingDropRef.current = null; }}
        onSubmit={(reason) => {
          const pending = pendingDropRef.current;
          if (pending) {
            void actions.markPostAiInteractionCompleted();
            actions.updateCategory(pending.txId, pending.category, reason);
            pendingDropRef.current = null;
          }
          setReasonItem(null);
        }}
      />

      {detailContext && (
        <TransactionDetailPage
          transaction={detailContext.item}
          dayId={detailContext.dayId}
          availableCategories={orderedCategoryKeys}
          categoryVisuals={categoryVisuals}
          onClose={() => setDetailTxId(null)}
          onUpdateCategory={actions.updateCategory}
          onUpdateUserReasoning={actions.updateUserReasoning}
          onSetTransactionVerification={actions.setTransactionVerification}
          onDeleteTransaction={async (id) => {
            await actions.deleteTransaction(id);
            setDetailTxId(null);
          }}
        />
      )}

      <DateRangeDialog
        visible={rangeDialogOpen}
        rangeMode={draftRangeMode}
        customStart={draftRangeSelection.visual.start}
        customEnd={draftRangeSelection.visual.end}
        minDate={rangeBounds.min}
        maxDate={rangeBounds.max}
        onClose={() => setRangeDialogOpen(false)}
        onQuickSelect={(mode) => {
          /**
           * 快捷项只更新弹窗草稿，不立即提交。
           * `draftCustomStart/draftCustomEnd` 保存的是快捷项对应的原始请求范围，
           * 真正显示在轨道上的位置会由 `draftRangeSelection.visual` 统一收口。
           */
          setDraftRangeMode(mode);
          const effective = getRange(mode, draftCustomStart, draftCustomEnd, rangeBounds.min, rangeBounds.max);
          setDraftCustomStart(toDateKey(effective.start));
          setDraftCustomEnd(toDateKey(effective.end));
        }}
        onCustomStartChange={(value) => {
          setDraftRangeMode("自定义");
          setDraftCustomStart(value);
        }}
        onCustomEndChange={(value) => {
          setDraftRangeMode("自定义");
          setDraftCustomEnd(value);
        }}
        onConfirmCustom={() => {
          setRangeMode(draftRangeMode);
          setCustomStart(draftCustomStart);
          setCustomEnd(draftCustomEnd);
          setRangeDialogOpen(false);
        }}
      />
    </div>
  );
}
