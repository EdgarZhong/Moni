import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import clsx from 'clsx';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number, isDragging?: boolean) => void;
  isMobile?: boolean;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  isMobile = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  // 使用 ref 追踪 isDragging 状态，避免 useEffect 依赖变化导致的回滚
  const isDraggingRef = useRef(isDragging);
  const [dragPage, setDragPage] = useState(currentPage);
  const trackRef = useRef<HTMLDivElement>(null);
  const animationTimeoutRef = useRef<number | null>(null);

  // 统一的视觉激活状态：拖拽中 或 动画进行中
  const isVisualActive = isDragging || isAnimating;

  // 辅助函数：触发移动动画状态
  const triggerAnimation = () => {
    setIsAnimating(true);
    if (animationTimeoutRef.current) {
      window.clearTimeout(animationTimeoutRef.current);
    }
    // 300ms 对应 CSS transition duration
    animationTimeoutRef.current = window.setTimeout(() => {
      setIsAnimating(false);
    }, 300);
  };

  // 清理 timeout
  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) {
        window.clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  // 同步 isDragging 到 ref
  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  // 仅当 currentPage 变化时同步到 dragPage
  // 这样在松手后（isDragging 变 false 但 currentPage 还没变时），不会强制回滚
  // 使用 useLayoutEffect 在绘制前同步状态
  useLayoutEffect(() => {
    if (!isDraggingRef.current) {
      setDragPage(currentPage);
    }
  }, [currentPage]);

  // 确保拖拽结束时重置 dragPage (已移除，避免震动)

  // 动态计算尺寸参数
  const THUMB_WIDTH = isMobile ? 80 : 120;
  const HALF_THUMB = THUMB_WIDTH / 2;
  const ANCHOR_WIDTH = 8;
  const MIN_CENTER = ANCHOR_WIDTH + HALF_THUMB;
  const TOTAL_PADDING = MIN_CENTER * 2;

  // 计算滑块位置百分比 (0-100)
  // page 1 -> 0%, page total -> 100%
  const getProgress = (page: number) => {
    if (totalPages <= 1) return 0;
    return ((page - 1) / (totalPages - 1)) * 100;
  };

  // 统一使用 dragPage 作为显示源，实现乐观 UI 更新
  const displayPage = dragPage;
  const currentProgress = getProgress(displayPage);
  
  const thumbLeftStyle = `calc(${MIN_CENTER}px + (100% - ${TOTAL_PADDING}px) * ${currentProgress / 100})`;

  const progressRatio = currentProgress / 100;
  
  // 动画配置：拖拽时禁用，非拖拽时（点击翻页）启用缓动
  const transitionStyle = isDragging ? 'none' : 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)';

  // 处理拖拽
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  // 处理触摸拖拽 (移动设备优化)
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  // 使用 useEffect 实现全局 pointer 和 touch 事件监听，防止鼠标移出元素时事件丢失
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging || !trackRef.current) return;
      
      const rect = trackRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      
      let ratio = (x - MIN_CENTER) / (width - TOTAL_PADDING);
      ratio = Math.max(0, Math.min(1, ratio));
      
      const newPage = Math.round(ratio * (totalPages - 1)) + 1;
      if (newPage !== dragPage) {
        setDragPage(newPage);
        onPageChange(newPage, true);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging || !trackRef.current || e.touches.length === 0) return;
      
      const touch = e.touches[0];
      const rect = trackRef.current.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const width = rect.width;
      
      let ratio = (x - MIN_CENTER) / (width - TOTAL_PADDING);
      ratio = Math.max(0, Math.min(1, ratio));
      
      const newPage = Math.round(ratio * (totalPages - 1)) + 1;
      if (newPage !== dragPage) {
        setDragPage(newPage);
        onPageChange(newPage, true);
      }
    };

    const handlePointerUp = () => {
      if (isDragging) {
        setIsDragging(false);
        if (dragPage !== currentPage) {
          onPageChange(dragPage);
        }
      }
    };

    const handleTouchEnd = () => {
      if (isDragging) {
        setIsDragging(false);
        if (dragPage !== currentPage) {
          onPageChange(dragPage);
        }
      }
    };

    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd, { passive: false });
    }

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, dragPage, totalPages, currentPage, onPageChange, MIN_CENTER, TOTAL_PADDING]);

  const handleTrackClick = (e: React.MouseEvent) => {
    if (isDragging || !trackRef.current) return;
    
    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    
    let ratio = (x - MIN_CENTER) / (width - TOTAL_PADDING);
    ratio = Math.max(0, Math.min(1, ratio));
    
    const newPage = Math.round(ratio * (totalPages - 1)) + 1;
    if (newPage !== dragPage) {
      setDragPage(newPage);
      onPageChange(newPage);
      triggerAnimation();
    }
  };

  return (
    <div className="relative w-full h-12 flex items-center justify-center mt-2 mb-8 select-none group/container">
      {/* 
        Fiber Track (光纤轨道) 
      */}
      <div 
        ref={trackRef}
        className="absolute inset-0 flex items-center cursor-pointer"
        onClick={handleTrackClick}
      >
        {/* Left Segment */}
        <div 
          className="h-[2px] bg-emerald-500/30 group-hover/container:bg-emerald-500/60 group-hover/container:shadow-[0_0_8px_rgba(16,185,129,0.5)]"
          style={{ 
            width: `calc(${ANCHOR_WIDTH}px + (100% - ${TOTAL_PADDING}px) * ${progressRatio})`, 
            position: 'absolute',
            left: 0,
            transition: transitionStyle
          }}
        />
        {/* Left Anchor */}
        <div className="absolute left-0 w-2 h-2 bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.8)]" />

        {/* Right Segment */}
        <div 
          className="h-[2px] bg-emerald-500/30 group-hover/container:bg-emerald-500/60 group-hover/container:shadow-[0_0_8px_rgba(16,185,129,0.5)]"
          style={{ 
            width: `calc(100% - ${ANCHOR_WIDTH + THUMB_WIDTH}px - (100% - ${TOTAL_PADDING}px) * ${progressRatio})`,
            position: 'absolute',
            right: 0,
            transition: transitionStyle
          }}
        />
        {/* Right Anchor */}
        <div className="absolute right-0 w-2 h-2 bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.8)]" />
      </div>

      {/* 
        Integrated Thumb (集成式滑块) 
      */}
      <div
        className={clsx(
          "absolute h-6 flex items-center justify-between px-2 border z-10 group",
          isMobile ? "w-[80px]" : "w-[120px]",
          // 视觉状态处理
          isVisualActive 
            ? "bg-transparent border-white shadow-[0_0_15px_rgba(255,255,255,0.2)]" // Active (透视): 彻底透明
            : "bg-zinc-900 border-zinc-800 hover:border-zinc-400 hover:shadow-[0_0_10px_rgba(255,255,255,0.1)]" // Idle/Hover
        )}
        style={{
          left: thumbLeftStyle,
          transform: 'translateX(-50%)', // Center align based on calculated center point
          cursor: isDragging ? 'grabbing' : 'grab',
          transition: transitionStyle,
          touchAction: 'none' // 防止浏览器默认触摸行为
        }}
        onPointerDown={handlePointerDown}
        onTouchStart={handleTouchStart}
      >
        {/* Prev Button */}
        {!isMobile && (
          <button
            className={clsx(
              "text-[10px] font-pixel transition-all duration-200 p-1",
              dragPage <= 1 
                ? "opacity-20 cursor-default" 
                : "cursor-pointer hover:text-emerald-500 hover:scale-110 hover:drop-shadow-[0_0_2px_rgba(16,185,129,0.8)]"
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (dragPage > 1) {
                setDragPage(dragPage - 1);
                onPageChange(dragPage - 1);
                triggerAnimation();
              }
            }}
            disabled={dragPage <= 1}
          >
            {'<'}
          </button>
        )}

        {/* Page Indicator */}
        <span 
          className={clsx(
            "font-pixel text-[10px] transition-colors duration-300 select-none",
            // 在 hover 父容器(group) 或 active(isVisualActive) 时变绿
            (isVisualActive) 
              ? "text-emerald-500"
              : "text-dim group-hover:text-emerald-500"
          )}
        >
          {String(displayPage).padStart(2, '0')}
          <span className="opacity-50 mx-1">/</span>
          <span className="opacity-50">{String(totalPages).padStart(2, '0')}</span>
        </span>

        {/* Next Button */}
        {!isMobile && (
          <button
            className={clsx(
              "text-[10px] font-pixel transition-all duration-200 p-1",
              dragPage >= totalPages 
                ? "opacity-20 cursor-default" 
                : "cursor-pointer hover:text-emerald-500 hover:scale-110 hover:drop-shadow-[0_0_2px_rgba(16,185,129,0.8)]"
            )}
            onClick={(e) => {
              e.stopPropagation();
              if (dragPage < totalPages) {
                setDragPage(dragPage + 1);
                onPageChange(dragPage + 1, false);
                triggerAnimation();
              }
            }}
            disabled={dragPage >= totalPages}
          >
            {'>'}
          </button>
        )}
      </div>
      
      {/* 
         Group Wrapper trick for hover effect 
         React event propagation doesn't automatically set CSS hover state on parent based on child logic
         So we manually add a class or structure carefully.
         The thumb div above handles its own hover styles.
         Wait, the requirement was: "Hover滑块时...页码文字变绿".
         So I added `group` class to the Thumb div implicitly? No, I need to add `group` to the div.
      */}
    </div>
  );
};
