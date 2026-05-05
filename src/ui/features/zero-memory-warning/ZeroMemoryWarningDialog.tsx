import React, { useEffect, useRef } from 'react';

interface ZeroMemoryWarningDialogProps {
  isOpen: boolean;
  daysCount: number;
  startDate: Date;
  endDate: Date;
  onClassify7Days: () => void;
  onConsumeAll: () => void;
  onClose: () => void;
}

/**
 * 零记忆消费风险提示对话框
 *
 * 当用户无激活记忆且待分类日期 > 7 天时显示
 * 提供两个选项：只分类 7 天 / 确认全范围消费
 */
export function ZeroMemoryWarningDialog({
  isOpen,
  daysCount,
  startDate,
  endDate,
  onClassify7Days,
  onConsumeAll,
  onClose,
}: ZeroMemoryWarningDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 格式化日期为本地化字符串 (如 "5 月 14 日")
  const formatDate = (date: Date): string => {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month} 月 ${day} 日`;
  };

  const startDateStr = formatDate(startDate);
  const endDateStr = formatDate(endDate);

  /**
   * 播放关闭动画，并在动画结束后执行指定回调。
   * 这样可以确保“按钮确认”和“遮罩取消”分别走各自的业务分支，
   * 避免先 resolve 业务选择、稍后又补发一次 cancel。
   */
  const closeDialog = (afterClose: () => void) => {
    if (closeTimerRef.current != null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    // 淡出动画后再执行关闭
    if (dialogRef.current) {
      dialogRef.current.style.opacity = '0';
      dialogRef.current.style.transform = 'translateY(10px)';
    }
    if (backdropRef.current) {
      backdropRef.current.style.opacity = '0';
    }
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      afterClose();
    }, 200);
  };

  // 处理按钮点击
  const handleClassify7Days = () => {
    closeDialog(onClassify7Days);
  };

  const handleConsumeAll = () => {
    closeDialog(onConsumeAll);
  };

  // 点击背景关闭
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      closeDialog(onClose);
    }
  };

  // 处理 Escape 键
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDialog(onClose);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  return (
    <>
      {/* 栅栏背景 */}
      <div
        ref={backdropRef}
        onClick={handleBackdropClick}
        className="fixed inset-0 bg-black/30 z-[1000] transition-opacity duration-200 opacity-100"
        style={{
          animation: 'fadeIn 0.3s ease-out forwards',
        }}
      />

      {/* 对话框 */}
      <div className="fixed inset-0 z-[1010] flex items-center justify-center px-4 pointer-events-none">
        <div
          ref={dialogRef}
          className="pointer-events-auto w-full max-w-xs bg-white border border-muted rounded-card-sm z-[1010] transition-all duration-200 opacity-100"
          style={{
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.15)',
            animation: 'dialogFadeIn 0.3s ease-out forwards',
          }}
        >
          {/* 内容容器 */}
          <div className="p-6 space-y-4">
            {/* 标题 */}
            <h2 className="font-brand font-bold text-lg text-ink">
              未检测到消费记忆
            </h2>

            {/* 副标题（可选，可根据空间决定显示） */}
            <p className="text-sm text-dim leading-relaxed">
              当前 AI 没有学习记录，直接启动消费可能导致分类结果不准确，且消耗大量 token。
            </p>

            {/* 消息体 */}
            <p className="text-sm text-ink">
              你有 <span className="font-semibold">{daysCount}</span> 天的交易待分类。建议先从最近的 7 天开始：
            </p>

            {/* 建议内容 */}
            <div
              className="text-sm text-ink space-y-2 bg-warn-surface rounded-card-xs p-3"
              style={{ border: '1.5px solid var(--color-warn-border, #f1d3a8)' }}
            >
              <p>从 <span className="whitespace-nowrap font-semibold">{endDateStr}</span> 往前 7 天（<span className="whitespace-nowrap">{startDateStr}</span> ~ <span className="whitespace-nowrap">{endDateStr}</span>）</p>
              <p className="text-xs text-dim">根据 AI 的分类结果手动修正几笔，它会逐步学习你的习惯。然后再开启全范围分类。</p>
            </div>

            {/* 按钮区 */}
            <div className="flex flex-col gap-3 pt-2">
              {/* 先处理最近 7 天按钮（薄荷按钮，推荐） */}
              <button
                onClick={handleClassify7Days}
                className="w-full px-4 py-3 font-brand font-bold text-white bg-mint border border-mint rounded-card-sm active:scale-98 transition-transform duration-75"
                type="button"
              >
                先处理最近 7 天
              </button>

              {/* 全部处理按钮（次级按钮） */}
              <button
                onClick={handleConsumeAll}
                className="w-full px-4 py-3 font-brand font-bold text-ink bg-white border-secondary border-muted rounded-card-sm active:scale-98 transition-transform duration-75"
                type="button"
              >
                全部处理
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 动画关键帧 */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes dialogFadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        button.active\\:scale-98:active {
          transform: scale(0.98);
        }
      `}</style>
    </>
  );
}
