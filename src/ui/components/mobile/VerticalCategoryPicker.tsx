import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';

interface VerticalCategoryPickerProps {
  categories: string[];
  selectedCategory: string;
  onSelect: (category: string) => void;
}

export const VerticalCategoryPicker: React.FC<VerticalCategoryPickerProps> = ({
  categories,
  selectedCategory,
  onSelect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  // Refs for state management without re-renders
  const isUserScrolling = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSelectedProp = useRef(selectedCategory);

  // Internal state for visual feedback ONLY (decoupled from prop)
  const [visualCategory, setVisualCategory] = useState(selectedCategory);

  // Constants
  const ITEM_HEIGHT = 48; // px
  const VISIBLE_ITEMS = 5;
  const CONTAINER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
  
  // 1. Extended List: [Buffer][Core][Buffer]
  // Triple clone for infinite scroll illusion
  const extendedCategories = useMemo(() => {
    if (categories.length === 0) return [];
    return [...categories, ...categories, ...categories];
  }, [categories]);

  // 2. Smooth Scroll Utility
  const smoothScrollTo = useCallback((element: HTMLElement, target: number, duration: number, onComplete?: () => void) => {
    const start = element.scrollTop;
    const change = target - start;
    const startTime = performance.now();

    const easeOutQuart = (x: number): number => {
      return 1 - Math.pow(1 - x, 4);
    };

    const animateScroll = (currentTime: number) => {
      const elapsed = currentTime - startTime;

      if (elapsed < duration) {
        const progress = easeOutQuart(elapsed / duration);
        element.scrollTop = start + change * progress;
        animationFrameRef.current = requestAnimationFrame(animateScroll);
      } else {
        element.scrollTop = target;
        animationFrameRef.current = null;
        if (onComplete) onComplete();
      }
    };

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    animationFrameRef.current = requestAnimationFrame(animateScroll);
  }, []);

  // 3. Calculate Center Item Index
  const getCenterItemIndex = useCallback(() => {
    if (!containerRef.current || categories.length === 0) return -1;
    const container = containerRef.current;
    // item index = floor(center / height) - padding_offset
    // But since we have top padding, the first item starts at scrollTop = 0 if padding is handled differently
    // Actually:
    // Container Content: [PaddingTop][Item0][Item1]...
    // PaddingTop = (CONTAINER_HEIGHT - ITEM_HEIGHT) / 2
    // Item N center = PaddingTop + N * ITEM_HEIGHT + ITEM_HEIGHT / 2
    
    // Relative to content top (0)
    // We want to find N such that ItemCenter is closest to (scrollTop + ContainerHeight/2)
    // scrollTop + ContainerHeight/2 = PaddingTop + N * ITEM_HEIGHT + ITEM_HEIGHT/2
    // scrollTop + 2.5 * H = 2H + N*H + 0.5H (assuming 5 visible items)
    // scrollTop = N * H
    
    // Simplification: The scroll position perfectly aligns with item index N when scrollTop = N * ITEM_HEIGHT
    // So index = Math.round(scrollTop / ITEM_HEIGHT)
    
    return Math.round(container.scrollTop / ITEM_HEIGHT);
  }, [ITEM_HEIGHT, categories.length]);

  // 4. Snap Logic
  const snapToCenter = useCallback(() => {
    if (!containerRef.current || categories.length === 0) return;
    const container = containerRef.current;
    
    const currentIndex = getCenterItemIndex();
    const targetScroll = currentIndex * ITEM_HEIGHT;
    
    // Determine the actual category based on the extended index
    const categoryIndex = currentIndex % categories.length;
    const targetCategory = categories[categoryIndex];

    // Smooth scroll to snap
    smoothScrollTo(container, targetScroll, 200, () => {
        // Animation Complete
        isUserScrolling.current = false;
        
        // Trigger external update ONLY here
        if (targetCategory !== selectedCategory) {
            onSelect(targetCategory);
        }
    });
  }, [categories, ITEM_HEIGHT, getCenterItemIndex, onSelect, selectedCategory, smoothScrollTo]);

  // 5. Scroll Handler (Infinite Loop + Visual Update + Snap Trigger)
  const handleScroll = useCallback(() => {
    if (!containerRef.current || categories.length === 0) return;
    
    const container = containerRef.current;
    const scrollTop = container.scrollTop;
    const oneSetHeight = categories.length * ITEM_HEIGHT;

    // A. Infinite Scroll Jump (Buffer Logic)
    if (scrollTop < oneSetHeight / 2) {
      container.scrollTop += oneSetHeight;
      // Adjust scrollTop immediately, no return, continue to calculate visual
    } else if (scrollTop > oneSetHeight * 2.5) {
      container.scrollTop -= oneSetHeight;
    }

    // B. Visual Feedback (Decoupled from prop)
    const currentIndex = Math.round(container.scrollTop / ITEM_HEIGHT);
    const categoryIndex = currentIndex % categories.length;
    if (categories[categoryIndex] !== visualCategory) {
        setVisualCategory(categories[categoryIndex]);
    }

    // C. Debounce Snap
    if (isUserScrolling.current) {
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => {
            snapToCenter();
        }, 150); // 150ms debounce for scroll end
    }
  }, [categories, ITEM_HEIGHT, visualCategory, snapToCenter]);

  // 6. Interaction Handlers
  const handleTouchStart = () => {
    isUserScrolling.current = true;
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
  };
  
  // Also handle mouse wheel / trackpad
  // Note: 'scroll' event fires for both touch and wheel, but we need to know when "interaction starts"
  // to set the flag. For wheel, it's harder, but the debounce logic in handleScroll covers the "end".
  // The missing part is blocking external updates during wheel scroll.
  // We can set isUserScrolling = true in handleScroll if it's not already? 
  // But that might block programmatic scrolls.
  // Better to rely on explicit events or assume scroll event implies user if not programmatic.
  // Implementation: We'll set isUserScrolling=true in onPointerDown/onTouchStart.
  // For Wheel, we might need a separate handler if strict blocking is needed, 
  // but usually touch is the main concern for mobile.
  
  // 7. Sync with External Prop
  useEffect(() => {
    // Initial scroll or prop update
    if (containerRef.current && categories.length > 0) {
        // Find target index
        const categoryIndex = categories.indexOf(selectedCategory);
        if (categoryIndex !== -1) {
            // Target the middle set
            const targetIndex = categories.length + categoryIndex;
            const targetScroll = targetIndex * ITEM_HEIGHT;
            
            // If it's the first render or far away, jump
            // Otherwise smooth scroll (handled by the other logic below if needed, 
            // but for initial mount we want instant jump)
            
            // We can just set scrollTop directly here for simplicity and robustness
            if (!isUserScrolling.current) {
                containerRef.current.scrollTop = targetScroll;
                // Also update visual category to match
                setVisualCategory(selectedCategory);
                lastSelectedProp.current = selectedCategory;
            }
        }
    }
  }, [selectedCategory, categories, ITEM_HEIGHT]); // Simplified dependency

  return (
    <div className="relative w-full flex items-center justify-center py-4">
      <div
        ref={containerRef}
        className="w-full overflow-y-auto scrollbar-hide snap-y snap-mandatory touch-pan-y"
        style={{ 
            height: CONTAINER_HEIGHT,
            scrollBehavior: 'auto' 
        }}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onMouseDown={handleTouchStart} 
        onWheel={() => { isUserScrolling.current = true; }}
      >
        {/* Top Padding for centering */}
        <div style={{ height: (CONTAINER_HEIGHT - ITEM_HEIGHT) / 2 }} />
        
        {extendedCategories.map((cat, index) => {
          const isSelected = cat === visualCategory;
          const usePixelFont = /^[a-z0-9_]+$/i.test(cat);
          
          return (
            <motion.div
              key={`${cat}-${index}`}
              className="flex items-center justify-center cursor-pointer snap-center"
              style={{ height: ITEM_HEIGHT }}
              onClick={() => {
                 isUserScrolling.current = false;
                 if (cat !== selectedCategory) {
                     onSelect(cat);
                 } else {
                     snapToCenter();
                 }
              }}
              animate={{
                scale: isSelected ? 1.1 : 1.0,
                opacity: isSelected ? 1 : 0.5,
                color: isSelected ? '#10B981' : '#6B7280',
              }}
              transition={{
                duration: 0.2
              }}
            >
              <span className={`${usePixelFont ? 'text-sm font-pixel tracking-wider' : 'text-xs font-mono'} font-bold ${isSelected ? 'text-pixel-green' : 'text-dim'}`}>
                {cat.toUpperCase()}
              </span>
            </motion.div>
          );
        })}
        
        {/* Bottom Padding */}
        <div style={{ height: (CONTAINER_HEIGHT - ITEM_HEIGHT) / 2 }} />
      </div>
      
      {/* Gradients */}
      <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-background to-transparent pointer-events-none z-10" />
      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent pointer-events-none z-10" />
    </div>
  );
};
