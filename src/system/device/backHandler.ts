/**
 * backHandler — 全局返回键 handler 栈
 *
 * 所有二级页面（详情页、覆盖层、密码页等）在挂载时 push 自己的关闭函数，
 * 卸载时 pop；AppRoot 监听 Capacitor backButton 事件，触发时调用栈顶 handler。
 * 若栈为空则表示当前在一级页面，由 AppRoot 自行处理退出逻辑。
 */

/** 当前激活的 handler 列表，尾部为最高优先级 */
const _handlers: (() => void)[] = [];

/** 注册一个返回键 handler（push 到栈顶） */
export function pushBackHandler(fn: () => void): void {
  _handlers.push(fn);
}

/** 注销一个返回键 handler（从栈中移除最后一次出现的该函数） */
export function popBackHandler(fn: () => void): void {
  const idx = _handlers.lastIndexOf(fn);
  if (idx !== -1) {
    _handlers.splice(idx, 1);
  }
}

/**
 * 调用栈顶 handler。
 * @returns true 表示有 handler 处理了此次返回，false 表示栈为空（由调用方处理一级页面逻辑）
 */
export function invokeTopBackHandler(): boolean {
  if (_handlers.length === 0) return false;
  _handlers[_handlers.length - 1]();
  return true;
}
