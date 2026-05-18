/**
 * CategoryTrendComposite — 分类时间趋势综合表（第二张图）
 *
 * 内容卡语法。复合视图：环状图 + 列表 + 二级展开柱线融合图。
 * 卡片头部带 Pill 切换（支出/收入）。
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import type {
  InsightsCategoryBreakdownTabData,
  InsightsCategorySlice,
  InsightsTagMonthlyPoint,
} from '@shared/types/application';
import {
  buildCategoryVisualRegistry,
  UNCLASSIFIED_CATEGORY_VISUAL,
  type CategoryVisual,
} from '@ui/shared/categoryVisuals';
import { IC } from './config';

type DirectionTab = 'expense' | 'income';

interface Props {
  expenseData: InsightsCategoryBreakdownTabData;
  incomeData: InsightsCategoryBreakdownTabData;
  categoryDefinitions: Array<{ key: string; description?: string | null }>;
}

export function CategoryTrendComposite({ expenseData, incomeData, categoryDefinitions }: Props) {
  const [activeTab, setActiveTab] = useState<DirectionTab>('expense');
  const [fadeKey, setFadeKey] = useState(0);
  const [highlightedTag, setHighlightedTag] = useState<string | null>(null);
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set());

  const data = activeTab === 'expense' ? expenseData : incomeData;
  const highlightRef = useRef<HTMLDivElement | null>(null);

  /* 分类视觉注册表 */
  const visualRegistry = buildCategoryVisualRegistry(categoryDefinitions);

  const handleTabSwitch = useCallback((tab: DirectionTab) => {
    if (tab === activeTab) return;
    setFadeKey((k) => k + 1);
    setActiveTab(tab);
    setHighlightedTag(null);
    setExpandedTags(new Set());
  }, [activeTab]);

  /* 环状图扇区点击 → 高亮列表项 */
  const handlePieClick = useCallback((tagId: string) => {
    setHighlightedTag((prev) => (prev === tagId ? null : tagId));
  }, []);

  /* 列表项点击 → 展开/折叠二级图 */
  const handleToggleExpand = useCallback((tagId: string) => {
    setExpandedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  }, []);

  /* 高亮联动滚动 */
  useEffect(() => {
    if (highlightedTag && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [highlightedTag]);

  /* 本月总额（环状图中心） */
  const directionLabel = activeTab === 'expense' ? '本月支出' : '本月收入';
  const monthTotal = data.currentMonth.reduce((s, c) => s + c.amount, 0);

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
          分类趋势
        </div>
        <TabPill value={activeTab} onChange={handleTabSwitch} />
      </div>

      <div key={fadeKey} style={{ animation: 'insightsFadeIn 0.4s ease-out' }}>
        {/* 顶部环状图 */}
        {data.currentMonth.length > 0 ? (
          <DonutSection
            slices={data.currentMonth}
            total={monthTotal}
            label={directionLabel}
            visualRegistry={visualRegistry}
            highlightedTag={highlightedTag}
            onPieClick={handlePieClick}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 0', color: IC.sub, fontSize: 13 }}>
            本月暂无数据
          </div>
        )}

        {/* 分类列表 */}
        <div style={{ marginTop: 8 }}>
          {data.currentMonth
            .sort((a, b) => {
              if (a.tagId === '__uncategorized__') return 1;
              if (b.tagId === '__uncategorized__') return -1;
              return b.amount - a.amount;
            })
            .map((slice) => (
              <CategoryListItem
                key={slice.tagId}
                slice={slice}
                isExpense={activeTab === 'expense'}
                isHighlighted={highlightedTag === slice.tagId}
                isExpanded={expandedTags.has(slice.tagId)}
                onToggleExpand={() => handleToggleExpand(slice.tagId)}
                history={data.byTagHistory[slice.tagId] ?? []}
                visualRegistry={visualRegistry}
                highlightRef={highlightedTag === slice.tagId ? highlightRef : undefined}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────
// 子组件：Tab Pill
// ────────────────────────────────

function TabPill({ value, onChange }: { value: DirectionTab; onChange: (t: DirectionTab) => void }) {
  const options: Array<{ key: DirectionTab; label: string }> = [
    { key: 'expense', label: '支出' },
    { key: 'income', label: '收入' },
  ];
  return (
    <div style={{ display: 'flex', borderRadius: 9999, overflow: 'hidden', border: `1.5px solid ${IC.border}` }}>
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

// ────────────────────────────────
// 子组件：环状图
// ────────────────────────────────

function DonutSection({
  slices,
  total,
  label,
  visualRegistry,
  highlightedTag,
  onPieClick,
}: {
  slices: InsightsCategorySlice[];
  total: number;
  label: string;
  visualRegistry: Record<string, CategoryVisual>;
  highlightedTag: string | null;
  onPieClick: (tagId: string) => void;
}) {
  /* 未分类始终在第一个位置（12 点钟方向） */
  const sorted = [...slices].sort((a, b) => {
    if (a.tagId === '__uncategorized__') return -1;
    if (b.tagId === '__uncategorized__') return 1;
    return b.amount - a.amount;
  });

  const getColor = (tagId: string): string => {
    if (tagId === '__uncategorized__') return IC.uncatFill;
    return visualRegistry[tagId]?.overviewColor ?? IC.border;
  };

  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={sorted}
            dataKey="amount"
            nameKey="tagName"
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={76}
            startAngle={90}
            endAngle={-270}
            paddingAngle={1.5}
            onClick={(_, index) => onPieClick(sorted[index].tagId)}
            style={{ cursor: 'pointer', outline: 'none' }}
          >
            {sorted.map((s) => {
              const isHighlighted = highlightedTag === s.tagId;
              return (
                <Cell
                  key={s.tagId}
                  fill={getColor(s.tagId)}
                  stroke={isHighlighted ? IC.dark : IC.white}
                  strokeWidth={isHighlighted ? 2.5 : 1}
                  style={{
                    transform: isHighlighted ? 'scale(1.04)' : 'scale(1)',
                    transformOrigin: 'center',
                    transition: 'all 0.24s ease-in-out',
                    outline: 'none',
                  }}
                />
              );
            })}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {/* 中心空心区 */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 16,
            fontWeight: 700,
            color: IC.dark,
            lineHeight: 1.2,
          }}
        >
          ¥{fmtCompact(total)}
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
    </div>
  );
}

// ────────────────────────────────
// 子组件：分类列表项
// ────────────────────────────────

function CategoryListItem({
  slice,
  isExpense,
  isHighlighted,
  isExpanded,
  onToggleExpand,
  history,
  visualRegistry,
  highlightRef,
}: {
  slice: InsightsCategorySlice;
  isExpense: boolean;
  isHighlighted: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  history: InsightsTagMonthlyPoint[];
  visualRegistry: Record<string, CategoryVisual>;
  highlightRef?: React.Ref<HTMLDivElement>;
}) {
  const isUncat = slice.tagId === '__uncategorized__';
  const visual = isUncat ? null : visualRegistry[slice.tagId];
  const dotColor = isUncat ? UNCLASSIFIED_CATEGORY_VISUAL.overviewColor : (visual?.overviewColor ?? IC.border);

  const hasBudget = isExpense && slice.budget !== null && slice.budget > 0;
  const pct = (slice.share * 100).toFixed(1);

  return (
    <div
      ref={highlightRef}
      style={{
        borderBottom: `0.5px solid ${IC.line}`,
        transition: 'background 0.24s ease-in-out',
        background: isHighlighted ? `${dotColor}11` : 'transparent',
        borderRadius: isHighlighted ? 8 : 0,
      }}
    >
      {/* 主区域 — 可点击展开 */}
      <div
        onClick={onToggleExpand}
        style={{
          padding: '10px 2px',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {/* 第一行：色点 + 标签名 + 金额 + 展开箭头 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* 色点 */}
            {isUncat ? (
              <UncatDot />
            ) : (
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
            )}
            <span
              style={{
                fontFamily: "'Nunito', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                color: isUncat ? IC.sub : IC.dark,
              }}
            >
              {slice.tagName}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 600, color: IC.dark }}>
              ¥{fmtCompact(slice.amount)}
            </span>
            <ExpandArrow expanded={isExpanded} />
          </div>
        </div>

        {/* 第二行 */}
        {hasBudget ? (
          <BudgetProgressBar amount={slice.amount} budget={slice.budget!} color={dotColor} />
        ) : (
          <div style={{ fontSize: 11, color: IC.sub, fontFamily: "'Nunito', sans-serif", paddingLeft: 18 }}>
            <span style={{ fontFamily: "'Space Mono', monospace" }}>¥{fmtCompact(slice.amount)}</span>
            {' · '}
            占{isExpense ? '本月支出' : '本月收入'} {pct}%
          </div>
        )}
      </div>

      {/* 二级展开图表 */}
      {isExpanded && (
        <ExpandedTagChart
          history={history}
          color={dotColor}
        />
      )}
    </div>
  );
}

// ────────────────────────────────
// 子组件：预算进度条
// ────────────────────────────────

function BudgetProgressBar({ amount, budget, color }: { amount: number; budget: number; color: string }) {
  const ratio = Math.min(amount / budget, 1.5);
  const isOver = amount > budget;
  const barColor = isOver ? IC.expense : color;
  const pct = (ratio * 100).toFixed(0);

  return (
    <div style={{ paddingLeft: 18 }}>
      {/* 进度条轨道 */}
      <div style={{ height: 6, borderRadius: 3, background: IC.line, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${Math.min(ratio * 100, 100)}%`,
            borderRadius: 3,
            background: barColor,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <div style={{ fontSize: 10, color: isOver ? IC.expense : IC.sub, marginTop: 3, fontFamily: "'Nunito', sans-serif" }}>
        {isOver ? '已超支 ' : '已用 '}
        <span style={{ fontFamily: "'Space Mono', monospace" }}>
          ¥{fmtCompact(amount)} / ¥{fmtCompact(budget)}
        </span>
        {' '}({pct}%)
      </div>
    </div>
  );
}

// ────────────────────────────────
// 子组件：二级展开柱线融合图
// ────────────────────────────────

function ExpandedTagChart({
  history,
  color,
}: {
  history: InsightsTagMonthlyPoint[];
  color: string;
}) {
  if (history.length < 2) {
    return (
      <div
        style={{
          padding: '16px 0 12px',
          textAlign: 'center',
          color: IC.sub,
          fontSize: 12,
          fontFamily: "'Nunito', sans-serif",
        }}
      >
        该分类历史数据不足，再积累一两个月就能看到趋势
      </div>
    );
  }

  /* 找到最高月 */
  const maxAmount = Math.max(...history.map((h) => h.amount));
  const maxIndex = history.findIndex((h) => h.amount === maxAmount);

  /* 柱体浅色变体 */
  const barFill = `${color}30`;
  const barPeakFill = color;

  const chartData = history.map((h, i) => ({
    ...h,
    label: formatMonthLabel(h.monthKey),
    barFill: i === maxIndex ? barPeakFill : barFill,
    isPeak: i === maxIndex,
  }));

  return (
    <div
      style={{
        padding: '4px 0 12px',
        animation: 'insightsExpandIn 0.36s ease-out',
      }}
    >
      <style>{`
        @keyframes insightsExpandIn {
          0% { opacity: 0; max-height: 0; }
          100% { opacity: 1; max-height: 400px; }
        }
      `}</style>
      <ResponsiveContainer width="100%" height={160}>
        <ComposedChart data={chartData} margin={{ top: 20, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={IC.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: IC.sub, fontFamily: "'Nunito', sans-serif" }}
            axisLine={{ stroke: IC.grid }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fill: IC.sub, fontFamily: "'Space Mono', monospace" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={fmtCompact}
          />
          <Bar
            dataKey="amount"
            radius={[3, 3, 0, 0]}
            barSize={history.length <= 6 ? 20 : 14}
            label={({ x, y, width, value, index }: any) =>
              index === maxIndex ? (
                <text
                  x={x + width / 2}
                  y={y - 6}
                  textAnchor="middle"
                  fill={color}
                  fontSize={10}
                  fontFamily="'Space Mono', monospace"
                  fontWeight={700}
                >
                  ¥{fmtCompact(value)}
                </text>
              ) : null
            }
          >
            {chartData.map((d, i) => (
              <Cell key={i} fill={d.barFill} />
            ))}
          </Bar>
          <Line
            dataKey="amount"
            type="monotone"
            stroke={color}
            strokeWidth={2}
            dot={(props: any) => {
              const { cx, cy, index } = props;
              const isPeak = index === maxIndex;
              return (
                <circle
                  key={index}
                  cx={cx}
                  cy={cy}
                  r={isPeak ? 4 : 2}
                  fill={isPeak ? color : IC.white}
                  stroke={color}
                  strokeWidth={isPeak ? 2 : 1.5}
                />
              );
            }}
            activeDot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────────────────
// 工具函数
// ────────────────────────────────

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 10000) return (n / 10000).toFixed(1) + '万';
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

function formatMonthLabel(monthKey: string): string {
  const parts = monthKey.split('-');
  if (parts.length >= 2) {
    return `${parseInt(parts[1], 10)}月`;
  }
  return monthKey;
}

/** 未分类专用斜杠条纹色点 */
function UncatDot() {
  return (
    <div
      style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: `repeating-linear-gradient(
          -45deg,
          ${IC.uncatStripe},
          ${IC.uncatStripe} 2px,
          ${IC.uncatFill} 2px,
          ${IC.uncatFill} 4px
        )`,
        flexShrink: 0,
      }}
    />
  );
}

/** 展开/折叠箭头 */
function ExpandArrow({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      style={{
        transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        transition: 'transform 0.24s ease',
        flexShrink: 0,
      }}
    >
      <path d="M6 9l6 6 6-6" stroke={IC.sub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
