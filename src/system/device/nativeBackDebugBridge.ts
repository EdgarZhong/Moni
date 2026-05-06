/**
 * nativeBackDebugBridge — Root 层 native back 调试桥
 *
 * 浏览器开发态没有 Android 系统返回事件，也没有 Capacitor 原生链路；
 * 但我们仍然需要让 Playwright / MCP 直接命中 AppRoot 的同一套返回分派逻辑，
 * 验证“二级层优先消费、根页首次提示、二次退出分支”是否符合规格。
 *
 * 这个桥只负责转发，不持有业务状态：
 * - AppRoot 挂载时注入 trigger / snapshot / reset
 * - 调试入口从这里取当前可用的 Root back 控制器
 */

export interface NativeBackDebugTriggerInput {
  canGoBack?: boolean;
  source?: string;
}

export interface NativeBackDebugSnapshot {
  available: boolean;
  stackDepth: number;
  exitToastVisible: boolean;
  exitRequestCount: number;
  lastTriggerSource: string | null;
  lastCanGoBack: boolean | null;
  lastTriggeredAt: number | null;
  lastRootBackAt: number | null;
}

interface NativeBackDebugBridgeRuntime {
  trigger: (input?: NativeBackDebugTriggerInput) => Promise<NativeBackDebugSnapshot> | NativeBackDebugSnapshot;
  getSnapshot: () => NativeBackDebugSnapshot;
  reset: () => NativeBackDebugSnapshot;
}

let runtime: NativeBackDebugBridgeRuntime | null = null;

/**
 * 由 AppRoot 安装当前可用的 Root back 调试实现。
 * 返回清理函数，确保热更新或卸载时不会残留旧引用。
 */
export function installNativeBackDebugBridge(
  nextRuntime: NativeBackDebugBridgeRuntime
): () => void {
  runtime = nextRuntime;

  return () => {
    if (runtime === nextRuntime) {
      runtime = null;
    }
  };
}

function assertRuntime(): NativeBackDebugBridgeRuntime {
  if (!runtime) {
    throw new Error('Native back debug bridge is not installed');
  }
  return runtime;
}

/** 触发一次“native back 已进入 JS”调试事件。 */
export async function triggerNativeBackDebug(
  input?: NativeBackDebugTriggerInput
): Promise<NativeBackDebugSnapshot> {
  return await assertRuntime().trigger(input);
}

/** 读取当前 Root back 调试快照。 */
export function getNativeBackDebugSnapshot(): NativeBackDebugSnapshot {
  return assertRuntime().getSnapshot();
}

/** 重置 Root back 调试状态（toast、双击时间窗、exit 计数）。 */
export function resetNativeBackDebugState(): NativeBackDebugSnapshot {
  return assertRuntime().reset();
}
