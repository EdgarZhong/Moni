import { useState, useCallback } from 'react';

export type ZeroMemoryWarningChoice = 'classify7days' | 'consumeAll' | 'cancel';

interface ZeroMemoryWarningState {
  isOpen: boolean;
  daysCount: number;
  startDate: Date | null;
  endDate: Date | null;
}

/**
 * 管理零记忆消费风险提示弹窗的状态与交互
 *
 * 用法：
 * 1. 逻辑层通过 callback 传入日期参数，调用 showDialog
 * 2. 用户选择后，通过 Promise resolve 返回选择结果
 */
export function useZeroMemoryWarningDialog() {
  const [state, setState] = useState<ZeroMemoryWarningState>({
    isOpen: false,
    daysCount: 0,
    startDate: null,
    endDate: null,
  });

  const [resolveChoice, setResolveChoice] = useState<
    ((choice: ZeroMemoryWarningChoice) => void) | null
  >(null);

  // 显示弹窗，返回 Promise 等待用户选择
  const showDialog = useCallback(
    (latestDate: Date, daysCount: number): Promise<ZeroMemoryWarningChoice> => {
      return new Promise((resolve) => {
        // 计算 7 天窗口
        const startDate = new Date(latestDate);
        startDate.setDate(startDate.getDate() - 6); // 往前倒 7 天

        setState({
          isOpen: true,
          daysCount,
          startDate,
          endDate: latestDate,
        });

        // 保存 resolve 函数，供按钮回调使用
        setResolveChoice(() => resolve);
      });
    },
    []
  );

  // 用户点击"先处理最近 7 天"
  const handleClassify7Days = useCallback(() => {
    if (resolveChoice) {
      resolveChoice('classify7days');
    }
    setState((prev) => ({ ...prev, isOpen: false }));
    setResolveChoice(null);
  }, [resolveChoice]);

  // 用户点击"全部处理"
  const handleConsumeAll = useCallback(() => {
    if (resolveChoice) {
      resolveChoice('consumeAll');
    }
    setState((prev) => ({ ...prev, isOpen: false }));
    setResolveChoice(null);
  }, [resolveChoice]);

  // 用户点击外侧或 Escape 关闭
  const handleClose = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
    /**
     * 关闭弹窗必须显式 resolve 为 cancel。
     * 否则 startAiProcessing 会一直 await 这个 Promise，导致本次“开启 AI”流程悬空卡死。
     */
    if (resolveChoice) {
      resolveChoice('cancel');
    }
    setResolveChoice(null);
  }, [resolveChoice]);

  return {
    isOpen: state.isOpen,
    daysCount: state.daysCount,
    startDate: state.startDate,
    endDate: state.endDate,
    showDialog,
    handleClassify7Days,
    handleConsumeAll,
    handleClose,
  };
}
