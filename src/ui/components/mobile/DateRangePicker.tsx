import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { format, differenceInDays, addDays, startOfDay, endOfDay } from 'date-fns';
import { PixelSlider } from '../PixelSlider';
import { EditableDate } from '../EditableDate';
import { motion, AnimatePresence } from 'framer-motion';

interface DateRangePickerProps {
  minDate: Date;
  maxDate: Date;
  startDate: Date;
  endDate: Date;
  onChange: (start: Date, end: Date) => void;
  label?: string;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  minDate,
  maxDate,
  startDate,
  endDate,
  onChange,
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
    // Ensure end date includes the full day (23:59:59)
    onChange(newStart, endOfDay(newEnd));
  };

  const startPercent = getPercentage(startDate);
  const endPercent = getPercentage(endDate);

  const transition = {
    type: "tween",
    ease: "easeInOut",
    duration: 0.3
  } as const;

  return (
    <div 
      className="relative z-30 flex flex-col items-center justify-center h-full w-full group"
      ref={containerRef}
    >
      {/* Explicit Trigger Overlay for Resting State */}
      {!isOpen && (
        <div 
          className="absolute inset-0 z-40 cursor-pointer"
          onClick={() => setIsOpen(true)}
        />
      )}

      {/* Shared Layout Group for Morphing Animation */}
      <AnimatePresence mode="wait">
        {!isOpen && (
          <motion.div 
            layoutId="picker-container"
            transition={transition}
            className="flex flex-col items-center justify-start w-full h-full bg-card/30 border border-white/5 rounded-sm p-2"
          >
            {/* Label - Child of layoutId container */}
            {label && (
              <motion.div 
                layoutId="picker-label"
                transition={transition}
                className="text-dim text-[10px] mb-1 font-mono tracking-wider"
              >
                {label}
              </motion.div>
            )}

            {/* Date Bar - Child of layoutId container */}
            <motion.div 
              layoutId="picker-dates"
              transition={transition}
              className="relative flex items-center justify-center font-mono text-sm gap-1.5 bg-transparent border border-transparent rounded-lg pointer-events-none"
            >
              <motion.div layoutId="start-date" transition={transition}>
                <EditableDate 
                  date={startDate} 
                  onChange={() => {}} 
                  readOnly={true}
                  hideYear={true}
                  className="text-white"
                />
              </motion.div>
              
              <motion.div layoutId="arrow-separator" transition={transition} className="text-dim opacity-50">
                {'->'}
              </motion.div>
              
              <motion.div layoutId="end-date" transition={transition}>
                <EditableDate 
                  date={endDate} 
                  onChange={() => {}} 
                  readOnly={true}
                  hideYear={true}
                  className="text-white"
                />
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Open State - Portal Modal */}
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4">
                {/* Backdrop */}
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" 
                    onClick={() => setIsOpen(false)}
                />
                
                {/* Modal Content - Linked via layoutId */}
                <motion.div
                  layoutId="picker-container"
                  // Remove initial/animate/exit opacity to allow layoutId to drive the morphing
                  transition={transition}
                  className="relative bg-card border border-gray-600 shadow-[0_0_15px_rgba(255,255,255,0.05)] rounded-lg overflow-hidden flex flex-col"
                  style={{ padding: '1.25rem', width: '85vw', maxWidth: '500px' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex flex-col gap-2">
                    {/* Label - Centered at top */}
                    {label && (
                      <div className="flex justify-center w-full mb-2">
                        <motion.div 
                          layoutId="picker-label"
                          transition={transition}
                          className="text-dim text-xs font-mono tracking-wider"
                        >
                          {label}
                        </motion.div>
                      </div>
                    )}

                    {/* Header with Linked Elements */}
                    <motion.div 
                      layoutId="picker-dates"
                      transition={transition}
                      className="flex items-center font-mono whitespace-nowrap justify-between mt-1 text-sm"
                    >
                      <motion.div 
                        layoutId="start-date"
                        transition={transition}
                        className={`relative transition-colors ${!isOpen ? 'group-hover:text-pixel-green' : ''}`}
                      >
                        <EditableDate 
                          date={startDate} 
                          minDate={minDate} 
                          maxDate={endDate} 
                          onChange={(d) => onChange(d, endDate)} 
                          readOnly={!isOpen}
                          hideYear={!isOpen}
                        />
                      </motion.div>
                      
                      <motion.span 
                        layoutId="arrow-separator"
                        transition={transition}
                        className={`text-dim opacity-50 transition-colors ${!isOpen ? 'group-hover:text-pixel-green' : ''}`}
                      >
                        {isOpen ? 'TO' : '->'}
                      </motion.span>
                      
                      <motion.div 
                        layoutId="end-date"
                        transition={transition}
                        className={`relative text-right transition-colors ${!isOpen ? 'group-hover:text-pixel-green' : ''}`}
                      >
                        <EditableDate 
                          date={endDate} 
                          minDate={startDate} 
                          maxDate={maxDate}
                          onChange={(d) => onChange(startDate, endOfDay(d))} 
                          readOnly={!isOpen} 
                          hideYear={!isOpen}
                          className="text-white"
                        />
                      </motion.div>
                    </motion.div>
                  
                    {/* Slider Section - Fades in as new content */}
                    <motion.div  
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: { duration: 0.2 } }}
                      transition={{ delay: 0.1, duration: 0.2 }}
                      className="mt-4 mb-2"
                    >
                      <PixelSlider 
                        min={0} 
                        max={100} 
                        value={[startPercent, endPercent]} 
                        onChange={handleSliderChange}
                        variant={isOpen ? 'full' : 'mini'}
                        disabled={!isOpen}
                      />
                    </motion.div>

                    {/* Footer - Fades in */}
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: { duration: 0.2 } }}
                      transition={{ delay: 0.15, duration: 0.2 }}
                      className="flex justify-between text-[10px] text-dim font-mono border-t border-gray-800/50 pt-2 mt-1"
                    >
                      <span>MIN: {format(minDate, 'yyyy.MM.dd')}</span>
                      <span>MAX: {format(maxDate, 'yyyy.MM.dd')}</span>
                    </motion.div>
                  </div>
                </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
