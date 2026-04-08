/**
 * OnboardingBanner — 初始化引导横幅（轻量版）
 *
 * 按规格 §8 的预算引导步骤（仅月度总预算设置，允许跳过）：
 * - 条件：账本首次使用且未设置预算时显示
 * - 交互：单行数字输入 + 设置/跳过两个按钮
 * - 保存后调用 BudgetManager.saveMonthlyBudget
 *
 * 横幅以 Memphis 风格内联样式渲染，不依赖 Tailwind。
 */

import React, { useEffect, useState } from 'react';
import { BudgetManager } from '@logic/application/services/BudgetManager';
import { C } from '@ui/features/moni-home/config';

interface OnboardingBannerProps {
  /** 账本 ID */
  ledgerId: string;
  /** 账本是否有交易（有交易后才显示引导） */
  hasTransactions: boolean;
  /** 关闭/完成引导回调 */
  onDismiss: () => void;
}

/**
 * 用于持久化"已跳过或已完成引导"标记的 localStorage 键前缀
 */
const SKIP_KEY_PREFIX = 'moni_budget_onboard_done_';

export const OnboardingBanner: React.FC<OnboardingBannerProps> = ({
  ledgerId,
  hasTransactions,
  onDismiss,
}) => {
  const [visible, setVisible] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [saving, setSaving] = useState(false);

  // 检测是否需要显示：有交易 + 未设置预算 + 未跳过过
  useEffect(() => {
    if (!hasTransactions) return;
    const skipKey = SKIP_KEY_PREFIX + ledgerId;
    if (localStorage.getItem(skipKey)) return;

    let cancelled = false;
    BudgetManager.getInstance().loadBudgetConfig(ledgerId).then((config) => {
      if (cancelled) return;
      // 已设置月度总预算则不再显示
      if (config?.monthly?.amount && config.monthly.amount > 0) return;
      setVisible(true);
    });
    return () => { cancelled = true; };
  }, [ledgerId, hasTransactions]);

  if (!visible) return null;

  const handleSave = async () => {
    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount <= 0) {
      handleSkip();
      return;
    }
    setSaving(true);
    try {
      await BudgetManager.getInstance().saveMonthlyBudget(ledgerId, { amount, currency: 'CNY' });
      localStorage.setItem(SKIP_KEY_PREFIX + ledgerId, '1');
      setVisible(false);
      onDismiss();
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    localStorage.setItem(SKIP_KEY_PREFIX + ledgerId, '1');
    setVisible(false);
    onDismiss();
  };

  return (
    <div style={{
      margin: '8px 16px',
      padding: '12px 14px',
      background: C.warmBg,
      border: `1.5px solid ${C.warmBd}`,
      borderRadius: 12,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {/* 标题 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>
          要不要设一个月预算？
        </span>
        <button
          onClick={handleSkip}
          style={{ fontSize: 11, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
        >
          跳过
        </button>
      </div>

      {/* 说明 */}
      <div style={{ fontSize: 11, color: C.sub, lineHeight: 1.5 }}>
        设置后首页会显示本月预算进度卡，帮你掌握支出节奏
      </div>

      {/* 输入 + 保存 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, color: C.sub, flexShrink: 0 }}>¥</span>
        <input
          type="number"
          min="0"
          step="100"
          placeholder="月预算金额"
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
          style={{
            flex: 1,
            padding: '6px 10px',
            border: `1.5px solid ${C.border}`,
            borderRadius: 8,
            fontSize: 13,
            fontFamily: 'inherit',
            background: C.white,
            color: C.dark,
            outline: 'none',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = C.mint; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = C.border; }}
        />
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '6px 14px',
            background: C.mint,
            color: C.white,
            border: 'none',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            flexShrink: 0,
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? '...' : '设置'}
        </button>
      </div>
    </div>
  );
};
