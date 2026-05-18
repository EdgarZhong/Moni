/**
 * CashflowChart — 收支柱状图（第一张图）
 *
 * 内容卡语法。卡片头部带 Pill 粒度切换（月/周）。
 * 主体：双柱并列（收入+支出）+ 净值折线 + 点击气泡。
 */

import { useState, useCallback } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { InsightsCashflowBucket } from '@shared/types/application';
import { IC, MIN_MONTH_DATA_POINTS, MIN_WEEK_DATA_POINTS, DEFAULT_MAX_BUCKETS } from './config';

type Granularity = 'month' | 'week';

/** 格式化 X 轴标签 */
function formatXLabel(key: string, granularity: Granularity): string {
  if (granularity === 'month') {
    const month = parseInt(key.split('-')[1], 10);
    return `${month}月`;
  }
  return key;
}

/** 格式化金额 */
function fmtAmount(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 10000) return (n / 10000).toFixed(1) + '万';
  if (abs >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(Math.round(n));
}

interface Props {
  monthData: InsightsCashflowBucket[];
  weekData: InsightsCashflowBucket[];
}

export function CashflowChart({ monthData, weekData }: Props) {
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [fadeKey, setFadeKey] = useState(0);

  const handleSwitch = useCallback((g: Granularity) => {
    if (g === granularity) return;
    setFadeKey((k) => k + 1);
    setGranularity(g);
  }, [granularity]);

  const rawData = granularity === 'month' ? monthData : weekData;
  const minPoints = granularity === 'month' ? MIN_MONTH_DATA_POINTS : MIN_WEEK_DATA_POINTS;
  const data = rawData.slice(-DEFAULT_MAX_BUCKETS);
  const isEmpty = data.length < minPoints;

  /* 格式化展示数据 */
  const chartData = data.map((b) => ({
    ...b,
    label: formatXLabel(b.key, granularity),
  }));

  return (
    <div
      style={{
        background: IC.white,
        border: `1.5px solid ${IC.border}`,
        borderRadius: 12,
        padding: '14px 14px 8px',
        marginBottom: 12,
      }}
    >
      {/* 卡片头部 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontFamily: "'Nunito', sans-serif", fontSize: 15, fontWeight: 700, color: IC.dark }}>
          收支
        </div>
        <GranularityPill value={granularity} onChange={handleSwitch} />
      </div>

      {/* 主体 */}
      {isEmpty ? (
        <EmptyState />
      ) : (
        <div
          key={fadeKey}
          style={{
            animation: 'insightsFadeIn 0.4s ease-out',
          }}
        >
          <style>{`
            @keyframes insightsFadeIn {
              0% { opacity: 0; transform: translateY(4px); }
              100% { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={IC.grid} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: IC.sub, fontFamily: "'Nunito', sans-serif" }}
                axisLine={{ stroke: IC.grid }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: IC.sub, fontFamily: "'Space Mono', monospace" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={fmtAmount}
              />
              <ReferenceLine y={0} stroke={IC.border} strokeWidth={1} />
              <Tooltip content={<CashflowTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
              <Bar dataKey="income" fill={IC.income} radius={[3, 3, 0, 0]} barSize={14} name="收入" />
              <Bar dataKey="expense" fill={IC.expense} radius={[3, 3, 0, 0]} barSize={14} name="支出" />
              <Line
                dataKey="net"
                type="monotone"
                stroke={IC.netLine}
                strokeWidth={1.8}
                dot={{ r: 2.5, fill: IC.white, stroke: IC.netLine, strokeWidth: 1.5 }}
                activeDot={{ r: 4, fill: IC.netLine }}
                name="净值"
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* 图例 */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 4, paddingBottom: 4 }}>
            <LegendDot color={IC.income} label="收入" />
            <LegendDot color={IC.expense} label="支出" />
            <LegendLine color={IC.netLine} label="净值" />
          </div>
        </div>
      )}
    </div>
  );
}

/** 粒度切换 Pill */
function GranularityPill({ value, onChange }: { value: Granularity; onChange: (g: Granularity) => void }) {
  const options: Array<{ key: Granularity; label: string }> = [
    { key: 'month', label: '月' },
    { key: 'week', label: '周' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        borderRadius: 9999,
        overflow: 'hidden',
        border: `1.5px solid ${IC.border}`,
      }}
    >
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            style={{
              padding: '3px 14px',
              fontSize: 12,
              fontWeight: active ? 700 : 400,
              fontFamily: "'Nunito', sans-serif",
              background: active ? IC.dark : IC.white,
              color: active ? IC.bg : IC.sub,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** 自定义 tooltip（气泡） */
function CashflowTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const income = payload.find((p: any) => p.dataKey === 'income')?.value ?? 0;
  const expense = payload.find((p: any) => p.dataKey === 'expense')?.value ?? 0;
  const net = payload.find((p: any) => p.dataKey === 'net')?.value ?? 0;

  return (
    <div
      style={{
        background: IC.white,
        border: `1.5px solid ${IC.border}`,
        borderRadius: 10,
        padding: '8px 12px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
        fontSize: 11,
        fontFamily: "'Nunito', sans-serif",
        lineHeight: 1.6,
      }}
    >
      <div style={{ fontWeight: 700, color: IC.dark, marginBottom: 2 }}>{label}</div>
      <div style={{ color: IC.income }}>
        收入 <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 600 }}>¥{fmtAmount(income)}</span>
      </div>
      <div style={{ color: IC.expense }}>
        支出 <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 600 }}>¥{fmtAmount(expense)}</span>
      </div>
      <div style={{ color: net >= 0 ? IC.income : IC.expense }}>
        净值 <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 600 }}>{net >= 0 ? '+' : '−'}¥{fmtAmount(Math.abs(net))}</span>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        height: 180,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: IC.sub,
        fontSize: 13,
        fontFamily: "'Nunito', sans-serif",
      }}
    >
      数据不足以画出趋势，等账单再积累一些
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      <span style={{ fontSize: 10, color: IC.sub, fontFamily: "'Nunito', sans-serif" }}>{label}</span>
    </div>
  );
}

function LegendLine({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 12, height: 2, background: color, borderRadius: 1 }} />
      <span style={{ fontSize: 10, color: IC.sub, fontFamily: "'Nunito', sans-serif" }}>{label}</span>
    </div>
  );
}
