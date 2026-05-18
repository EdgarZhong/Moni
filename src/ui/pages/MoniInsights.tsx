/**
 * MoniInsights — 洞察页主容器
 *
 * 底部导航一级页面。从上到下：Header → 顶部摘要带 → 收支柱状图 → 分类时间趋势综合表。
 * 整页纵向可滚动，不使用 tab 横切。
 *
 * 当前阶段先消费 mock 数据完成骨架搭建，后续接入 AppFacade.getInsightsViewData()。
 */

import { useState, useEffect } from 'react';
import { APP_HEADER_PADDING_TOP, APP_HEADER_MIN_HEIGHT, C } from '@ui/features/moni-home/config';
import { IC } from '@ui/features/moni-insights/config';
import { Logo } from '@ui/features/moni-home/components';
import { InsightsSummaryBar } from '@ui/features/moni-insights/InsightsSummaryBar';
import { CashflowChart } from '@ui/features/moni-insights/CashflowChart';
import { CategoryTrendComposite } from '@ui/features/moni-insights/CategoryTrendComposite';
import { buildMockInsightsData } from '@ui/features/moni-insights/mockData';
import { appFacade } from '@bootstrap/appFacade';
import type { InsightsViewData, LedgerCategoryDefinition } from '@shared/types';

interface MoniInsightsProps {
  onNavigate?: (page: 'home' | 'entry' | 'settings' | 'insights' | 'inquiry') => void;
}

export default function MoniInsights({ onNavigate }: MoniInsightsProps) {
  const [viewData, setViewData] = useState<InsightsViewData | null>(null);
  const [categoryDefs, setCategoryDefs] = useState<LedgerCategoryDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  /* 加载数据：优先尝试真实数据，回退 mock */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await appFacade.getInsightsViewData();
        if (!cancelled) {
          setViewData(data);
          setIsLoading(false);
        }
      } catch {
        /* facade 方法尚未实现时回退 mock */
        if (!cancelled) {
          setViewData(buildMockInsightsData());
          setIsLoading(false);
        }
      }
    }

    /* 同步读取分类定义（用于视觉注册表） */
    async function loadCategoryDefs() {
      try {
        const homeData = await appFacade.getMoniHomeReadModel();
        if (!cancelled) {
          setCategoryDefs(homeData.categoryDefinitions);
        }
      } catch {
        /* 兜底空数组 */
      }
    }

    void load();
    void loadCategoryDefs();

    return () => { cancelled = true; };
  }, []);

  /* 账本无数据空状态 */
  const isEmpty = viewData && viewData.ledger.earliestTxDate === null;

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: IC.bg,
        fontFamily: "'Nunito', sans-serif",
      }}
    >
      {/* Header — 与设置页结构一致：Logo 居左，页面名称居右 */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: IC.bg,
          padding: `${APP_HEADER_PADDING_TOP} 16px 10px`,
          minHeight: APP_HEADER_MIN_HEIGHT,
          borderBottom: `1px solid ${C.border}22`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Logo />
          <div
            style={{
              minWidth: 56,
              display: 'flex',
              justifyContent: 'flex-end',
              color: C.dark,
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            洞察
          </div>
        </div>
      </div>

      {/* 内容可滚动区 */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '0 12px 24px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {isLoading ? (
          <SkeletonLoading />
        ) : isEmpty ? (
          <EmptyLedgerState onNavigate={onNavigate} />
        ) : viewData ? (
          <>
            {/* 顶部摘要带 */}
            <InsightsSummaryBar summary={viewData.summary} />

            {/* 收支柱状图 */}
            <CashflowChart
              monthData={viewData.cashflowByMonth}
              weekData={viewData.cashflowByWeek}
            />

            {/* 分类时间趋势综合表 */}
            <CategoryTrendComposite
              expenseData={viewData.categoryBreakdown.expense}
              incomeData={viewData.categoryBreakdown.income}
              categoryDefinitions={categoryDefs}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

/** 骨架屏 */
function SkeletonLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SkeletonBlock height={72} />
      <SkeletonBlock height={260} />
      <SkeletonBlock height={400} />
    </div>
  );
}

function SkeletonBlock({ height }: { height: number }) {
  return (
    <div
      style={{
        height,
        borderRadius: 12,
        background: IC.skeletonBg,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
          animation: 'shimmer 1.5s infinite',
        }}
      />
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

/** 账本无数据空状态 */
function EmptyLedgerState({ onNavigate }: { onNavigate?: (page: 'home' | 'entry' | 'settings' | 'insights' | 'inquiry') => void }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 80,
        gap: 16,
      }}
    >
      {/* 空状态插图 */}
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
        <circle cx="40" cy="40" r="36" fill="#F5F0EB" stroke="#DDD" strokeWidth="1.5" />
        <path d="M28 42c0-8 5.5-14 12-14s12 6 12 14" stroke="#CCC" strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="34" cy="36" r="2" fill="#DDD" />
        <circle cx="46" cy="36" r="2" fill="#DDD" />
        <path d="M32 50h16" stroke="#DDD" strokeWidth="1.5" strokeLinecap="round" />
      </svg>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: IC.dark, marginBottom: 4 }}>
          账本暂无数据
        </div>
        <div style={{ fontSize: 13, color: IC.sub }}>
          去导入账单吧
        </div>
      </div>

      <button
        onClick={() => onNavigate?.('entry')}
        style={{
          padding: '8px 24px',
          borderRadius: 12,
          background: IC.dark,
          color: IC.bg,
          fontSize: 13,
          fontWeight: 700,
          border: 'none',
          cursor: 'pointer',
          fontFamily: "'Nunito', sans-serif",
        }}
      >
        去记账页
      </button>
    </div>
  );
}
