import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, LockOpen } from 'lucide-react';
import { VerticalCategoryPicker } from './VerticalCategoryPicker';

interface CategorySelectorProps {
  category: string;
  categories: string[];
  isLocked: boolean;
  onToggleLock: () => void;
  onSelect: (category: string) => void;
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({
  category,
  categories,
  isLocked,
  onToggleLock,
  onSelect,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tempCategory, setTempCategory] = useState(category);
  const usePixelFont = /^[a-z0-9_]+$/i.test(category);

  // Sync tempCategory when opening
  useEffect(() => {
    if (isOpen) {
      setTempCategory(category);
    }
  }, [isOpen, category]);

  const handleSelect = (newCategory: string) => {
    setTempCategory(newCategory);
    onSelect(newCategory);
  };

  return (
    <div className="flex items-center gap-3 w-full relative z-10">
      {/* Lock Button */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={onToggleLock}
        className={`
          flex items-center justify-center w-10 h-10 rounded-sm border transition-all duration-300
          ${isLocked 
            ? 'border-gray-800 text-gray-400 bg-transparent' 
            : 'border-white/50 text-pixel-green bg-transparent hover:bg-white/5'
          }
        `}
      >
        {isLocked ? <Lock size={16} /> : <LockOpen size={16} />}
      </motion.button>

      {/* Trigger */}
      <div 
        onClick={() => !isLocked && setIsOpen(true)}
        className={`
            relative flex-1 p-2 h-10 flex items-center rounded-sm border transition-all duration-300
            ${isLocked ? 'border-gray-800 opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-white/5 border-white/50'}
        `}
      >
         <div className="flex items-center justify-between w-full px-2">
            <span className={`${usePixelFont ? 'font-pixel text-sm tracking-wider' : 'font-mono text-xs'} ${
              !isLocked 
                ? 'text-pixel-green animate-pulse [animation-duration:4s]' // Unlocked: Green Breathing (4s)
                : 'text-pixel-green' // Locked: Green Solid
            }`}>
              {category.toUpperCase()}
            </span>
         </div>
      </div>

      {/* Modal */}
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

              {/* Panel */}
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="relative w-full max-w-xs bg-card border border-gray-600 shadow-[0_0_15px_rgba(255,255,255,0.05)] rounded-sm overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="h-64 relative w-full"> 
                    {/* Force remount on open to ensure scroll position is recalculated correctly */}
                    <VerticalCategoryPicker
                        key={isOpen ? 'open' : 'closed'} 
                        categories={categories}
                        selectedCategory={tempCategory}
                        onSelect={handleSelect}
                    />
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
