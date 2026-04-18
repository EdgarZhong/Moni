import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import type { KeyboardListenerHandle } from '@capacitor/keyboard';

/**
 * 应用根画布高度锁定 Hook。
 *
 * 设计目标：
 * 1. Android 真机弹出软键盘时，不让 `#root` 跟着当前可视视口一起缩短。
 * 2. 旋转屏幕、分屏或真实窗口尺寸变化时，仍然允许画布在“非键盘场景”下更新。
 * 3. 统一把稳定高度写入 CSS 变量，页面层只消费同一个高度口径。
 *
 * 为什么不能继续直接使用 `100dvh`：
 * - 当 WebView 被系统按软键盘策略 resize 时，`100dvh` 会立即变成“键盘后的可视高度”。
 * - 底部导航、悬浮层和整页滚动容器都会因此上移，看起来像“导航栏被顶上来”。
 * - 这里改为维护一个“稳定窗口高度”，键盘显示期间冻结它，键盘收起后再恢复同步。
 */
export function useAppViewportLock(): void {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const root = document.documentElement;
    const visualViewport = window.visualViewport;
    const isNativePlatform = Capacitor.isNativePlatform();
    let isKeyboardVisible = false;
    let lockedHeight = 0;

    /**
     * 读取当前视口高度。
     *
     * 优先使用 visualViewport，是因为它比 `window.innerHeight` 更贴近真实可视区域；
     * 但在部分环境下 visualViewport 不存在，因此仍然保留 innerHeight 兜底。
     */
    const readViewportHeight = (): number => {
      const nextHeight = Math.round(visualViewport?.height ?? window.innerHeight);
      return Math.max(nextHeight, 320);
    };

    /**
     * 把稳定高度同步到 CSS 变量。
     * 所有页面根容器和 `#root` 统一读这个变量，避免不同页面各自维护 viewport 逻辑。
     */
    const applyLockedHeight = (nextHeight: number): void => {
      lockedHeight = nextHeight;
      root.style.setProperty('--app-root-height', `${nextHeight}px`);
    };

    /**
     * 在“非键盘显示”场景下重新采样稳定高度。
     * 主要用于横竖屏切换、窗口真实尺寸变化、系统 UI 收放等情况。
     */
    const syncStableHeight = (): void => {
      if (isKeyboardVisible) {
        return;
      }
      applyLockedHeight(readViewportHeight());
    };

    /**
     * 处理窗口 resize。
     *
     * Android 键盘弹出时往往表现为一次明显的高度骤降。
     * 在原生平台上，如果当前高度比稳定高度突然小很多，就把它识别为“键盘导致的临时缩短”，
     * 直接忽略，不让根画布跟着收缩。
     */
    const handleResize = (): void => {
      const nextHeight = readViewportHeight();
      const shrinkThreshold = 120;
      const isKeyboardDrivenShrink = isNativePlatform && nextHeight < lockedHeight - shrinkThreshold;

      if (isKeyboardVisible || isKeyboardDrivenShrink) {
        return;
      }

      applyLockedHeight(nextHeight);
    };

    /**
     * 键盘显示时冻结当前稳定高度。
     * 这样即便后续 visualViewport 或 innerHeight 被系统改小，根画布也不会抖动。
     */
    const handleKeyboardShow = (): void => {
      isKeyboardVisible = true;
      root.style.setProperty('--app-keyboard-visible', '1');
    };

    /**
     * 键盘收起后恢复一次稳定高度采样。
     * 这里延后一帧再取值，避免系统动画尚未结束时拿到过渡态高度。
     */
    const handleKeyboardHide = (): void => {
      isKeyboardVisible = false;
      root.style.setProperty('--app-keyboard-visible', '0');
      window.setTimeout(() => {
        syncStableHeight();
      }, 120);
    };

    applyLockedHeight(readViewportHeight());
    root.style.setProperty('--app-keyboard-visible', '0');

    window.addEventListener('resize', handleResize, { passive: true });
    visualViewport?.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', syncStableHeight);

    let listeners: KeyboardListenerHandle[] = [];

    if (isNativePlatform) {
      void Promise.all([
        Keyboard.addListener('keyboardWillShow', handleKeyboardShow),
        Keyboard.addListener('keyboardDidShow', handleKeyboardShow),
        Keyboard.addListener('keyboardWillHide', handleKeyboardHide),
        Keyboard.addListener('keyboardDidHide', handleKeyboardHide),
      ]).then((handles) => {
        listeners = handles;
      });
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      visualViewport?.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', syncStableHeight);
      listeners.forEach((listener) => {
        void listener.remove();
      });
    };
  }, []);
}
