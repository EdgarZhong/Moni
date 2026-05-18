/**
 * InsightsSummaryBar — 洞察页顶部摘要带
 *
 * 次级卡语法。横向紧凑布局：覆盖范围 + 总收入 + 总支出 + 净值。
 */

import type { InsightsViewData } from '@shared/types/application';
import { IC } from './config';

/** 格式化金额：千分位 + 保留整数 */
function fmt(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 10000) {
    return (n / 10000).toFixed(1) + '万';
  }
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

interface Props {
  summary: InsightsViewData['summary'];
}

export function InsightsSummaryBar({ summary }: Props) {
  const { totalIncome, totalExpense, netCashflow, coverageStart, coverageEnd } = summary;

  /* 覆盖范围文案 */
  const coverageLabel = coverageStart && coverageEnd
    ? coverageStart === coverageEnd
      ? coverageStart
      : `${coverageStart} – ${coverageEnd}`
    : '暂无数据';

  /* 净值颜色 */
  const netColor = netCashflow >= 0 ? IC.income : IC.expense;
  const netPrefix = netCashflow >= 0 ? '+' : '−';

  return (
    <div
      style={{
        background: IC.white,
        border: `1.5px solid ${IC.border}`,
        borderRadius: 10,
        padding: '10px 14px',
        marginBottom: 12,
      }}
    >
      {/* 覆盖范围标签 */}
      <div
        style={{
          fontFamily: "'Nunito', sans-serif",
          fontSize: 11,
          color: IC.sub,
          marginBottom: 8,
          letterSpacing: 0.3,
        }}
      >
        {coverageLabel}
      </div>

      {/* 三组金额横排 */}
      <div style={{ display: 'flex', gap: 0, justifyContent: 'space-between' }}>
        <SummaryCell label="总收入" value={`+${fmt(totalIncome)}`} color={IC.income} />
        <SummaryCell label="总支出" value={`−${fmt(totalExpense)}`} color={IC.expense} />
        <SummaryCell label="净值" value={`${netPrefix}${fmt(Math.abs(netCashflow))}`} color={netColor} />
      </div>
    </div>
  );
}

function SummaryCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div
        style={{
          fontFamily: "'Space Mono', monospace",
          fontSize: 15,
          fontWeight: 700,
          color,
          lineHeight: 1.3,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: "'Nunito', sans-serif",
          fontSize: 10,
          color: IC.sub,
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}
