/**
 * 首页日期范围 UI 会话态管理。
 *
 * 设计目标：
 * 1. 继续保留“按账本缓存首页范围 UI 态”的现有语义；
 * 2. 允许 Root 层或其它 UI 入口在不直接持有 MoniHome 组件 state 的情况下，
 *    向当前首页发送一次“外部范围覆盖”事件；
 * 3. 只承载表现层会话态，不下沉到 logic/service 层，避免职责混写。
 */

export type HomeRangeUiSessionState = {
  rangeMode: string;
  customStart: string;
  customEnd: string;
  draftRangeMode: string;
  draftCustomStart: string;
  draftCustomEnd: string;
};

export type HomeRangeUiOverride = {
  ledgerId: string;
  state: HomeRangeUiSessionState;
};

const homeRangeUiSessionStateByLedger = new Map<string, HomeRangeUiSessionState>();
const homeRangeUiOverrideListeners = new Set<(payload: HomeRangeUiOverride) => void>();

/**
 * 将 Date 统一转回 YYYY-MM-DD 本地日期键。
 * 这里显式使用本地时区字段，避免 UTC 解析导致的自然日偏移。
 */
export function toLocalDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 读取某个账本当前缓存的首页范围 UI 状态。
 * 若无缓存，则返回“本月 + today 占位”的默认值。
 */
export function restoreHomeRangeUiSessionState(ledgerId: string): HomeRangeUiSessionState {
  const cached = homeRangeUiSessionStateByLedger.get(ledgerId);
  if (cached) {
    return cached;
  }

  const today = toLocalDateKey(new Date());
  return {
    rangeMode: '本月',
    customStart: today,
    customEnd: today,
    draftRangeMode: '本月',
    draftCustomStart: today,
    draftCustomEnd: today,
  };
}

/**
 * 保存某个账本当前首页范围 UI 状态。
 * 这里既供 MoniHome 本地提交时使用，也供外部覆盖事件先落缓存再广播。
 */
export function saveHomeRangeUiSessionState(ledgerId: string, state: HomeRangeUiSessionState): void {
  homeRangeUiSessionStateByLedger.set(ledgerId, state);
}

/**
 * 订阅一次“外部范围覆盖”事件。
 * 典型场景是零记忆弹窗选择“只分类 7 天”后，Root 层需要让当前首页 UI 立即切到自定义 7 天。
 */
export function subscribeHomeRangeUiOverride(
  listener: (payload: HomeRangeUiOverride) => void
): () => void {
  homeRangeUiOverrideListeners.add(listener);
  return () => {
    homeRangeUiOverrideListeners.delete(listener);
  };
}

/**
 * 发布一次“外部范围覆盖”事件。
 * 会先把状态落到会话缓存，再通知已挂载的 MoniHome 立即同步本地 state。
 */
export function publishHomeRangeUiOverride(ledgerId: string, state: HomeRangeUiSessionState): void {
  saveHomeRangeUiSessionState(ledgerId, state);
  for (const listener of homeRangeUiOverrideListeners) {
    listener({ ledgerId, state });
  }
}
