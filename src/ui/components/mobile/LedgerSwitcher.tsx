import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { triggerHaptic, HapticFeedbackLevel } from '@system/device/haptics';
import { DEFAULT_LEDGER_NAME, type LedgerMeta } from '@system/filesystem/fs-storage';

interface LedgerSwitcherProps {
  ledgers: LedgerMeta[];
  activeLedger: string;
  onSwitch: (name: string) => void;
  onCreate: (name: string) => void;
  onDelete: (name: string) => void;
  isLoading?: boolean;
  onOpen?: () => void;
}

// 删除确认覆盖层组件 - 定义在组件外部以避免重复创建
interface DeleteOverlayProps {
  ledgerName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

const DeleteOverlay: React.FC<DeleteOverlayProps> = ({ ledgerName, onCancel, onConfirm }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.95 }}
    transition={{ duration: 0.2 }}
    className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-6 text-center backdrop-blur-sm"
    onClick={(e) => e.stopPropagation()}
  >
    <div className="w-12 h-12 rounded-full bg-red-900/20 flex items-center justify-center mb-4 border border-red-900/50">
      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    </div>

    <h3 className="text-red-500 font-mono text-lg mb-2 tracking-wide">确认删除?</h3>

    <p className="text-gray-400 text-xs font-mono mb-8 leading-relaxed">
      将永久删除账本<br/>
      <span className="text-white text-sm font-bold border-b border-gray-700 pb-0.5 mx-1">{ledgerName}</span>
    </p>

    <div className="flex gap-3 w-full">
      <button
        onClick={onCancel}
        className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-mono rounded border border-gray-700 transition-colors"
      >
        取消
      </button>
      <button
        onClick={onConfirm}
        className="flex-1 px-4 py-3 bg-red-900/20 hover:bg-red-900/40 text-red-400 text-xs font-mono rounded border border-red-900/50 transition-colors shadow-[0_0_10px_rgba(220,38,38,0.1)]"
      >
        确认删除
      </button>
    </div>
  </motion.div>
);

/**
 * [CHOOSE_LEDGER]组件
 * 采用与 DateRangePicker 相同的二级面板样式
 * 包含 Trigger (Header Button) 和 Modal (Portal)
 * 使用 layoutId 实现平滑过渡动画
 * 
 * 2024-05 Refactor:
 * - 移除全局删除弹窗，改为面板内覆盖层 (DeleteOverlay)
 * - 优化 LedgerItem 左滑交互 (Revealing Action)
 * - 集成 Trigger 按钮，实现 Header 按钮到 Modal 的 morphing 动画
 */
export const LedgerSwitcher: React.FC<LedgerSwitcherProps> = ({
  ledgers,
  activeLedger,
  onSwitch,
  onCreate,
  onDelete,
  isLoading = false,
  onOpen
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newLedgerName, setNewLedgerName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  // 输入框引用，用于自动聚焦
  const inputRef = useRef<HTMLInputElement>(null);

  // 打开面板时自动聚焦输入框
  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  const handleOpen = async () => {
    if (isLoading) return;
    await triggerHaptic(HapticFeedbackLevel.LIGHT);
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setIsClosing(false);
    setIsOpen(true);
    requestAnimationFrame(() => {
      onOpen?.();
    });
  };

  const handleClose = async () => {
    await triggerHaptic(HapticFeedbackLevel.LIGHT);
    setIsClosing(true);
    setIsOpen(false);
    setIsAdding(false);
    setDeleteConfirm(null);
    setNewLedgerName('');
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
    }
    closeTimeoutRef.current = window.setTimeout(() => {
      setIsClosing(false);
      closeTimeoutRef.current = null;
    }, 320);
  };

  // 验证账本名称：仅允许中文、字母、数字、下划线，最大 50 字符
  const isValidName = (name: string): boolean => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 50) return false;
    const validPattern = /^[\u4e00-\u9fa5a-zA-Z0-9_]+$/;
    return validPattern.test(trimmed);
  };

  const canSave = isValidName(newLedgerName);

  const handleAddClick = async () => {
    await triggerHaptic(HapticFeedbackLevel.LIGHT);
    setIsAdding(true);
    setNewLedgerName('');
  };

  const handleSaveClick = async () => {
    if (!canSave) return;

    await triggerHaptic(HapticFeedbackLevel.MEDIUM);
    onCreate(newLedgerName.trim());
    setIsAdding(false);
    setNewLedgerName('');
    // 保持打开状态
  };

  const handleCancelClick = async () => {
    await triggerHaptic(HapticFeedbackLevel.LIGHT);
    setIsAdding(false);
    setNewLedgerName('');
  };

  const handleLedgerClick = async (name: string) => {
    if (name === activeLedger) return;

    await triggerHaptic(HapticFeedbackLevel.MEDIUM);
    onSwitch(name);
  };

  const handleDeleteClick = async (name: string) => {
    await triggerHaptic(HapticFeedbackLevel.HEAVY);
    onDelete(name);
    setDeleteConfirm(null);
  };

  const handleBackdropClick = async () => {
    await handleClose();
  };

  const transition = {
    type: "tween",
    ease: "easeInOut",
    duration: 0.3
  } as const;

  const isTriggerHidden = isOpen || isClosing;

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <div className="flex-1 relative">
        <motion.button
          layoutId="ledger-switcher-container"
          key="trigger"
          transition={transition}
          onClick={handleOpen}
          disabled={isLoading}
          className={`
            w-full
            relative overflow-hidden group
            flex justify-center items-center gap-2 px-3 py-3
            font-pixel text-[10px] tracking-tight
            border border-gray-800
            bg-card
            ${isTriggerHidden ? 'opacity-0 pointer-events-none transition-none' : 'opacity-100 transition-colors duration-300'}
            disabled:opacity-50 disabled:cursor-default
            enabled:hover:border-gray-600 enabled:hover:bg-white/5 enabled:hover:text-pixel-green
          `}
        >
          <span className="relative z-10">
            [CHOOSE_LEDGER]
          </span>
        </motion.button>
      </div>

      {/* Portal Modal */}
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
              {/* 背景遮罩 */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={handleBackdropClick}
              />

              {/* 内容容器 */}
              <motion.div
                layoutId="ledger-switcher-container"
                transition={transition}
                className="relative z-10 w-full bg-card border border-gray-800 rounded-lg shadow-2xl flex flex-col overflow-hidden"
                style={{ padding: '1.25rem', width: '85vw', maxWidth: '400px', minHeight: '300px' }}
                onClick={(e) => e.stopPropagation()}
                ref={containerRef}
              >
                {/* 覆盖层：删除确认 */}
                <AnimatePresence>
                  {deleteConfirm && (
                    <DeleteOverlay
                      ledgerName={deleteConfirm}
                      onCancel={() => setDeleteConfirm(null)}
                      onConfirm={() => handleDeleteClick(deleteConfirm)}
                    />
                  )}
                </AnimatePresence>

                {/* 标题 */}
                <div className="flex justify-center w-full mb-4">
                  <div className="text-dim text-[10px] font-mono tracking-wider">
                    [CHOOSE_LEDGER]
                  </div>
                </div>

                {/* 账本列表 */}
                <div className="flex flex-col gap-1 mb-4 max-h-[50vh] overflow-y-auto custom-scrollbar flex-grow">
                  <AnimatePresence>
                    {ledgers.map((ledger) => (
                      <LedgerItem
                        key={ledger.name}
                        ledger={ledger}
                        isActive={ledger.name === activeLedger}
                        isDefault={ledger.name === DEFAULT_LEDGER_NAME}
                        onClick={() => handleLedgerClick(ledger.name)}
                        onDeleteClick={() => setDeleteConfirm(ledger.name)}
                        disabled={isAdding || !!deleteConfirm}
                      />
                    ))}
                  </AnimatePresence>
                </div>

                {/* 添加按钮 / 添加面板 */}
                <div className="border-t border-gray-800/50 pt-3 mt-auto">
                  <AnimatePresence mode="wait">
                    {!isAdding ? (
                      <motion.button
                        key="add-button"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.15 }}
                        onClick={handleAddClick}
                        disabled={!!deleteConfirm}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2
                          text-pixel-green text-xs font-mono
                          border border-dashed border-gray-700 rounded
                          hover:border-pixel-green/50 hover:bg-white/5
                          transition-all duration-200 disabled:opacity-30"
                      >
                        <span className="text-lg leading-none">+</span>
                        <span>ADD Ledger</span>
                      </motion.button>
                    ) : (
                      <motion.div
                        key="add-panel"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex flex-col gap-2"
                      >
                        <input
                          ref={inputRef}
                          type="text"
                          value={newLedgerName}
                          onChange={(e) => setNewLedgerName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && canSave) {
                              handleSaveClick();
                            } else if (e.key === 'Escape') {
                              handleCancelClick();
                            }
                          }}
                          placeholder="输入账本名称（最多 50 字符）"
                          className="w-full px-3 py-2 bg-black/30 border border-gray-700 rounded
                            text-white text-sm font-mono placeholder:text-dim/50
                            focus:outline-none focus:border-pixel-green/50 transition-colors"
                          maxLength={50}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleCancelClick}
                            className="flex-1 px-3 py-2 bg-gray-800 hover:bg-gray-700
                              text-white text-xs font-mono rounded transition-colors"
                          >
                            取消
                          </button>
                          <button
                            onClick={handleSaveClick}
                            disabled={!canSave}
                            className="flex-1 px-3 py-2 bg-pixel-green/20 hover:bg-pixel-green/30
                              text-pixel-green text-xs font-mono rounded transition-colors
                              border border-pixel-green/30
                              disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            保存
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};

/**
 * 账本列表项组件
 * 支持左划删除手势 - 露出右侧删除图标
 */
const LedgerItem: React.FC<{
  ledger: LedgerMeta;
  isActive: boolean;
  isDefault: boolean;
  onClick: () => void;
  onDeleteClick: () => void;
  disabled: boolean;
}> = ({ ledger, isActive, isDefault, onClick, onDeleteClick, disabled }) => {
  const x = useMotionValue(0);
  const DRAG_THRESHOLD = -80; // 左划触发删除的距离
  
  // 背景图标的不透明度根据拖动距离变化
  const iconOpacity = useTransform(x, [0, -40, -80], [0, 0.5, 1]);
  const iconScale = useTransform(x, [0, -80], [0.8, 1]);

  // 当从 disabled 状态恢复时（即取消删除操作后），强制滑块归位
  useEffect(() => {
    if (!disabled) {
      animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
    }
  }, [disabled, x]);

  const handleDragEnd = async (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    const { offset } = info;

    // 左划超过阈值时触发删除确认
    if (offset.x < DRAG_THRESHOLD) {
      await triggerHaptic(HapticFeedbackLevel.MEDIUM);
      onDeleteClick();
    }
    // 无论是否触发，都回弹（因为删除是确认后操作，或者取消后操作）
    // Framer Motion 的 drag 会自动处理回弹，除非我们设置 dragElastic={0} 且不让它回弹
    // 这里我们依赖默认的回弹行为，因为触发确认框后，列表项应该回到原位
  };

  return (
    <div className="relative overflow-hidden rounded group">
      {/* 右侧背景 - 红色删除区域 */}
      {!isDefault && (
        <div className="absolute inset-y-0 right-0 w-[100px] bg-red-900/20 flex items-center justify-end px-6 rounded">
          <motion.div style={{ opacity: iconOpacity, scale: iconScale }}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-red-500"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </motion.div>
        </div>
      )}

      {/* 可拖动的内容层 */}
      <motion.div
        style={{ x }}
        drag={!isDefault && !disabled ? 'x' : false}
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.1}
        dragSnapToOrigin={true}
        onDragEnd={handleDragEnd}
        onClick={onClick}
        className={`
          relative z-10 flex items-center gap-3 px-3 py-2.5 rounded
          cursor-pointer transition-colors duration-200
          ${isActive ? 'bg-zinc-800' : 'bg-zinc-950 hover:bg-zinc-900'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        {/* 激活指示器 - 主题绿色像素点 */}
        {isActive && (
          <motion.div
            layoutId="active-ledger-indicator"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ duration: 0.15 }}
            className="w-1.5 h-1.5 bg-pixel-green shadow-[0_0_6px_rgba(16,185,129,0.8)]"
          />
        )}

        {/* 占位符，保持对齐 */}
        {!isActive && <div className="w-1.5 h-1.5" />}

        {/* 账本名称 */}
        <span className={`text-sm font-mono ${isActive ? 'text-white' : 'text-gray-300'}`}>
          {ledger.name}
        </span>
        
        {/* 左滑提示 (仅在非激活且非默认时显示，稍微提示用户可以操作) */}
        {!isDefault && !isActive && !disabled && (
          <div className="ml-auto opacity-0 group-hover:opacity-30 transition-opacity">
            <div className="w-1 h-4 bg-gray-600 rounded-full" />
          </div>
        )}
      </motion.div>
    </div>
  );
};
