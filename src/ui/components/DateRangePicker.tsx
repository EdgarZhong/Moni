import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { format, differenceInDays, addDays, startOfDay } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { PixelSlider } from './PixelSlider';
import { EditableDate } from './EditableDate';

interface DateRangePickerProps {
  minDate: Date;
  maxDate: Date;
  startDate: Date;
  endDate: Date;
  onChange: (start: Date, end: Date) => void;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  minDate,
  maxDate,
  startDate,
  endDate,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // --- Logic Helpers ---
  const totalDays = useMemo(() => {
    const diff = differenceInDays(maxDate, minDate);
    return diff === 0 ? 1 : diff;
  }, [minDate, maxDate]);

  const getPercentage = (date: Date) => {
    const days = differenceInDays(date, minDate);
    return Math.max(0, Math.min(100, (days / totalDays) * 100));
  };

  const getDateFromPercentage = (percentage: number) => {
    const daysToAdd = Math.round((percentage / 100) * totalDays);
    let date = addDays(minDate, daysToAdd);
    if (date < minDate) date = minDate;
    if (date > maxDate) date = maxDate;
    return startOfDay(date);
  };

  const handleSliderChange = ([startP, endP]: [number, number]) => {
    const newStart = getDateFromPercentage(startP);
    const newEnd = getDateFromPercentage(endP);
    onChange(newStart, newEnd);
  };

  const startPercent = getPercentage(startDate);
  const endPercent = getPercentage(endDate);

  const transition = {
    type: "tween" as const,
    ease: "easeInOut" as const,
    duration: 0.3
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div 
      className="relative z-30 inline-block align-top h-10 w-64 group"
      onMouseEnter={() => setIsHovered(true)} 
      onMouseLeave={() => setIsHovered(false)}
      ref={containerRef}
    >
      {/* Invisible Trigger Overlay for Closed State */}
      {!isOpen && (
        <div 
          className="absolute inset-0 z-40 cursor-pointer"
          onClick={() => setIsOpen(true)}
        />
      )}

      {/* 移动端和PC端分别渲染 */}
      {isMobile ? (
        <>
          {/* 移动端关闭状态 - 显示日期预览 */}
          {!isOpen && (
            <div className="flex items-center justify-center font-mono text-lg gap-1.5 h-full">
              <span>{format(startDate, 'MM.dd')}</span>
              <span className="text-dim">{'→'}</span>
              <span>{format(endDate, 'MM.dd')}</span>
            </div>
          )}
          
          {/* 移动端打开状态 - Portal弹窗 */}
          {isOpen && createPortal(
            <div
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-gray-600 shadow-[0_0_15px_rgba(255,255,255,0.05)] z-[9999] rounded-lg overflow-hidden"
              style={{ padding: '1.5rem', width: '85vw', maxWidth: '500px' }}
            >
          <div className="flex flex-col gap-4">
            <div className="flex items-center font-mono whitespace-nowrap justify-between mt-1 text-sm">
              <div className={`relative transition-colors ${!isOpen ? 'group-hover:text-pixel-green' : ''}`}>
                <EditableDate 
                  date={startDate} 
                  minDate={minDate} 
                  maxDate={endDate} 
                  onChange={(d) => onChange(d, endDate)} 
                  readOnly={!isOpen}
                />
              </div>
              
              <span 
                className={`text-dim opacity-50 transition-colors ${!isOpen ? 'group-hover:text-pixel-green' : ''}`}
              >
                {isOpen ? 'TO' : '->'}
              </span>
              
              <div className={`relative text-right transition-colors ${!isOpen ? 'group-hover:text-pixel-green' : ''}`}>
                <EditableDate 
                  date={endDate} 
                  minDate={startDate} 
                  maxDate={maxDate} 
                  onChange={(d) => onChange(startDate, d)} 
                  readOnly={!isOpen}
                />
              </div>
            </div>
          
          {/* Slider Section */}
          <div  
            className={`
              relative transition-all duration-300 ease-in-out
              ${isOpen ? 'h-8 opacity-100 mt-3' : 'h-2 mt-1'}
            `}
            style={{
              opacity: (isOpen || isHovered) ? 1 : 0
            }}
          >
            <PixelSlider 
              min={0} 
              max={100} 
              value={[startPercent, endPercent]} 
              onChange={handleSliderChange}
              variant={isOpen ? 'full' : 'mini'}
              disabled={!isOpen} // Only draggable when open
            />
          </div>

          {/* Expanded Footer */}
          <div className="flex justify-between text-[10px] text-dim font-mono border-t border-gray-800/50 pt-3 mt-2">
            <span>MIN: {format(minDate, 'yyyy.MM.dd')}</span>
            <span>MAX: {format(maxDate, 'yyyy.MM.dd')}</span>
          </div>
        </div>
        </div>,
        document.body
      )}
        </>
      ) : (
        <motion.div
          initial={false}
          animate={{
            width: isOpen ? 440 : 256,
            left: isOpen ? -92 : 0,
            padding: isOpen ? 24 : 0,
          }}
          className={`
            relative overflow-hidden transition-colors duration-300 absolute top-0
            ${isOpen ? 'bg-card border border-gray-600 shadow-[0_0_15px_rgba(255,255,255,0.05)] z-50' : 'bg-transparent border border-transparent z-30'}
          `}
          transition={transition}
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center font-mono whitespace-nowrap justify-between text-base mt-1">
                <div className={`relative transition-colors ${!isOpen ? 'group-hover:text-pixel-green' : ''}`}>
                  <EditableDate 
                    date={startDate} 
                    minDate={minDate} 
                    maxDate={endDate} 
                    onChange={(d) => onChange(d, endDate)} 
                    readOnly={!isOpen}
                  />
                </div>
                
                <span 
                  className={`text-dim opacity-50 transition-colors ${!isOpen ? 'group-hover:text-pixel-green' : ''}`}
                >
                  {isOpen ? 'TO' : '->'}
                </span>
                
                <div className={`relative text-right transition-colors ${!isOpen ? 'group-hover:text-pixel-green' : ''}`}>
                  <EditableDate 
                    date={endDate} 
                    minDate={startDate} 
                    maxDate={maxDate} 
                    onChange={(d) => onChange(startDate, d)} 
                    readOnly={!isOpen}
                  />
                </div>
              </div>
            
            {/* Slider Section */}
            <div  
              className={`
                relative transition-all duration-300 ease-in-out
                ${isOpen ? 'h-8 opacity-100 mt-3' : 'h-2 mt-1'}
              `}
              style={{
                opacity: (isOpen || isHovered) ? 1 : 0
              }}
            >
              <PixelSlider 
                min={0} 
                max={100} 
                value={[startPercent, endPercent]} 
                onChange={handleSliderChange}
                variant={isOpen ? 'full' : 'mini'}
                disabled={!isOpen}
              />
            </div>

            {/* Expanded Footer */}
            <AnimatePresence>
              {isOpen && (
                <motion.div 
                  key="footer"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, delay: 0.1 }}
                  className="flex justify-between text-[10px] text-dim font-mono border-t border-gray-800/50 pt-3 mt-2"
                >
                  <span>MIN: {format(minDate, 'yyyy.MM.dd')}</span>
                  <span>MAX: {format(maxDate, 'yyyy.MM.dd')}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      {/* Background dimming - 只在PC端显示 */}
      {!isMobile && (
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-20 bg-black/40 pointer-events-none backdrop-blur-[1px]"
            />
          )}
        </AnimatePresence>
      )}
    </div>
  );
};
