import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/**
 * 主动触发 WebView 重绘。
 *
 * Android WebView 在冷启动和 resume 时有概率出现"首帧未提交"问题，
 * 即使 React 已完成 render，GPU 层仍可能停留在黑屏状态。
 * 通过短暂写入 transform 再清除的方式，强制 GPU 合成层重新提交一帧。
 */
function forceRootRepaint(source: string): void {
  const root = document.getElementById('root');
  if (!root) return;
  try {
    console.info('[MONI_STARTUP] repaint triggered', source, Date.now());
    // 触发 resize 让部分监听器重新计算布局
    window.dispatchEvent(new Event('resize'));
    // 强制 GPU 层重新合成
    root.style.transform = 'translateZ(0)';
    void root.offsetHeight;
    root.style.transform = '';
  } catch {
    // 静默忽略，不影响主流程
  }
}

/**
 * 安装冷启动与 resume repaint 兜底机制。
 *
 * - 初次加载：double RAF + 延迟两次，覆盖不同设备的首帧时序
 * - visibilitychange / window focus：锁屏解锁、多任务切回时重绘
 * - Capacitor appStateChange：Android 原生 resume 时重绘
 */
export function installStartupRepaintWorkarounds(): void {
  // 冷启动：两次 RAF 覆盖首帧提交时序差异
  requestAnimationFrame(() => {
    forceRootRepaint('raf-1');
    requestAnimationFrame(() => {
      forceRootRepaint('raf-2');
    });
  });

  // 额外延迟兜底，应对初始化较慢的设备
  window.setTimeout(() => forceRootRepaint('timeout-500ms'), 500);
  window.setTimeout(() => forceRootRepaint('timeout-1500ms'), 1500);

  // 锁屏解锁或标签页切回
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      requestAnimationFrame(() => forceRootRepaint('visibility-visible'));
    }
  });

  // 窗口获焦（部分 Android 设备多任务切回触发）
  window.addEventListener('focus', () => {
    requestAnimationFrame(() => forceRootRepaint('window-focus'));
  });

  // Capacitor 原生 App resume（后台切回前台）
  if (Capacitor.isNativePlatform()) {
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      requestAnimationFrame(() => forceRootRepaint('native-app-resume'));
    });
  }
}
