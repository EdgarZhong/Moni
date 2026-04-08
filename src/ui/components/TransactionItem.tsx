import React from 'react';
import type { Transaction } from '@shared/types';
import { CategoryDict } from '@shared/types/metadata';
import { format } from 'date-fns';
import clsx from 'clsx';

interface TransactionItemProps {
  transaction: Transaction;
  onClick?: (transaction: Transaction) => void;
  isActive?: boolean;
  currentFilter?: string;
}

// 心理账户分级点阵
const AmountDots: React.FC<{ amount: number }> = ({ amount }) => {
  let dots = 0;
  if (amount <= 20) dots = 1;
  else if (amount <= 100) dots = 2;
  else if (amount <= 300) dots = 3;
  else if (amount <= 2000) dots = 4;
  else dots = 5;

  return (
    <div className="flex gap-1" title={`Level ${dots}`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className={`w-1.5 h-1.5 ${
            i < dots ? 'bg-expense-red' : 'bg-gray-800'
          }`}
        />
      ))}
    </div>
  );
};

/**
 * Reusable Transaction List Item component
 */
export const TransactionItem: React.FC<TransactionItemProps> = ({
  transaction: t,
  onClick,
  isActive,
  currentFilter = 'ALL'
}) => {
  return (
    <div className={clsx('group relative overflow-hidden rounded-sm')}>
      <div
        className="flex items-start py-3 border-b border-gray-900 hover:bg-white/[0.02] transition-colors relative cursor-pointer"
        onClick={() => onClick?.(t)}
      >
        {/* Source Indicator */}
        <div className="w-6 flex justify-center h-5 items-center">
          <div 
            className={clsx(
              "w-2.5 h-2.5 transition-transform duration-300",
              isActive ? "rotate-45" : "",
              t.sourceType === 'wechat' ? 'bg-pixel-green' : 'bg-alipay-blue'
            )}
          />
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0 pl-2">
          <div className="flex items-baseline gap-2 mb-1 h-5">
            <span className="text-primary truncate font-bold leading-none">
              {currentFilter === 'ALL' && (
                <span className={clsx(
                  "mr-2 text-[10px]",
                  t.category === 'uncategorized' ? "text-expense-red" : "text-income-yellow"
                )}>
                  [{CategoryDict[t.category] || t.category.toUpperCase()}]
                </span>
              )}
              {t.product !== '/' && t.product !== 'Unknown' ? t.product : t.counterparty}
            </span>
            <span className="text-[10px] text-dim truncate">{format(t.originalDate, 'MM-dd')}</span>
          </div>
          <div className="text-xs text-dim truncate max-w-md h-4 flex items-center">
            {t.rawClass} {t.counterparty !== t.product && `• ${t.counterparty}`}
          </div>
        </div>

        {/* Amount & Dots */}
        <div className="w-20 flex flex-col items-end">
          <div className="h-5 flex items-center justify-end mb-1">
            <span className={clsx(
              "font-bold leading-none",
              t.direction === 'in' ? 'text-income-yellow' : 'text-expense-red'
            )}>
              {t.direction === 'in' ? '+' : '-'} {t.amount.toFixed(0)}
            </span>
          </div>
          <div className="h-4 flex items-center">
             {t.direction === 'out' && <AmountDots amount={t.amount} />}
          </div>
        </div>
      </div>
    </div>
  );
};
