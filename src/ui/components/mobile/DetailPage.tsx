import { motion } from 'framer-motion';
import { format } from 'date-fns';
import type { Transaction } from '@shared/types';
import { useSafeArea } from '@ui/hooks/useSafeArea';
import { useRef, useCallback } from 'react';
import { CategorySelector } from './CategorySelector';
import { NoteEditor } from './NoteEditor';

interface DetailPageProps {
  transaction: Transaction | null;
  categories: string[];
  onClose: () => void;
  onUpdate: (transaction: Transaction) => void;
}

export function DetailPage({ transaction, categories, onClose, onUpdate }: DetailPageProps) {
  const safeArea = useSafeArea();
  const detailTouchStartRef = useRef<{ x: number; y: number; timestamp: number } | null>(null);

  // 处理边缘滑动手势以返回（类似全面屏手势）
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    detailTouchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      timestamp: Date.now()
    };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!detailTouchStartRef.current) return;

    const endTouch = e.changedTouches[0];
    const deltaX = endTouch.clientX - detailTouchStartRef.current.x;
    const deltaY = Math.abs(endTouch.clientY - detailTouchStartRef.current.y);
    const timeDelta = Date.now() - detailTouchStartRef.current.timestamp;
    const screenWidth = window.innerWidth;

    // 检测边缘滑动手势（返回手势）
    // 从左边缘向右滑动 或 从右边缘向左滑动
    const fromLeftEdge = detailTouchStartRef.current.x < 50 && deltaX > 50;
    const fromRightEdge = detailTouchStartRef.current.x > screenWidth - 50 && deltaX < -50;

    if (
      (fromLeftEdge || fromRightEdge) && // 从左或右边缘
      deltaY < 50 && // 垂直移动很少
      timeDelta < 300 // 快速手势
    ) {
      onClose();
    }

    detailTouchStartRef.current = null;
  }, [onClose]);

  const handleCategorySelect = (newCategory: string) => {
    if (!transaction) return;
    onUpdate({
      ...transaction,
      category: newCategory,
      is_verified: true
    });
  };

  const handleToggleLock = () => {
    if (!transaction) return;
    onUpdate({
      ...transaction,
      is_verified: !transaction.is_verified
    });
  };

  const handleNoteSave = (newNote: string) => {
    if (!transaction) return;
    onUpdate({
      ...transaction,
      user_note: newNote,
      is_verified: true
    });
  };

  if (!transaction) return null;

  const hasAIData = !!(transaction.ai_category && transaction.ai_reasoning);
  // 用户是否覆盖了AI分类 (如果用户有分类且不同于AI分类)
  const isOverridden = !!transaction.user_category && transaction.user_category !== transaction.ai_category;

  return (
    <motion.div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 z-50 bg-background bg-dot-matrix text-primary font-mono overflow-x-hidden overflow-y-auto"
      style={{
        paddingTop: `max(1rem, ${safeArea.top}px)`,
        paddingBottom: `max(1rem, ${safeArea.bottom}px)`,
        paddingLeft: `max(1rem, ${safeArea.left}px)`,
        paddingRight: `max(1rem, ${safeArea.right}px)`
      }}
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{
        duration: 0.4,
        ease: [0.4, 0.0, 0.2, 1]
      }}
    >
      <div className="w-full max-w-full">
        {/* 带有返回按钮的标题 */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={onClose}
            className="text-dim hover:text-white transition-colors text-2xl"
          >
            ←
          </button>
          <h1 className="text-xl font-bold text-primary flex-1">交易详情</h1>
        </div>

        {/* 详情内容 */}
        <div className="space-y-4 pb-20">
          {/* 金额 - 大显示 */}
          <div className="p-4 bg-card border border-gray-800 rounded-sm">
            <div className="text-dim text-xs mb-2">金额</div>
            <div className={`text-3xl font-bold ${transaction.direction === 'in' ? 'text-income-yellow' : 'text-expense-red'}`}>
              {transaction.direction === 'in' ? '+' : '-'}¥{transaction.amount.toFixed(2)}
            </div>
          </div>

          {/* AI Diagnosis Panel */}
          <div className="border border-gray-800 bg-card/50 rounded-sm overflow-hidden">
            {/* Header: Dark Blue Style (统一 AI & USER) */}
            <div className="bg-[#1a2e25] px-3 py-2 border-b border-gray-800 flex items-center justify-between h-8">
              <span className="text-[10px] text-pixel-green/80 font-bold tracking-wider uppercase">AI DIAGNOSIS</span>
              {!hasAIData && (
                <span className="text-[10px] text-pixel-green/50 animate-pulse">[AWAITING_DATA]</span>
              )}
            </div>
            <div className="p-3 space-y-3">
              {/* Detected Category */}
              <div>
                <div className="text-[10px] text-dim mb-1 font-bold tracking-wider uppercase">DETECTED</div>
                {hasAIData ? (
                  <div className={`text-sm font-bold font-mono ${isOverridden ? 'text-dim line-through opacity-50' : 'text-income-yellow'}`}>
                    [{transaction.ai_category?.toUpperCase()}]
                  </div>
                ) : (
                  <div className="h-5 w-24 bg-white/5 rounded-sm animate-pulse" />
                )}
              </div>

              {/* Reasoning */}
              <div>
                <div className="text-[10px] text-dim mb-1 font-bold tracking-wider uppercase">REASON</div>
                {hasAIData ? (
                  <div className="text-xs text-gray-400 leading-relaxed font-mono">
                    {transaction.ai_reasoning}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="h-3 w-full bg-white/5 rounded-sm animate-pulse" />
                    <div className="h-3 w-3/4 bg-white/5 rounded-sm animate-pulse" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* USER EDIT (Combined Category & Note) */}
          <div className="border border-gray-800 bg-card rounded-sm overflow-hidden">
            {/* Header: Dark Green Style (Unified) */}
            <div className="bg-[#1a2e25] px-3 py-2 border-b border-gray-800 flex items-center h-8">
              <span className="text-[10px] text-pixel-green/80 font-bold tracking-wider uppercase">USER EDIT</span>
            </div>
            
            <div className="p-4 space-y-4">
              {/* Category Section */}
              <div>
                <div className="text-dim text-[10px] font-bold tracking-wider uppercase mb-2">CATEGORY</div>
                <CategorySelector
                  category={transaction.category}
                  isLocked={!!transaction.is_verified}
                  onToggleLock={handleToggleLock}
                  onSelect={handleCategorySelect}
                  categories={categories}
                />
              </div>

              {/* Note Section */}
              <div>
                <div className="text-dim text-[10px] font-bold tracking-wider uppercase mb-2">NOTE</div>
                <NoteEditor
                  note={transaction.user_note || ''}
                  isLocked={!!transaction.is_verified}
                  onSave={handleNoteSave}
                />
              </div>
            </div>
          </div>

          {/* TIME */}
          <div className="p-4 bg-card border border-gray-800 rounded-sm">
            <div className="text-dim text-[10px] font-bold tracking-wider uppercase mb-2">TIME</div>
            <div className="text-primary font-mono text-sm">{format(transaction.originalDate, 'yyyy-MM-dd HH:mm:ss')}</div>
          </div>

          {/* PRODUCT */}
          <div className="p-4 bg-card border border-gray-800 rounded-sm">
            <div className="text-dim text-[10px] font-bold tracking-wider uppercase mb-2">PRODUCT</div>
            <div className="text-primary break-words font-mono text-sm">{transaction.product}</div>
          </div>

          {/* COUNTERPARTY */}
          <div className="p-4 bg-card border border-gray-800 rounded-sm">
            <div className="text-dim text-[10px] font-bold tracking-wider uppercase mb-2">COUNTERPARTY</div>
            <div className="text-primary break-words font-mono text-sm">{transaction.counterparty}</div>
          </div>

          {/* SOURCE */}
          <div className="p-4 bg-card border border-gray-800 rounded-sm">
            <div className="text-dim text-[10px] font-bold tracking-wider uppercase mb-2">SOURCE</div>
            <div className={`font-mono text-sm ${transaction.sourceType === 'wechat' ? 'text-pixel-green' : 'text-alipay-blue'}`}>
              {transaction.sourceType === 'wechat' ? 'WECHAT' : 'ALIPAY'}
            </div>
          </div>

          {/* RAW CLASS */}
          <div className="p-4 bg-card border border-gray-800 rounded-sm">
            <div className="text-dim text-[10px] font-bold tracking-wider uppercase mb-2">RAW CLASS</div>
            <div className="text-dim font-mono text-sm">{transaction.rawClass}</div>
          </div>

          {/* ORIGINAL ID */}
          {transaction.originalId && (
            <div className="p-4 bg-card border border-gray-800 rounded-sm">
              <div className="text-dim text-[10px] font-bold tracking-wider uppercase mb-2">ORIGINAL ID</div>
              <div className="text-dim text-[10px] break-all font-mono">{transaction.originalId}</div>
            </div>
          )}

          {/* TRANSACTION ID */}
          <div className="p-4 bg-card border border-gray-800 rounded-sm">
            <div className="text-dim text-[10px] font-bold tracking-wider uppercase mb-2">TRANSACTION ID</div>
            <div className="text-dim text-[10px] break-all font-mono">{transaction.id}</div>
          </div>
        </div>

        {/* 页脚 */}
        <footer className="mt-16 mb-8 text-center text-dim text-[10px] font-mono opacity-40">
          <p>TRANSACTION_DETAIL_VIEW</p>
        </footer>
      </div>
    </motion.div>
  );
}
