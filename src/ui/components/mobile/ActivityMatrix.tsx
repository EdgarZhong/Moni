import React, { useMemo, useState, useEffect } from 'react';
import type { Transaction } from '@shared/types';
import { format, subDays, isSameDay, eachDayOfInterval } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

interface ActivityMatrixProps {
  transactions: Transaction[];
  onDateClick?: (date: Date) => void;
  dateRange?: { start: Date | null; end: Date | null };
  selectedDate?: Date | null;
}

// 幽灵占位符数据 - 起伏态势
const GHOST_WAVE = [3, 5, 8, 12, 6, 4, 2];

const ActivityMatrixComponent: React.FC<ActivityMatrixProps> = ({ transactions, onDateClick, dateRange, selectedDate }) => {
  const [page, setPage] = useState(0);
  const [animationDirection, setAnimationDirection] = useState(1); // 动画方向状态
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const daysPerPage = 7;
  const swipeThreshold = 80; // 增加最小滑动距离，降低敏感度
  
  // 计算 dateRange 范围内的所有天数据
  const matrixData = useMemo(() => {
    // 确定日期范围
    let startDate: Date;
    let endDate: Date;
    
    if (dateRange?.start && dateRange?.end) {
      // 使用传入的 dateRange
      startDate = dateRange.start;
      endDate = dateRange.end;
    } else if (transactions.length > 0) {
      // 使用交易数据的日期范围
      startDate = transactions[transactions.length - 1].originalDate;
      endDate = transactions[0].originalDate;
    } else {
      // 没有数据，默认显示最近7天
      endDate = new Date();
      startDate = subDays(endDate, 6);
    }

    // 生成日期范围内的所有天
    const datesInRange = eachDayOfInterval({ start: startDate, end: endDate });
    const data = [];
    
    // 生成基础数据
    for (const date of datesInRange) {
      const dayTransactions = transactions.filter(t => 
        isSameDay(t.originalDate, date)
      );
      
      const expense = dayTransactions
        .filter(t => t.direction === 'out')
        .reduce((sum, t) => sum + t.amount, 0);
        
      const income = dayTransactions
        .filter(t => t.direction === 'in')
        .reduce((sum, t) => sum + t.amount, 0);

      const totalVolume = expense + income;

      data.push({
        date,
        expense,
        income,
        totalVolume,
        count: dayTransactions.length
      });
    }

    // 取整补位逻辑：确保数据总长度是 7 的倍数
    // 如果不是，则在头部（最早日期之前）补充空天数
    const remainder = data.length % daysPerPage;
    if (remainder !== 0) {
      const daysToAdd = daysPerPage - remainder;
      const firstDate = data[0].date;
      
      for (let i = 1; i <= daysToAdd; i++) {
        const paddingDate = subDays(firstDate, i);
        // 头部插入
        data.unshift({
          date: paddingDate,
          expense: 0,
          income: 0,
          totalVolume: 0,
          count: 0
        });
      }
    }

    return { data };
  }, [transactions, dateRange]);

  const maxPage = Math.ceil(matrixData.data.length / daysPerPage) - 1;

  // 初始化或数据变更时，默认定位到最后一页（最近的一周）
  useEffect(() => {
    setPage(maxPage >= 0 ? maxPage : 0);
  }, [maxPage, transactions, dateRange]); // 依赖项变化时重置

  // 分页显示7天数据
  const paginatedData = useMemo(() => {
    const start = page * daysPerPage;
    const end = start + daysPerPage;
    return matrixData.data.slice(start, end);
  }, [matrixData.data, page]);

  // 计算当前页的最大值
  const currentMax = useMemo(() => {
    const max = Math.max(...paginatedData.map(d => d.totalVolume));
    return max === 0 ? 1 : max; // 避免除以0，若全为0则设为1
  }, [paginatedData]);
  
  const handleSwipeLeft = () => {
    if (page < maxPage) {
      setAnimationDirection(1);
      setPage(prev => prev + 1);
    }
  };
  
  const handleSwipeRight = () => {
    if (page > 0) {
      setAnimationDirection(-1);
      setPage(prev => prev - 1);
    }
  };

  // 处理触摸滑动
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null); // 重置结束位置
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) {
      // 重置状态
      setTouchStart(null);
      setTouchEnd(null);
      return;
    }
    
    const distance = touchStart - touchEnd;
    const absDistance = Math.abs(distance);
    
    // 只有滑动距离超过阈值才触发换页
    if (absDistance > swipeThreshold) {
      const isLeftSwipe = distance > 0;
      
      if (isLeftSwipe) {
        handleSwipeLeft();
      } else {
        handleSwipeRight();
      }
    }
    
    // 重置状态
    setTouchStart(null);
    setTouchEnd(null);
  };
  
  // 计算当前页显示的日期范围
  const currentPageDateRange = useMemo(() => {
    if (paginatedData.length === 0) return '';
    const firstDate = paginatedData[0].date;
    const lastDate = paginatedData[paginatedData.length - 1].date;
    return `${format(firstDate, 'MM/dd')}-${format(lastDate, 'MM/dd')}`;
  }, [paginatedData]);

  // 判断是否应该显示幽灵占位符（当前页所有数据都为0）
  const showGhost = paginatedData.every(d => d.totalVolume === 0);

  return (
    <div 
      className="mb-12 relative z-0 select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex justify-between items-center gap-2 mb-10 font-mono text-[10px] text-dim">
        {/* 移除左右箭头按钮 */}
        <span className="flex-1 text-left tracking-wider pl-1">
          {currentPageDateRange || 'ACTIVITY_MATRIX'}
        </span>
        <span className="text-dim/70 flex-1 text-right pr-1">MAX: ¥{showGhost ? 0 : currentMax === 1 ? 0 : currentMax.toFixed(0)}</span>
      </div>
      
      <AnimatePresence mode="wait" initial={false} custom={animationDirection}>
        <motion.div 
          key={page}
          variants={{
            enter: (dir: number) => ({
              opacity: 0,
              x: dir > 0 ? 100 : -100
            }),
            center: {
              opacity: 1,
              x: 0
            },
            exit: (dir: number) => ({
              opacity: 0,
              x: dir > 0 ? -100 : 100
            })
          }}
          custom={animationDirection}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="flex justify-between items-end h-[120px] gap-2"
        >
          {paginatedData.map((day, index) => {
            const isSelected = selectedDate ? isSameDay(day.date, selectedDate) : false;

            // 如果显示幽灵模式，使用预设波形
            const ghostIntensity = showGhost ? GHOST_WAVE[index] : 0;
            
            // 计算高度 (0-20格)
            const intensity = showGhost 
              ? ghostIntensity 
              : (currentMax > 0 ? Math.ceil((day.totalVolume / currentMax) * 20) : 0);
            
            // 计算红色(支出)像素的数量
            // 红色在下，黄色在上
            const expenseRatio = day.totalVolume > 0 ? day.expense / day.totalVolume : 0;
            const expensePixels = showGhost ? 0 : Math.round(intensity * expenseRatio);

            return (
              <div
                key={index}
                className={`flex flex-col gap-[2px] items-center relative w-full h-full justify-end ${showGhost ? 'pointer-events-none' : 'cursor-pointer'} transition-opacity`}
                onClick={() => !showGhost && onDateClick?.(day.date)}
              >
                {/* Tooltip - 选中状态下显示 */}
                {!showGhost && isSelected && (
                  <div className="absolute bottom-full mb-2 z-20 bg-card border border-gray-800 p-2 text-xs font-mono whitespace-nowrap shadow-xl pointer-events-none">
                    <div className="text-gray-400">{format(day.date, 'yyyy-MM-dd')}</div>
                    <div className="text-expense-red">OUT: -¥{day.expense.toFixed(2)}</div>
                    <div className="text-income-yellow">IN: +¥{day.income.toFixed(2)}</div>
                    <div className="text-dim mt-1">{day.count} txns</div>
                  </div>
                )}

                {/* Pixel Column */}
                <div className="flex flex-col-reverse gap-[2px] w-full items-center">
                  {Array.from({ length: 20 }).map((_, i) => {
                    // i=0 is bottom
                    const isActive = (i + 1) <= intensity;
                    const isExpense = (i + 1) <= expensePixels;

                    // 幽灵模式样式逻辑
                    if (showGhost) {
                      return (
                         <div
                            key={i}
                            className={`h-1 md:h-1.5 rounded-[1px] w-full transition-colors duration-300 ${
                              isActive 
                                ? 'bg-gray-800 opacity-50' // "存在的"幽灵点，比背景稍亮
                                : 'bg-gray-800 opacity-10' // "空气"背景点
                            }`}
                            style={{ width: isActive ? "100%" : "70%" }}
                          />
                      );
                    }

                    // 正常模式样式逻辑 - 基于 isSelected 状态
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0 }}
                        animate={{ 
                          opacity: isActive ? 1 : 0.1,
                          width: isActive ? "100%" : "70%"
                        }}
                        transition={{ delay: index * 0.05 + (isActive ? i * 0.01 : (19 - i) * 0.01) }}
                        className={`h-1 md:h-1.5 rounded-[1px] transition-colors duration-300 ${
                          isActive 
                            ? `${isSelected ? 'shadow-none' : 'shadow-[0_0_2px_rgba(0,0,0,0.5)]'}
                               ${isSelected 
                                 ? (isExpense ? 'bg-expense-red' : 'bg-income-yellow') 
                                 : 'bg-pixel-green'
                               }`
                            : 'bg-gray-800'
                        }`}
                      />
                    );
                  })}
                </div>
                
                {/* Date Label */}
                <div className={`mt-2 text-[10px] font-mono text-dim rotate-90 md:rotate-0 origin-left translate-x-1 md:translate-x-0 transition-opacity ${showGhost ? 'opacity-30' : (isSelected ? 'opacity-100 text-pixel-green' : 'opacity-50')}`}>
                  {format(day.date, 'MM/dd')}
                </div>
              </div>
            );
          })}
        </motion.div>
      </AnimatePresence>
      
      {/* 移除底部分页圆点 */}
    </div>
  );
};

export const ActivityMatrix = React.memo(ActivityMatrixComponent);
