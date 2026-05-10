import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';

let hideRequested = false;
let hideCompleted = false;

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

async function hideSplash(source: string): Promise<void> {
  if (!isNative()) return;
  if (hideCompleted) return;

  hideCompleted = true;
  try {
    console.info('[MONI_STARTUP] splash hide', source, Date.now());
    await SplashScreen.hide({ fadeOutDuration: 200 });
    console.info('[MONI_STARTUP] splash hide done', source);
  } catch (error) {
    console.warn('[MONI_STARTUP] splash hide failed', source, error);
  }
}

/**
 * 在 React 首帧提交后隐藏 Splash。
 *
 * 策略：
 * 1. double RAF —— 等待浏览器完成两次渲染循环，确保首帧已真正提交到 GPU
 * 2. 1200ms 兜底 —— 应对部分设备 RAF 回调但 GPU 尚未上屏的情况
 * 3. 2500ms 强制兜底 —— 防止任何意外导致 Splash 永久停留
 *
 * 调用时机：React 根组件 mount 后的 useEffect 中（首帧已发生）。
 */
export function scheduleSplashHideAfterFirstPaint(source: string): void {
  if (!isNative()) return;
  if (hideRequested) return;

  hideRequested = true;
  console.info('[MONI_STARTUP] splash hide scheduled', source, Date.now());

  // 主路径：double RAF，首帧提交后立即 hide
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void hideSplash(`${source}:double-raf`);
    });
  });

  // 兜底 1：设备渲染较慢时的安全网
  window.setTimeout(() => {
    void hideSplash(`${source}:timeout-1200ms`);
  }, 1200);

  // 兜底 2：极端情况防止永久卡在 Splash
  window.setTimeout(() => {
    void hideSplash(`${source}:timeout-2500ms`);
  }, 2500);
}

/** 强制立即 hide，用于错误恢复路径。 */
export function forceHideSplash(source: string): void {
  void hideSplash(source);
}
