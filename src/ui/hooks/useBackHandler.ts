/**
 * useBackHandler — React hook 版返回键 handler 注册
 *
 * 组件挂载时注册 handler，卸载时自动注销。
 * `active` 为 false 时不注册（用于条件性启用，例如仅当弹窗打开时）。
 *
 * 用法示例：
 *   useBackHandler(() => closeDetail(), detailOpen);
 */

import { useEffect, useRef } from 'react';
import { pushBackHandler, popBackHandler } from '@system/device/backHandler';

export function useBackHandler(handler: () => void, active = true): void {
  // 用 ref 保存最新 handler，避免 effect 因函数引用变化频繁重新注册
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!active) return;

    // 包一层稳定引用，内部调用 ref.current 获取最新函数
    const stable = () => handlerRef.current();

    pushBackHandler(stable);
    return () => popBackHandler(stable);
  }, [active]);
}
