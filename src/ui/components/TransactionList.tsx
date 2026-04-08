import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import type { Transaction } from '@shared/types';
import { Pagination } from './Pagination';
import { TransactionItem } from './TransactionItem';
import { triggerHaptic, HapticFeedbackLevel } from '@system/device/haptics';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { AuraOverlay, type AuraOverlayHandle } from './AuraOverlay';

interface TransactionListProps {
  transactions: Transaction[];
  onTransactionClick?: (transaction: Transaction) => void;
  isMobile?: boolean;
  activeTransactionId?: string | null;
  currentFilter?: string;
  enableAura?: boolean;
  pulseTrigger?: number; // Timestamp to trigger pulse animation
}

const TransactionListComponent: React.FC<TransactionListProps> = ({ 
  transactions, 
  onTransactionClick, 
  isMobile = false, 
  activeTransactionId,
  currentFilter = 'ALL',
  enableAura = false,
  pulseTrigger
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [direction, setDirection] = useState(0);
  const listTopRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; timestamp: number } | null>(null);
  const auraRef = useRef<AuraOverlayHandle>(null);
  const lastPulseRef = useRef<number>(pulseTrigger ?? 0);
  
  // Effect to trigger pulse when pulseTrigger prop changes
  useEffect(() => {
    if (!pulseTrigger || pulseTrigger <= 0) {
      return;
    }
    if (lastPulseRef.current === pulseTrigger) {
      return;
    }
    lastPulseRef.current = pulseTrigger;
    auraRef.current?.pulse();
  }, [pulseTrigger]);
  
  const ITEMS_PER_PAGE = 20;
  
  const totalPages = Math.ceil(transactions.length / ITEMS_PER_PAGE);
  
  // When transactions change, reset to first page
  useLayoutEffect(() => {
    setCurrentPage(1);
  }, [transactions.length]);

  const handlePageChange = (page: number) => {
    const newDirection = page > currentPage ? 1 : -1;
    setDirection(newDirection);
    setCurrentPage(page);
    // Pulse triggered by AI Engine only, removed from here
  };

  const paginatedTransactions = transactions.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Gesture handlers for swipe navigation
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      timestamp: Date.now()
    };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const endTouch = e.changedTouches[0];
    const deltaX = endTouch.clientX - touchStartRef.current.x;
    const deltaY = Math.abs(endTouch.clientY - touchStartRef.current.y);
    const timeDelta = Date.now() - touchStartRef.current.timestamp;

    // Check if this is a horizontal swipe gesture
    const isHorizontalSwipe = Math.abs(deltaX) > 80 && deltaY < 60 && timeDelta < 300;

    if (isHorizontalSwipe) {
      if (deltaX > 0 && currentPage > 1) {
        // Swipe right - previous page
        triggerHaptic(HapticFeedbackLevel.LIGHT);
        setDirection(-1);
        setCurrentPage(prev => prev - 1);
        // Pulse triggered by AI Engine only
      } else if (deltaX < 0 && currentPage < totalPages) {
        // Swipe left - next page
        triggerHaptic(HapticFeedbackLevel.LIGHT);
        setDirection(1);
        setCurrentPage(prev => prev + 1);
        // Pulse triggered by AI Engine only
      }
    }

    touchStartRef.current = null;
  }, [currentPage, totalPages]);

  // Animation variants for page transitions
  const variants = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    enter: (_direction: number) => ({
      opacity: 0,
      filter: 'blur(2px)',
      zIndex: 1,
      position: 'relative' as const
    }),
    center: {
      zIndex: 2,
      opacity: 1,
      filter: 'blur(0px)',
      position: 'relative' as const,
      transition: {
        staggerChildren: 0.03, // Stagger effect for items
        duration: 0.4
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    exit: (_direction: number) => ({
      zIndex: 0,
      opacity: 0,
      filter: 'blur(4px)',
      position: 'absolute' as const,
      top: 0,
      left: 0,
      width: '100%'
    })
  };

  // Helper component for skeleton items
  const SkeletonItem = () => (
    <div className="flex items-start py-3 border-b border-gray-900/50 opacity-50 pointer-events-none select-none">
      <div className="w-6 flex justify-center pt-1">
        <div className="w-3 h-3 bg-gray-700 animate-pulse" />
      </div>
      <div className="flex-1 min-w-0 pl-2">
        <div className="w-32 h-5 bg-gray-700/50 mb-1 animate-pulse" />
        <div className="w-20 h-4 bg-gray-800/50 animate-pulse" />
      </div>
      <div className="w-20 flex flex-col items-end gap-1">
        <div className="w-16 h-5 bg-gray-700/50 animate-pulse" />
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, j) => (
            <div key={j} className="w-1.5 h-1.5 bg-gray-800 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
  
  // Item animation variants (for staggered entrance)
  const itemVariants: Variants = {
    enter: { 
      opacity: 0, 
      filter: 'blur(2px)',
      backgroundColor: 'rgba(255, 255, 255, 0.1)' // Initial flash state
    },
    center: { 
      opacity: 1, 
      filter: 'blur(0px)',
      backgroundColor: 'rgba(255, 255, 255, 0)', // Fade out flash
      transition: { 
        opacity: { duration: 0.4, ease: [0.25, 1, 0.5, 1] as const },
        filter: { duration: 0.4, ease: [0.25, 1, 0.5, 1] as const },
        backgroundColor: { duration: 0.2, ease: "easeOut" }
      }
    },
    exit: { opacity: 0 }
  };

  // Skeleton item 类型定义
  interface SkeletonItem {
    id: string;
    isSkeleton: true;
  }

  const displayItems: (Transaction | SkeletonItem)[] = [...paginatedTransactions];
  // Fill remaining slots with skeleton items to maintain fixed height (20 items)
  while (displayItems.length < ITEMS_PER_PAGE) {
    displayItems.push({ id: `skeleton-${displayItems.length}`, isSkeleton: true as const });
  }

  return (
    <div className="font-mono text-sm" ref={listTopRef}>
      <div className="flex justify-between items-center mb-6 text-dim text-xs uppercase tracking-wider px-3">
        <div className="w-6 text-center">Src</div>
        <div className="flex-1 pl-2">Details</div>
        <div className="w-20 text-right">Amount</div>
      </div>

      <AuraOverlay isActive={enableAura} ref={auraRef}>
        <div className="relative overflow-hidden px-3" style={{ height: 'calc(20 * 68px + 20px)' }}>
          <AnimatePresence mode="popLayout" custom={direction} initial={false}>
            <motion.div 
              key={currentPage}
              ref={listContainerRef}
              className="space-y-1 touch-pan-y w-full"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
            >
              {displayItems.map((t) => (
                'isSkeleton' in t ? (
                  <motion.div key={t.id} variants={itemVariants}>
                    <SkeletonItem />
                  </motion.div>
                ) : (
                  <motion.div key={t.id} variants={itemVariants}>
                    <TransactionItem
                      transaction={t}
                      onClick={onTransactionClick}
                      isActive={t.id === activeTransactionId}
                      currentFilter={currentFilter}
                    />
                  </motion.div>
                )
              ))}
              
              {/* Show message only if truly empty (all skeletons) */}
              {transactions.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                   <div className="text-center py-8 text-dim text-xs bg-background/80 px-4 rounded border border-gray-800">
                      AWAITING_DATA_STREAM...
                   </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </AuraOverlay>
      
      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination 
          currentPage={currentPage} 
          totalPages={totalPages} 
          onPageChange={handlePageChange}
          isMobile={isMobile}
        />
      )}
    </div>
  );
};

export const TransactionList = React.memo(TransactionListComponent);
