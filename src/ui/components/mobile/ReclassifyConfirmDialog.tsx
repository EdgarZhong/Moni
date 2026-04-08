/**
 * ReclassifyConfirmDialog - 渐进式重分类范围确认对话框
 *
 * v5.1 冻结口径：
 * - 新增标签 / 修改描述：先询问"是否重新分类"，再选范围
 * - 删除标签：直接选范围（前置改写已完成，跳过询问步骤）
 * - 用户点击范围按钮时，当场完成 dirtyDates 计算 → 入队 → 自动启动消费
 * - 重命名标签：不触发此对话框
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { LedgerService, type LockedTransactionPreview } from '@logic/application/services/LedgerService';
import { BatchProcessor } from '@logic/application/ai/BatchProcessor';

/**
 * 操作类型决定对话框行为
 * - add: 新增标签，范围选项：[仅未分类] / [全量未锁定]
 * - delete: 删除标签，直接进入范围选择，选项：[仅受影响] / [全量未锁定]
 * - update_desc: 修改描述，范围选项：[仅该标签下未锁定] / [全量未锁定]
 */
export type ReclassifyMode = 'add' | 'delete' | 'update_desc';

export interface ReclassifyConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** 操作类型 */
  mode: ReclassifyMode;
  /** 操作涉及的标签名（delete / update_desc 模式下使用） */
  categoryName?: string;
  /**
   * 删除标签时，前置改写阶段已计算好的受影响日期列表。
   * delete 模式下由父组件传入，避免对话框自行重算。
   */
  affectedDirtyDates?: string[];
}

/**
 * 单个范围选项的定义
 */
interface RangeOption {
  label: string;
  desc: string;
  getDirtyDates: () => string[];
  needsLockedReview: boolean;
}

export const ReclassifyConfirmDialog: React.FC<ReclassifyConfirmDialogProps> = ({
  isOpen,
  onClose,
  mode,
  categoryName,
  affectedDirtyDates = []
}) => {
  /**
   * 对话框内部步骤：
   * - 'ask'：询问是否重新分类（add / update_desc 模式专用）
   * - 'range'：选择重分类范围
   * - 'locked'：展示全量路径下的锁定交易，并允许当场解锁
   */
  const [step, setStep] = useState<'ask' | 'range' | 'locked'>(mode === 'delete' ? 'range' : 'ask');
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [pendingOption, setPendingOption] = useState<RangeOption | null>(null);
  const [lockedTransactions, setLockedTransactions] = useState<LockedTransactionPreview[]>([]);
  const [selectedLockedIds, setSelectedLockedIds] = useState<string[]>([]);

  // 重置内部状态（每次 isOpen 变化时）
  React.useEffect(() => {
    if (isOpen) {
      setStep(mode === 'delete' ? 'range' : 'ask');
      setIsProcessing(false);
      setResultMsg(null);
      setPendingOption(null);
      setLockedTransactions([]);
      setSelectedLockedIds([]);
    }
  }, [isOpen, mode]);

  /**
   * 执行入队并自动启动消费
   * v5.1 约束：范围按钮点击 → 当场入队 → 自动通知消费端启动
   */
  const enqueueAndRun = useCallback(async (dirtyDates: string[]) => {
    setIsProcessing(true);
    try {
      if (dirtyDates.length === 0) {
        setResultMsg('当前范围内没有需要重分类的交易');
        return;
      }

      const service = LedgerService.getInstance();
      const enqueueSuccess = await service.enqueueReclassifyForConfirmedDates(
        dirtyDates,
        `reclassify_${mode}_confirmed`
      );

      if (!enqueueSuccess) {
        setResultMsg(`入队失败，${dirtyDates.length} 个日期已写入补偿文件，下次启动时自动恢复`);
        return;
      }

      const processor = BatchProcessor.getInstance();
      if (processor.isStopping || processor['status'] !== 'ANALYZING') {
        void processor.run().catch((err: unknown) => {
          console.warn('[ReclassifyConfirmDialog] BatchProcessor.run() error:', err);
        });
      }

      setResultMsg(`已入队 ${dirtyDates.length} 个日期，AI 重分类已启动`);
      // 短暂展示结果后关闭
      setTimeout(onClose, 1200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResultMsg(`操作失败：${msg}`);
    } finally {
      setIsProcessing(false);
    }
  }, [mode, onClose]);

  const handleRangeConfirm = useCallback(async (getDirtyDates: () => string[]) => {
    await enqueueAndRun(getDirtyDates());
  }, [enqueueAndRun]);

  const handleUpdateDescriptionConfirm = useCallback(async () => {
    if (!categoryName) {
      setResultMsg('缺少标签信息，无法执行重分类');
      return;
    }

    setIsProcessing(true);
    try {
      const service = LedgerService.getInstance();
      const result = await service.confirmCategoryDescriptionReclassify(categoryName);
      if (!result.success) {
        setResultMsg('条目重置失败，请稍后重试');
        return;
      }
      if (result.dirtyDates.length === 0) {
        setResultMsg('该标签下没有需要重分类的未锁定交易');
        setTimeout(onClose, 1200);
        return;
      }
      if (!result.enqueueSuccess) {
        setResultMsg(`入队失败，${result.dirtyDates.length} 个日期已写入补偿链路，下次启动时自动恢复`);
        return;
      }

      const processor = BatchProcessor.getInstance();
      if (processor.isStopping || processor['status'] !== 'ANALYZING') {
        void processor.run().catch((err: unknown) => {
          console.warn('[ReclassifyConfirmDialog] BatchProcessor.run() error:', err);
        });
      }

      setResultMsg(`已重置并入队 ${result.dirtyDates.length} 个日期，AI 重分类已启动`);
      setTimeout(onClose, 1200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setResultMsg(`操作失败：${msg}`);
    } finally {
      setIsProcessing(false);
    }
  }, [categoryName, onClose]);

  const handleRangeSelect = useCallback((option: RangeOption) => {
    const service = LedgerService.getInstance();
    if (!option.needsLockedReview) {
      void handleRangeConfirm(option.getDirtyDates);
      return;
    }

    const locked = service.getLockedTransactions();
    if (locked.length === 0) {
      void handleRangeConfirm(option.getDirtyDates);
      return;
    }

    setPendingOption(option);
    setLockedTransactions(locked);
    setSelectedLockedIds(locked.map(tx => tx.id));
    setStep('locked');
  }, [handleRangeConfirm]);

  const handleLockedContinue = useCallback(async (unlockSelected: boolean) => {
    if (!pendingOption) {
      return;
    }

    if (!unlockSelected) {
      void handleRangeConfirm(pendingOption.getDirtyDates);
      return;
    }

    setIsProcessing(true);
    try {
      const service = LedgerService.getInstance();
      const result = await service.unlockTransactionsAndReclassify(
        selectedLockedIds,
        pendingOption.getDirtyDates(),
        `reclassify_${mode}_unlock_confirmed`
      );
      if (!result.success) {
        setResultMsg('解锁并入队失败，请稍后重试');
        return;
      }
      if (result.unlockedCount > 0) {
        setLockedTransactions(current =>
          current.filter(tx => !selectedLockedIds.includes(tx.id))
        );
      }
      if (result.dirtyDates.length === 0) {
        setResultMsg('当前范围内没有需要重分类的交易');
        setTimeout(onClose, 1200);
        return;
      }
      if (!result.enqueueSuccess) {
        setResultMsg(`入队失败，${result.dirtyDates.length} 个日期已写入补偿链路，下次启动时自动恢复`);
        return;
      }

      const processor = BatchProcessor.getInstance();
      if (processor.isStopping || processor['status'] !== 'ANALYZING') {
        void processor.run().catch((err: unknown) => {
          console.warn('[ReclassifyConfirmDialog] BatchProcessor.run() error:', err);
        });
      }

      setResultMsg(`已解锁 ${result.unlockedCount} 条交易，并入队 ${result.dirtyDates.length} 个日期`);
      setTimeout(onClose, 1200);
    } finally {
      setIsProcessing(false);
    }
  }, [handleRangeConfirm, mode, onClose, pendingOption, selectedLockedIds]);

  const toggleLockedSelection = useCallback((txId: string) => {
    setSelectedLockedIds(current =>
      current.includes(txId)
        ? current.filter(id => id !== txId)
        : [...current, txId]
    );
  }, []);

  /**
   * 根据操作类型构造范围选项列表
   */
  const buildRangeOptions = useCallback((): RangeOption[] => {
    const service = LedgerService.getInstance();

    if (mode === 'add') {
      return [
        {
          label: '[仅未分类的交易]',
          desc: '仅对未分类且未锁定的交易重新分类',
          getDirtyDates: () => service.collectDirtyDatesByPredicate(
            (r) => !r.is_verified && (!r.category || r.category === 'uncategorized')
          ),
          needsLockedReview: false
        },
        {
          label: '[全量（未锁定的交易）]',
          desc: '对所有未锁定交易重新分类（已锁定交易受保护，不受影响）',
          getDirtyDates: () => service.collectDirtyDatesForAll(),
          needsLockedReview: true
        }
      ];
    }

    if (mode === 'delete') {
      return [
        {
          label: '[仅受影响的交易]',
          desc: `仅对原属于被删标签、已重置为未分类的交易重新分类（${affectedDirtyDates.length} 天）`,
          getDirtyDates: () => affectedDirtyDates,
          needsLockedReview: false
        },
        {
          label: '[全量（所有未锁定的交易）]',
          desc: '对所有未锁定交易重新分类（已锁定交易受保护，不受影响）',
          getDirtyDates: () => service.collectDirtyDatesForAll(),
          needsLockedReview: true
        }
      ];
    }

    return [];
  }, [mode, affectedDirtyDates]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-6 pointer-events-none">
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={!isProcessing ? onClose : undefined}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px] pointer-events-auto"
          />

          {/* 对话框主体 */}
          <motion.div
            initial={{ scale: 0.93, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.93, opacity: 0, y: 12 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="pointer-events-auto relative w-full max-w-sm bg-zinc-950 border border-gray-700 rounded shadow-[0_0_20px_rgba(255,255,255,0.04)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <span className="text-[10px] font-mono text-pixel-green tracking-widest">
                {step === 'ask' ? '[RECLASSIFY?]' : step === 'range' ? '[SELECT_RANGE]' : '[LOCKED_REVIEW]'}
              </span>
              {!isProcessing && (
                <button
                  onClick={onClose}
                  className="text-dim text-xs font-mono hover:text-white transition-colors"
                >
                  [×]
                </button>
              )}
            </div>

            <div className="p-4 space-y-3">
              {/* 结果反馈 */}
              {resultMsg && (
                <div className="px-3 py-2 rounded text-[11px] font-mono text-pixel-green bg-pixel-green/5 border border-pixel-green/20">
                  {resultMsg}
                </div>
              )}

              {/* 步骤 1：询问是否重新分类 */}
              {step === 'ask' && !resultMsg && (
                <>
                  <p className="text-xs font-mono text-gray-300 leading-relaxed">
                    {mode === 'update_desc'
                      ? `标签 [${categoryName}] 的说明已更新。若现在重新分类，将把该标签下所有未锁定条目重置为未分类、同步清理对应实例库记录，并立即入队。`
                      : '标签已更新。是否现在对相关交易执行重新分类？'}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={onClose}
                      className="flex-1 py-2 border border-gray-700 rounded text-[11px] font-mono text-dim hover:border-gray-500 transition-colors"
                    >
                      [暂时跳过]
                    </button>
                    <button
                      onClick={() => {
                        if (mode === 'update_desc') {
                          void handleUpdateDescriptionConfirm();
                          return;
                        }
                        setStep('range');
                      }}
                      disabled={isProcessing}
                      className="flex-1 py-2 border border-pixel-green/40 rounded text-[11px] font-mono text-pixel-green hover:bg-pixel-green/10 transition-colors"
                    >
                      [现在重新分类]
                    </button>
                  </div>
                  {isProcessing && (
                    <div className="text-[10px] font-mono text-dim text-center animate-pulse">
                      [正在重置条目并启动分类...]
                    </div>
                  )}
                </>
              )}

              {/* 步骤 2：选择范围 */}
              {step === 'range' && !resultMsg && (
                <>
                  {mode === 'delete' && (
                    <p className="text-[11px] font-mono text-dim leading-relaxed">
                      标签已删除，关联交易已重置为未分类。请选择重新分类的范围：
                    </p>
                  )}
                  {mode !== 'delete' && (
                    <p className="text-[11px] font-mono text-dim leading-relaxed">
                      请选择需要重新分类的交易范围：
                    </p>
                  )}
                  <div className="space-y-2">
                    {buildRangeOptions().map((option) => (
                      <button
                        key={option.label}
                        disabled={isProcessing}
                        onClick={() => handleRangeSelect(option)}
                        className="w-full p-3 text-left border border-gray-700 rounded
                          hover:border-pixel-green/50 hover:bg-pixel-green/5
                          disabled:opacity-40 disabled:cursor-not-allowed
                          transition-colors group"
                      >
                        <div className="text-[11px] font-mono text-pixel-green group-hover:text-pixel-green/90">
                          {option.label}
                        </div>
                        <div className="text-[10px] font-mono text-dim mt-0.5 leading-relaxed">
                          {option.desc}
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* 处理中指示 */}
                  {isProcessing && (
                    <div className="text-[10px] font-mono text-dim text-center animate-pulse">
                      [正在入队并启动分类...]
                    </div>
                  )}
                </>
              )}

              {step === 'locked' && !resultMsg && pendingOption && (
                <>
                  <p className="text-[11px] font-mono text-dim leading-relaxed">
                    当前存在 {lockedTransactions.length} 条锁定交易。你可以保留锁定保护继续重分类，也可以先勾选并解锁需要纳入本次全量重分类的交易。
                  </p>
                  <div className="flex gap-2">
                    <button
                      disabled={isProcessing}
                      onClick={() => setSelectedLockedIds(lockedTransactions.map(tx => tx.id))}
                      className="flex-1 py-2 border border-gray-700 rounded text-[10px] font-mono text-dim hover:border-gray-500 disabled:opacity-40"
                    >
                      [全选解锁]
                    </button>
                    <button
                      disabled={isProcessing}
                      onClick={() => setSelectedLockedIds([])}
                      className="flex-1 py-2 border border-gray-700 rounded text-[10px] font-mono text-dim hover:border-gray-500 disabled:opacity-40"
                    >
                      [全部保留]
                    </button>
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                    {lockedTransactions.map((tx) => {
                      const checked = selectedLockedIds.includes(tx.id);
                      return (
                        <button
                          key={tx.id}
                          type="button"
                          disabled={isProcessing}
                          onClick={() => toggleLockedSelection(tx.id)}
                          className={`w-full p-3 text-left border rounded transition-colors ${
                            checked
                              ? 'border-pixel-green/50 bg-pixel-green/5'
                              : 'border-gray-800 bg-black/20 hover:border-gray-600'
                          } disabled:opacity-40`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[11px] font-mono text-primary truncate">
                                {tx.product || tx.counterparty || '未命名交易'}
                              </div>
                              <div className="text-[10px] font-mono text-dim mt-1 truncate">
                                {format(tx.originalDate, 'MM-dd HH:mm')} • {tx.counterparty || tx.rawClass || 'UNKNOWN'}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className={`text-[11px] font-mono ${tx.direction === 'in' ? 'text-income-yellow' : 'text-expense-red'}`}>
                                {tx.direction === 'in' ? '+' : '-'}{tx.amount.toFixed(0)}
                              </div>
                              <div className="text-[10px] font-mono text-dim mt-1">
                                {checked ? '[将解锁]' : '[保持锁定]'}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      disabled={isProcessing}
                      onClick={() => setStep('range')}
                      className="flex-1 py-2 border border-gray-700 rounded text-[11px] font-mono text-dim hover:border-gray-500 disabled:opacity-40"
                    >
                      [返回范围]
                    </button>
                    <button
                      disabled={isProcessing}
                      onClick={() => void handleLockedContinue(false)}
                      className="flex-1 py-2 border border-gray-700 rounded text-[11px] font-mono text-dim hover:border-gray-500 disabled:opacity-40"
                    >
                      [保留锁定继续]
                    </button>
                  </div>
                  <button
                    disabled={isProcessing}
                    onClick={() => void handleLockedContinue(true)}
                    className="w-full py-2 border border-pixel-green/40 rounded text-[11px] font-mono text-pixel-green hover:bg-pixel-green/10 disabled:opacity-40"
                  >
                    [解锁所选并继续]
                  </button>
                  {isProcessing && (
                    <div className="text-[10px] font-mono text-dim text-center animate-pulse">
                      [正在同步解锁并启动分类...]
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
