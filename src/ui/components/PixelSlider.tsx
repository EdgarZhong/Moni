import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PixelSliderProps {
  min: number;
  max: number;
  value: [number, number]; // [start, end] percentage 0-100
  onChange: (value: [number, number]) => void;
  variant?: 'mini' | 'full';
  disabled?: boolean;
}

export const PixelSlider: React.FC<PixelSliderProps> = ({
  value: [start, end],
  onChange,
  variant = 'full',
  disabled = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);
  const valueRef = useRef<[number, number]>([start, end]);
  const isDraggingRef = useRef<boolean>(false);

  const isMini = variant === 'mini';
  // Padding to ensure thumbs don't overflow the container visually.
  // Half of thumb width (approx 12px) = 6px.
  const PADDING_PX = isMini ? 0 : 6; 

  // Update ref whenever value changes, but only when not dragging
  useEffect(() => {
    if (!isDraggingRef.current) {
      valueRef.current = [start, end];
    }
  }, [start, end]);

  useEffect(() => {
    let rafId: number | null = null;
    
    const handleMove = (clientX: number) => {
      if (!dragging || !containerRef.current || disabled) return;

      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        if (!containerRef.current) return;
        
        const rect = containerRef.current.getBoundingClientRect();
        const trackWidth = rect.width - (PADDING_PX * 2);
        const x = clientX - rect.left - PADDING_PX;
        const rawPercentage = (x / trackWidth) * 100;
        const percentage = Math.max(0, Math.min(100, rawPercentage));

        const [currentStart, currentEnd] = valueRef.current;

        if (dragging === 'start') {
          const newStart = Math.min(percentage, currentEnd);
          valueRef.current = [newStart, currentEnd];
          onChange([newStart, currentEnd]);
        } else {
          const newEnd = Math.max(percentage, currentStart);
          valueRef.current = [currentStart, newEnd];
          onChange([currentStart, newEnd]);
        }
      });
    };

    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX);
      }
    };

    const handleEnd = () => {
      isDraggingRef.current = false;
      setDragging(null);
    };

    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
    }

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [dragging, onChange, disabled, PADDING_PX]);

  // Helper to calculate CSS left position based on percentage and padding
  const getLeftStyle = (percent: number) => {
    if (isMini) return `${percent}%`;
    return `calc(${PADDING_PX}px + (100% - ${PADDING_PX * 2}px) * ${percent} / 100)`;
  };

  return (
    <div 
      className={`relative select-none transition-all duration-300 group ${isMini ? 'h-2 w-full' : 'h-8 px-3 -mx-3'}`} 
      ref={containerRef}
    >
      {/* Base Track */}
      <div 
        className={`absolute top-1/2 -translate-y-1/2 w-full transition-all duration-300 ${isMini ? 'bg-white/20 h-1' : 'bg-gray-800 h-[1px]'}`}
        style={!isMini ? {
            left: `${PADDING_PX}px`,
            right: `${PADDING_PX}px`,
            width: 'auto'
        } : {}}
      />
      
      {/* Active Range */}
      <div 
        className={`absolute top-1/2 -translate-y-1/2 pointer-events-none ${isMini ? 'bg-pixel-green h-1 group-hover:shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-pixel-green/50 h-[2px] group-hover:bg-pixel-green group-hover:shadow-[0_0_8px_rgba(16,185,129,0.8)]'}`}
        style={{ 
          left: getLeftStyle(start),
          width: isMini 
            ? `${Math.max(0, end - start)}%`
            : `calc((100% - ${PADDING_PX * 2}px) * ${Math.max(0, end - start)} / 100)`,
        }}
      />

      {/* Thumbs - Only visible/interactive in full mode */}
      <AnimatePresence>
        {!isMini && (
          <>
            {/* Start Thumb */}
            <motion.div 
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              className="absolute top-1/2 cursor-ew-resize group z-10 w-6 h-6 flex items-center justify-center"
              style={{ 
                left: getLeftStyle(start),
                x: "-50%",
                y: "-50%"
              }}
              onMouseDown={(e) => {
                if (disabled) return;
                e.preventDefault();
                e.stopPropagation();
                isDraggingRef.current = true;
                setDragging('start');
              }}
              onTouchStart={(e) => {
                if (disabled) return;
                e.preventDefault();
                e.stopPropagation();
                isDraggingRef.current = true;
                setDragging('start');
              }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <div className={`font-pixel text-[10px] transition-colors pb-[3px] ${dragging === 'start' ? 'text-pixel-green' : 'text-primary group-hover:text-white'}`}>
                [
              </div>
            </motion.div>

            {/* End Thumb */}
            <motion.div 
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0 }}
              className="absolute top-1/2 cursor-ew-resize group z-10 w-6 h-6 flex items-center justify-center"
              style={{ 
                left: getLeftStyle(end),
                x: "-50%",
                y: "-50%"
              }}
              onMouseDown={(e) => {
                if (disabled) return;
                e.preventDefault();
                e.stopPropagation();
                isDraggingRef.current = true;
                setDragging('end');
              }}
              onTouchStart={(e) => {
                if (disabled) return;
                e.preventDefault();
                e.stopPropagation();
                isDraggingRef.current = true;
                setDragging('end');
              }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <div className={`font-pixel text-[10px] transition-colors pb-[3px] ${dragging === 'end' ? 'text-pixel-green' : 'text-primary group-hover:text-white'}`}>
                ]
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
