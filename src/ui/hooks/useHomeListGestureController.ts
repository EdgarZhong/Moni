/**
 * 首页交易列表手势状态机
 *
 * 负责：
 * - 交易条目 pointerdown / move / up / cancel
 * - 手势状态流转（idle → pressing → scrolling / dragging → inertia）
 * - 跟手滚动（直接写 scrollTop，不使用 scrollTo）
 * - 释放速度计算（最近 100ms 样本窗口）
 * - 惯性滚动（rAF + velocity * dt + exponential decay）
 *
 * 不负责：
 * - 交易详情页展示、分类业务变更、DragOverlay DOM 渲染
 */

import { useCallback, useEffect, useRef } from "react";

// ─── 类型定义 ───────────────────────────────────────────────

type GestureMode = "idle" | "pressing" | "scrolling" | "dragging" | "inertia";

type MoveSample = {
  t: number;
  y: number;
};

type GestureState<TItem> = {
  mode: GestureMode;
  pointerId: number | null;
  item: TItem | null;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startTime: number;
  startScrollTop: number;
  samples: MoveSample[];
  longPressTimer: number | null;
  rafId: number | null;
};

export type HomeListGestureControllerOptions<TItem> = {
  scrollRef: React.RefObject<HTMLElement | null>;

  longPressMs?: number;
  moveThreshold?: number;
  axisLockRatio?: number;

  onTapItem: (item: TItem) => void;

  onDragStart: (payload: { item: TItem; x: number; y: number }) => void;
  onDragMove: (payload: { item: TItem; x: number; y: number }) => void;
  onDragEnd: (payload: { item: TItem; x: number; y: number }) => void;
  onDragCancel: (payload: { item: TItem }) => void;

  lockHomeScroll: () => void;
  unlockHomeScroll: () => void;

  /** 滚动回调，用于 rAF 节流后的轻量同步逻辑（如 handleScroll） */
  onScroll?: () => void;
};

export type HomeListGestureController<TItem> = {
  onItemPointerDown: (item: TItem, event: React.PointerEvent<HTMLElement>) => void;
  onItemPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
  onItemPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
  onItemPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
  stopInertia: () => void;
  resetGesture: () => void;
};

// ─── 参数常量 ───────────────────────────────────────────────

const DEFAULT_LONG_PRESS_MS = 420;
const DEFAULT_MOVE_THRESHOLD = 8;
const DEFAULT_AXIS_LOCK_RATIO = 1.15;

const VELOCITY_WINDOW_MS = 100;
const INERTIA_TAU = 325; // ms，惯性衰减时间常数
const MIN_VELOCITY = 0.025; // px/ms，惯性停止阈值
const MAX_VELOCITY = 3.0; // px/ms，防止异常样本
const MAX_DT = 32; // ms，防止主线程卡顿后跳帧

// ─── 工具函数 ───────────────────────────────────────────────

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getMaxScrollTop(scroller: HTMLElement) {
  return Math.max(0, scroller.scrollHeight - scroller.clientHeight);
}

function clampScrollTop(scroller: HTMLElement, value: number) {
  return clamp(value, 0, getMaxScrollTop(scroller));
}

/**
 * 计算释放速度：使用最近 VELOCITY_WINDOW_MS 内的样本
 * 单位：px/ms（正 = 手指向下，负 = 手指向上）
 * 返回 scroll 方向速度（取负号：手指向下 → scrollTop 减小）
 */
function computeReleaseVelocity(samples: MoveSample[]) {
  if (samples.length < 2) return 0;

  const first = samples[0];
  const last = samples[samples.length - 1];

  const dt = last.t - first.t;
  if (dt <= 0) return 0;

  const fingerVelocity = (last.y - first.y) / dt;
  const scrollVelocity = -fingerVelocity;

  return clamp(scrollVelocity, -MAX_VELOCITY, MAX_VELOCITY);
}

// ─── Hook 主体 ───────────────────────────────────────────────

export function useHomeListGestureController<TItem>(
  options: HomeListGestureControllerOptions<TItem>
): HomeListGestureController<TItem> {
  const {
    scrollRef,
    onTapItem,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel,
    lockHomeScroll,
    unlockHomeScroll,
    onScroll,
  } = options;

  const longPressMs = options.longPressMs ?? DEFAULT_LONG_PRESS_MS;
  const moveThreshold = options.moveThreshold ?? DEFAULT_MOVE_THRESHOLD;
  const axisLockRatio = options.axisLockRatio ?? DEFAULT_AXIS_LOCK_RATIO;

  /**
   * rAF 节流用的 ticking 标志
   * 手势控制器内部的 onScroll 回调（如 handleScroll）需要 rAF 节流
   */
  const scrollTickingRef = useRef(false);

  const stateRef = useRef<GestureState<TItem>>({
    mode: "idle",
    pointerId: null,
    item: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    startTime: 0,
    startScrollTop: 0,
    samples: [],
    longPressTimer: null,
    rafId: null,
  });

  // ─── 清理函数 ───────────────────────────────────────────

  const clearLongPressTimer = useCallback(() => {
    const state = stateRef.current;
    if (state.longPressTimer != null) {
      window.clearTimeout(state.longPressTimer);
      state.longPressTimer = null;
    }
  }, []);

  const stopInertia = useCallback(() => {
    const state = stateRef.current;
    if (state.rafId != null) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    if (state.mode === "inertia") {
      state.mode = "idle";
    }
  }, []);

  const resetGesture = useCallback(() => {
    clearLongPressTimer();
    stopInertia();

    const state = stateRef.current;
    state.mode = "idle";
    state.pointerId = null;
    state.item = null;
    state.samples = [];
    state.rafId = null;
  }, [clearLongPressTimer, stopInertia]);

  // unmount 时强制清理
  useEffect(() => {
    return () => {
      resetGesture();
      unlockHomeScroll();
    };
  }, [resetGesture, unlockHomeScroll]);

  // ─── 惯性滚动 ───────────────────────────────────────────

  const startInertia = useCallback(
    (initialVelocity: number) => {
      const scroller = scrollRef.current;
      if (!scroller) return;

      const state = stateRef.current;
      let velocity = clamp(initialVelocity, -MAX_VELOCITY, MAX_VELOCITY);
      let lastTime = performance.now();

      state.mode = "inertia";

      const frame = (now: number) => {
        const current = stateRef.current;
        const s = scrollRef.current;

        if (!s) return;
        if (current.mode !== "inertia") return;

        const rawDt = now - lastTime;
        const dt = Math.min(rawDt, MAX_DT); // 防止长帧跳跳
        lastTime = now;

        const next = s.scrollTop + velocity * dt;
        const clamped = clampScrollTop(s, next);
        s.scrollTop = clamped;

        // 撞到边界 → 停止
        const hitBoundary = clamped !== next;
        if (hitBoundary) {
          current.mode = "idle";
          current.rafId = null;
          return;
        }

        // exponential decay
        velocity *= Math.exp(-dt / INERTIA_TAU);

        if (Math.abs(velocity) < MIN_VELOCITY) {
          current.mode = "idle";
          current.rafId = null;
          return;
        }

        current.rafId = requestAnimationFrame(frame);
      };

      state.rafId = requestAnimationFrame(frame);
    },
    [scrollRef]
  );

  // ─── pointerdown ────────────────────────────────────────

  const onItemPointerDown = useCallback(
    (item: TItem, event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;

      const scroller = scrollRef.current;
      if (!scroller) return;

      // 打断正在进行的惯性滚动
      stopInertia();
      clearLongPressTimer();

      const now = performance.now();
      const state = stateRef.current;

      state.mode = "pressing";
      state.pointerId = event.pointerId;
      state.item = item;

      state.startX = event.clientX;
      state.startY = event.clientY;
      state.lastX = event.clientX;
      state.lastY = event.clientY;

      state.startTime = now;
      state.startScrollTop = scroller.scrollTop;
      state.samples = [{ t: now, y: event.clientY }];

      // 启动长按计时器
      state.longPressTimer = window.setTimeout(() => {
        const current = stateRef.current;
        if (current.mode !== "pressing") return;
        if (!current.item) return;

        const distance = Math.hypot(
          current.lastX - current.startX,
          current.lastY - current.startY
        );

        if (distance >= moveThreshold) {
          // 已经移动过，取消长按
          current.mode = "idle";
          return;
        }

        // 长按成立 → 进入拖拽
        current.mode = "dragging";
        current.longPressTimer = null;

        lockHomeScroll();

        onDragStart({
          item: current.item,
          x: current.lastX,
          y: current.lastY,
        });
      }, longPressMs);

      // 设置 pointer capture，确保事件不丢失
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [
      scrollRef,
      longPressMs,
      moveThreshold,
      stopInertia,
      clearLongPressTimer,
      lockHomeScroll,
      onDragStart,
    ]
  );

  // ─── pointermove ────────────────────────────────────────

  const onItemPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const state = stateRef.current;
      const scroller = scrollRef.current;

      if (!scroller) return;
      if (state.mode === "idle" || state.mode === "inertia") return;
      if (state.pointerId !== event.pointerId) return;

      state.lastX = event.clientX;
      state.lastY = event.clientY;

      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      // ── pressing 状态：做手势决策 ──
      if (state.mode === "pressing") {
        const isVerticalMove =
          absY >= moveThreshold && absY > absX * axisLockRatio;

        const isHorizontalMove =
          absX >= moveThreshold && absX > absY * axisLockRatio;

        if (isVerticalMove) {
          // 明确垂直移动 → 进入滚动
          clearLongPressTimer();
          state.mode = "scrolling";
        } else if (isHorizontalMove) {
          // 明确水平移动 → 取消
          clearLongPressTimer();
          state.mode = "idle";
          return;
        } else {
          // 还没达到阈值，继续观察
          return;
        }
      }

      // ── scrolling 状态：跟手滚动 ──
      if (state.mode === "scrolling") {
        const now = performance.now();

        // 记录速度样本
        state.samples.push({ t: now, y: event.clientY });

        // 只保留最近 VELOCITY_WINDOW_MS 的样本
        while (
          state.samples.length > 2 &&
          now - state.samples[0].t > VELOCITY_WINDOW_MS
        ) {
          state.samples.shift();
        }

        // 跟手滚动公式：startScrollTop - deltaY（位置无关）
        const nextScrollTop = state.startScrollTop - dy;
        scroller.scrollTop = clampScrollTop(scroller, nextScrollTop);

        // rAF 节流 onScroll 回调
        if (onScroll && !scrollTickingRef.current) {
          scrollTickingRef.current = true;
          requestAnimationFrame(() => {
            scrollTickingRef.current = false;
            onScroll();
          });
        }

        return;
      }

      // ── dragging 状态：拖拽移动 ──
      if (state.mode === "dragging" && state.item) {
        onDragMove({
          item: state.item,
          x: event.clientX,
          y: event.clientY,
        });
      }
    },
    [scrollRef, moveThreshold, axisLockRatio, clearLongPressTimer, onDragMove, onScroll]
  );

  // ─── pointerup ──────────────────────────────────────────

  const onItemPointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const state = stateRef.current;

      if (state.pointerId !== event.pointerId) return;

      clearLongPressTimer();

      // ── pressing → 判断 tap 或 cancel ──
      if (state.mode === "pressing") {
        const item = state.item;
        const distance = Math.hypot(
          event.clientX - state.startX,
          event.clientY - state.startY
        );

        resetGesture();

        if (item && distance < moveThreshold) {
          onTapItem(item);
        }
        return;
      }

      // ── scrolling → 判断是否启动惯性 ──
      if (state.mode === "scrolling") {
        const velocity = computeReleaseVelocity(state.samples);

        state.mode = "idle";
        state.pointerId = null;
        state.item = null;
        state.samples = [];

        if (Math.abs(velocity) >= MIN_VELOCITY) {
          startInertia(velocity);
        }
        return;
      }

      // ── dragging → 结束拖拽 ──
      if (state.mode === "dragging" && state.item) {
        const item = state.item;

        onDragEnd({
          item,
          x: event.clientX,
          y: event.clientY,
        });

        unlockHomeScroll();
        resetGesture();
        return;
      }

      resetGesture();
    },
    [
      clearLongPressTimer,
      resetGesture,
      moveThreshold,
      onTapItem,
      onDragEnd,
      unlockHomeScroll,
      startInertia,
    ]
  );

  // ─── pointercancel ──────────────────────────────────────

  const onItemPointerCancel = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const state = stateRef.current;

      if (state.pointerId !== event.pointerId) return;

      if (state.mode === "dragging" && state.item) {
        onDragCancel({ item: state.item });
        unlockHomeScroll();
      }

      resetGesture();
    },
    [onDragCancel, unlockHomeScroll, resetGesture]
  );

  return {
    onItemPointerDown,
    onItemPointerMove,
    onItemPointerUp,
    onItemPointerCancel,
    stopInertia,
    resetGesture,
  };
}
