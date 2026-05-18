/**
 * MoniInquiry — 请教页主容器
 *
 * 底部导航 5-Tab 一级页面（§2.3 审计队列视图组织语义）。
 * 规格：docs/design/spec/SPEC_Inquiry_Page.md
 *
 * 与并行 Agent 解耦约定：
 * - 本文件不修改 AppRoot / BottomNav / 任何已存在页面
 * - onNavigate 使用 string 而非联合类型，避免与 BottomNav activePage 强绑定
 * - 路由挂载由导航改造 Agent 完成
 *
 * 拖拽纠错说明：
 * - 左滑确认、批量确认已实现
 * - 长按拖拽纠错（复用首页 DragDetailPanel）是跨组件集成，
 *   需路由改造 Agent 在 AppRoot 层与 DragDetailPanel 一同接入，
 *   本页仅保留条目 onOpenDetail 入口供后续接线
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { appFacade } from '@bootstrap/appFacade';
import type { FullTransactionRecord } from '@shared/types/metadata';
import type {
  InquiryFilter,
  InquiryViewData,
  InquiryDayGroup,
  InquiryViewStateCode,
  LedgerCategoryDefinition,
} from '@shared/types';
import {
  APP_HEADER_PADDING_TOP,
  APP_HEADER_MIN_HEIGHT,
} from '@ui/features/moni-home/config';
import {
  C,
  CONFIDENCE_BG,
  CONFIDENCE_BORDER,
  CONFIDENCE_LABEL,
  ANIM,
  SWIPE_CONFIRM_THRESHOLD_PX,
  SWIPE_DIRECTION_RATIO,
  FILTER_LABELS,
  EMPTY_STATE_CONFIG,
} from '@ui/features/moni-inquiry/config';
import { TransactionDetailPage } from '@ui/features/moni-home/TransactionDetailPage';
import type { HomeTransaction } from '@ui/features/moni-home/components';
import { buildCategoryVisualRegistry } from '@ui/shared/categoryVisuals';

// ──────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────

interface MoniInquiryProps {
  onNavigate?: (page: 'home' | 'entry' | 'settings' | 'insights' | 'inquiry') => void;
}

// ──────────────────────────────────────────────
// 工具函数
// ──────────────────────────────────────────────

/** §2.3-D.3 可操作性判定（前端实时派生） */
function isOperable(t: FullTransactionRecord, filter: InquiryFilter): boolean {
  if (t.ai_needs_review) return true; // 不变量1：ai_needs_review=true 任何 filter 下均可操作
  // 不变量2：confidence_rank >= filter_rank 时可操作
  const confidenceRank = (c: string) => (c === 'low' ? 3 : c === 'medium' ? 2 : 1);
  const filterRank = filter === 'low' ? 3 : filter === 'medium' ? 2 : 1;
  return confidenceRank(t.ai_confidence) >= filterRank;
}

/** FullTransactionRecord → HomeTransaction 转换（供 TransactionDetailPage 使用） */
function toHomeTransaction(r: FullTransactionRecord): HomeTransaction {
  const timeHHmm = r.time.length >= 16 ? r.time.slice(11, 16) : '--:--';
  const dateLabel = r.time.slice(0, 10).replace(/-/g, '/');
  return {
    id: r.id,
    originalId: r.id,
    n: r.counterparty || r.product || r.rawClass || '未知商户',
    a: r.amount,
    t: timeHHmm,
    fullTimeLabel: `${dateLabel} ${timeHHmm}`,
    sourceType: (r.sourceType as HomeTransaction['sourceType']) ?? 'manual',
    sourceLabel: r.sourceType === 'wechat' ? '微信' : r.sourceType === 'alipay' ? '支付宝' : '手记',
    pay: r.paymentMethod || '',
    rawClass: r.rawClass || null,
    counterparty: r.counterparty || null,
    product: r.product || null,
    transactionStatus: r.transactionStatus || null,
    userCat: r.user_category || null,
    aiCat: r.ai_category || null,
    reason: r.ai_reasoning || null,
    userNote: r.user_note || null,
    remark: r.remark || null,
    direction: r.direction,
    isVerified: r.is_verified,
    updatedAt: r.updated_at || null,
    ih: 0,
  };
}

/** 格式化日期键为"M月D日"（与首页日卡片格式一致） */
function formatDayLabel(dateKey: string): string {
  const [, m, d] = dateKey.split('-');
  return `${parseInt(m, 10)}月${parseInt(d, 10)}日`;
}

// ──────────────────────────────────────────────
// 主页面
// ──────────────────────────────────────────────

export default function MoniInquiry({ onNavigate }: MoniInquiryProps) {
  // 会话视图快照（§2.3-E）
  const [filter, setFilter] = useState<InquiryFilter>('medium');
  const [viewData, setViewData] = useState<InquiryViewData | null>(null);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [filterFading, setFilterFading] = useState(false);

  // 批量模式（§11）
  const [bulkActive, setBulkActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hasUserActed, setHasUserActed] = useState(false);

  // 交易详情叠加层（§10）
  const [detailTxId, setDetailTxId] = useState<string | null>(null);
  const [detailDayId, setDetailDayId] = useState<string>('');
  const detailSnapshotRef = useRef<FullTransactionRecord | null>(null);

  const [categoryDefs, setCategoryDefs] = useState<LedgerCategoryDefinition[]>([]);

  // ── 数据加载与实时订阅 ──────────────────────

  useEffect(() => {
    setViewData(appFacade.getInquiryViewData(filter));
  }, [filter]);

  useEffect(() => {
    return appFacade.subscribe(() => {
      setViewData(appFacade.getInquiryViewData(filter));
    });
  }, [filter]);

  useEffect(() => {
    let cancelled = false;
    appFacade.getMoniHomeReadModel().then((home) => {
      if (!cancelled) setCategoryDefs(home.categoryDefinitions);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const categoryVisuals = useMemo(
    () => buildCategoryVisualRegistry(categoryDefs),
    [categoryDefs]
  );
  const availableCategories = useMemo(
    () => categoryDefs.map((d) => d.key),
    [categoryDefs]
  );

  // ── Filter 切换（§14.5 淡出 → 重算 → 淡入） ──

  const handleFilterChange = useCallback((f: InquiryFilter) => {
    setFilterDropdownOpen(false);
    if (f === filter) return;
    setFilterFading(true);
    setTimeout(() => {
      setFilter(f);
      setFilterFading(false);
    }, ANIM.filterFadeOutMs);
  }, [filter]);

  // ── 条目确认 ────────────────────────────────

  const markUserActed = useCallback(() => setHasUserActed(true), []);

  const handleConfirmItem = useCallback((id: string) => {
    appFacade.confirmInquiryItem(id);
    markUserActed();
  }, [markUserActed]);

  const handleBatchConfirm = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    appFacade.batchConfirmInquiryItems(ids);
    markUserActed();
    setBulkActive(false);
    setSelectedIds(new Set());
  }, [selectedIds, markUserActed]);

  // ── 批量模式 ─────────────────────────────────

  const handleEnterBulk = useCallback(() => {
    setBulkActive(true);
    setSelectedIds(new Set());
  }, []);

  const handleExitBulk = useCallback(() => {
    setBulkActive(false);
    setSelectedIds(new Set());
  }, []);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectDay = useCallback((dayGroup: InquiryDayGroup, select: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const t of dayGroup.transactions) {
        if (isOperable(t, filter)) {
          if (select) next.add(t.id);
          else next.delete(t.id);
        }
      }
      return next;
    });
  }, [filter]);

  // ── 交易详情页（§10） ────────────────────────

  const handleOpenDetail = useCallback((tx: FullTransactionRecord, dayId: string) => {
    detailSnapshotRef.current = { ...tx };
    setDetailTxId(tx.id);
    setDetailDayId(dayId);
  }, []);

  const handleCloseDetail = useCallback(() => {
    const before = detailSnapshotRef.current;
    if (before) {
      const current = appFacade.getInquiryViewData(filter);
      const stillInView = current.days
        .flatMap((d) => d.transactions)
        .find((t) => t.id === before.id);
      // 条目已出列、或 is_verified/user_category/user_note 有变化 → 标记已操作
      if (
        !stillInView ||
        stillInView.is_verified !== before.is_verified ||
        stillInView.user_category !== before.user_category ||
        stillInView.user_note !== before.user_note
      ) {
        markUserActed();
      }
    }
    detailSnapshotRef.current = null;
    setDetailTxId(null);
  }, [filter, markUserActed]);

  const handleUpdateCategory = useCallback((txId: string, category: string, reasoning?: string) => {
    appFacade.updateTransactionCategory(txId, category, reasoning ?? '');
  }, []);

  const handleUpdateUserReasoning = useCallback((txId: string, note: string) => {
    appFacade.updateUserReasoning(txId, note);
  }, []);

  const handleSetVerification = useCallback((txId: string, v: boolean) => {
    appFacade.setTransactionVerification(txId, v);
  }, []);

  // ── 渲染计算 ─────────────────────────────────

  const viewStateCode = viewData?.viewStateCode ?? null;
  const isAiRunning = viewData?.isAiRunning ?? false;
  const isEmptyView =
    viewStateCode === 'NO_BILLS' ||
    viewStateCode === 'NO_REVIEW_YET' ||
    viewStateCode === 'ALL_REVIEWED' ||
    viewStateCode === 'FILTER_EMPTY';

  // 在详情叠加层中查找当前条目（可能已出列则为 null）
  const detailTx = useMemo(() => {
    if (!detailTxId || !viewData) return null;
    for (const day of viewData.days) {
      const found = day.transactions.find((t) => t.id === detailTxId);
      if (found) return found;
    }
    return null;
  }, [detailTxId, viewData]);

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: C.bg,
        fontFamily: "'Nunito', sans-serif",
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* ── Header（§3.1）─────────────────────── */}
      <InquiryHeader
        filter={filter}
        dropdownOpen={filterDropdownOpen}
        onToggleDropdown={() => setFilterDropdownOpen((v) => !v)}
        onFilterChange={handleFilterChange}
        onDismissDropdown={() => setFilterDropdownOpen(false)}
      />

      {/* ── 主体（filter 切换期间整体淡出/入）─── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          opacity: filterFading ? 0 : 1,
          transition: filterFading
            ? `opacity ${ANIM.filterFadeOutMs}ms ease`
            : `opacity ${ANIM.filterFadeInMs}ms ease`,
        }}
      >
        {/* AI 正在运行常驻提示（RUNNING_NON_EMPTY，§12.3） */}
        {isAiRunning && !isEmptyView && <RunningBanner />}

        {/* 批量操作栏 / 批量化入口（§11） */}
        {bulkActive ? (
          <BulkActionBar
            selectedCount={selectedIds.size}
            onConfirm={handleBatchConfirm}
            onExit={handleExitBulk}
          />
        ) : (
          <BulkEntryButton hasUserActed={hasUserActed} onEnter={handleEnterBulk} />
        )}

        {/* 空状态 / 天卡片列表 */}
        {isEmptyView ? (
          <EmptyStateView
            stateCode={viewStateCode as InquiryViewStateCode}
            onNavigate={onNavigate}
            onRelaxFilter={() => handleFilterChange('all')}
          />
        ) : (
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '4px 12px 24px',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {(viewData?.days ?? []).map((dayGroup) => (
              <InquiryDayCard
                key={dayGroup.date}
                dayGroup={dayGroup}
                filter={filter}
                bulkActive={bulkActive}
                selectedIds={selectedIds}
                onConfirmItem={handleConfirmItem}
                onOpenDetail={(tx) => handleOpenDetail(tx, dayGroup.date)}
                onToggleSelect={handleToggleSelect}
                onSelectDay={handleSelectDay}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── 交易详情叠加层（§10）────────────── */}
      {detailTxId && detailTx && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 420 }}>
          <TransactionDetailPage
            transaction={toHomeTransaction(detailTx)}
            dayId={detailDayId}
            availableCategories={availableCategories}
            categoryVisuals={categoryVisuals}
            onClose={handleCloseDetail}
            onUpdateCategory={handleUpdateCategory}
            onUpdateUserReasoning={handleUpdateUserReasoning}
            onSetTransactionVerification={handleSetVerification}
          />
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// InquiryHeader（§3.1 Header 区）
// ──────────────────────────────────────────────

function InquiryHeader({
  filter,
  dropdownOpen,
  onToggleDropdown,
  onFilterChange,
  onDismissDropdown,
}: {
  filter: InquiryFilter;
  dropdownOpen: boolean;
  onToggleDropdown: () => void;
  onFilterChange: (f: InquiryFilter) => void;
  onDismissDropdown: () => void;
}) {
  return (
    <div
      style={{
        paddingTop: APP_HEADER_PADDING_TOP,
        paddingLeft: 16,
        paddingRight: 16,
        paddingBottom: 8,
        minHeight: APP_HEADER_MIN_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        position: 'relative',
        zIndex: 10,
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 800, color: C.dark, letterSpacing: -0.3 }}>
        请教
      </div>
      <FilterControl
        current={filter}
        dropdownOpen={dropdownOpen}
        onToggle={onToggleDropdown}
        onSelect={onFilterChange}
        onDismiss={onDismissDropdown}
      />
    </div>
  );
}

// ──────────────────────────────────────────────
// FilterControl（§6 Filter 控件）
// ──────────────────────────────────────────────

function FilterControl({
  current,
  dropdownOpen,
  onToggle,
  onSelect,
  onDismiss,
}: {
  current: InquiryFilter;
  dropdownOpen: boolean;
  onToggle: () => void;
  onSelect: (f: InquiryFilter) => void;
  onDismiss: () => void;
}) {
  const options: InquiryFilter[] = ['all', 'medium', 'low'];

  return (
    <div style={{ position: 'relative' }}>
      {/* Filter 芯片按钮（§6.1 紧凑下拉 chip） */}
      <button
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '5px 10px',
          borderRadius: 20,
          border: `1.5px solid ${dropdownOpen ? C.dark : C.border}`,
          background: dropdownOpen ? C.dark : C.white,
          color: dropdownOpen ? C.white : C.dark,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: "'Nunito', sans-serif",
          transition: `background ${ANIM.filterFadeOutMs}ms, border-color ${ANIM.filterFadeOutMs}ms`,
        }}
      >
        {/* 漏斗 icon */}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 4h16l-6 8v6l-4 2V12L4 4z"
            stroke={dropdownOpen ? C.white : C.dark}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {FILTER_LABELS[current]}
      </button>

      {/* 下拉弹层（§6.4） */}
      {dropdownOpen && (
        <>
          {/* 透明遮罩关闭 */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 19 }}
            onClick={onDismiss}
          />
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              minWidth: 168,
              background: C.white,
              borderRadius: 12,
              border: `1.5px solid ${C.border}`,
              boxShadow: '0 6px 20px rgba(0,0,0,.10)',
              overflow: 'hidden',
              zIndex: 20,
            }}
          >
            {options.map((opt, idx) => (
              <button
                key={opt}
                onClick={() => onSelect(opt)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px 14px',
                  textAlign: 'left',
                  background: opt === current ? C.bg : C.white,
                  color: C.dark,
                  fontSize: 13,
                  fontWeight: opt === current ? 700 : 400,
                  border: 'none',
                  borderBottom: idx < options.length - 1 ? `1px solid ${C.line}` : 'none',
                  cursor: 'pointer',
                  fontFamily: "'Nunito', sans-serif",
                }}
              >
                {FILTER_LABELS[opt]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// RunningBanner（§12.3 RUNNING_NON_EMPTY 常驻提示）
// ──────────────────────────────────────────────

function RunningBanner() {
  return (
    <div
      style={{
        margin: '0 12px 4px',
        padding: '6px 12px',
        borderRadius: 10,
        background: C.blueBg,
        border: `1px solid ${C.blue}`,
        fontSize: 12,
        color: C.dark,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexShrink: 0,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={C.blue} strokeWidth="2" />
        <path d="M12 7v5l3 3" stroke={C.blue} strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span>AI 正在分类，可能还会有新条目进来</span>
    </div>
  );
}

// ──────────────────────────────────────────────
// BulkEntryButton（§11.1 批量化入口两态）
// ──────────────────────────────────────────────

function BulkEntryButton({ hasUserActed, onEnter }: { hasUserActed: boolean; onEnter: () => void }) {
  return (
    <div
      style={{
        margin: '0 12px 4px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
        minHeight: 34,
      }}
    >
      <button
        onClick={hasUserActed ? onEnter : undefined}
        style={{
          padding: '5px 14px',
          borderRadius: 10,
          border: `1.5px solid ${hasUserActed ? C.dark : C.border}`,
          background: hasUserActed ? C.white : 'transparent',
          color: hasUserActed ? C.dark : C.muted,
          fontSize: 12,
          fontWeight: hasUserActed ? 700 : 400,
          cursor: hasUserActed ? 'pointer' : 'default',
          fontFamily: "'Nunito', sans-serif",
          transition: `all ${ANIM.bulkActivateMs}ms ease-in-out`,
        }}
      >
        批量确认
      </button>
      {!hasUserActed && (
        <span style={{ fontSize: 11, color: C.muted }}>先处理一两条再使用批量</span>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// BulkActionBar（§11.2 批量操作栏）
// ──────────────────────────────────────────────

function BulkActionBar({
  selectedCount,
  onConfirm,
  onExit,
}: {
  selectedCount: number;
  onConfirm: () => void;
  onExit: () => void;
}) {
  return (
    <div
      style={{
        margin: '0 12px 4px',
        padding: '6px 12px',
        borderRadius: 10,
        background: C.dark,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        gap: 8,
      }}
    >
      <span style={{ fontSize: 13, color: C.white, fontWeight: 600 }}>
        已选 {selectedCount} 条
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onExit}
          style={{
            padding: '4px 10px',
            borderRadius: 8,
            border: `1.5px solid ${C.white}44`,
            background: 'transparent',
            color: C.white,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "'Nunito', sans-serif",
          }}
        >
          退出
        </button>
        <button
          onClick={selectedCount > 0 ? onConfirm : undefined}
          style={{
            padding: '4px 12px',
            borderRadius: 8,
            border: 'none',
            background: selectedCount > 0 ? C.mint : C.gray,
            color: C.white,
            fontSize: 12,
            fontWeight: 700,
            cursor: selectedCount > 0 ? 'pointer' : 'default',
            fontFamily: "'Nunito', sans-serif",
          }}
        >
          批量确认
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// EmptyStateView（§12 五种空状态）
// ──────────────────────────────────────────────

function EmptyStateView({
  stateCode,
  onNavigate,
  onRelaxFilter,
}: {
  stateCode: InquiryViewStateCode | null;
  onNavigate?: (page: 'home' | 'entry' | 'settings' | 'insights' | 'inquiry') => void;
  onRelaxFilter: () => void;
}) {
  if (!stateCode || stateCode === 'RUNNING_NON_EMPTY') return null;
  const cfg = EMPTY_STATE_CONFIG[stateCode];
  const isAllReviewed = stateCode === 'ALL_REVIEWED';

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        gap: 16,
      }}
    >
      <EmptyIllustration type={stateCode} />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.dark, marginBottom: 6 }}>
          {cfg.title}
        </div>
        <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.5 }}>
          {cfg.subtitle}
        </div>
      </div>
      {cfg.action && (
        <button
          onClick={() => {
            if (stateCode === 'FILTER_EMPTY') {
              onRelaxFilter();
            } else if (cfg.actionTarget) {
              onNavigate?.(cfg.actionTarget);
            }
          }}
          style={{
            padding: '8px 24px',
            borderRadius: 12,
            background: isAllReviewed ? C.mint : C.dark,
            color: C.white,
            fontSize: 13,
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            fontFamily: "'Nunito', sans-serif",
          }}
        >
          {cfg.action}
        </button>
      )}
    </div>
  );
}

function EmptyIllustration({ type }: { type: InquiryViewStateCode | null }) {
  if (type === 'ALL_REVIEWED') {
    return (
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
        <circle cx="36" cy="36" r="32" fill={C.mint} opacity=".15" />
        <circle cx="36" cy="36" r="22" fill={C.mint} opacity=".22" />
        <path d="M22 36l10 10 18-18" stroke={C.mint} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
      <circle cx="36" cy="36" r="32" fill={C.bg} stroke={C.border} strokeWidth="1.5" />
      <circle cx="36" cy="27" r="8" stroke={C.muted} strokeWidth="1.8" fill="none" />
      <path d="M36 37v10" stroke={C.muted} strokeWidth="2" strokeLinecap="round" />
      <circle cx="36" cy="50" r="2" fill={C.muted} />
    </svg>
  );
}

// ──────────────────────────────────────────────
// InquiryDayCard（§7 天卡片）
// ──────────────────────────────────────────────

function InquiryDayCard({
  dayGroup,
  filter,
  bulkActive,
  selectedIds,
  onConfirmItem,
  onOpenDetail,
  onToggleSelect,
  onSelectDay,
}: {
  dayGroup: InquiryDayGroup;
  filter: InquiryFilter;
  bulkActive: boolean;
  selectedIds: Set<string>;
  onConfirmItem: (id: string) => void;
  onOpenDetail: (tx: FullTransactionRecord) => void;
  onToggleSelect: (id: string) => void;
  onSelectDay: (dayGroup: InquiryDayGroup, select: boolean) => void;
}) {
  const operableItems = dayGroup.transactions.filter((t) => isOperable(t, filter));
  const totalCount = dayGroup.transactions.length;
  const operableCount = operableItems.length;

  const allDaySelected =
    bulkActive &&
    operableItems.length > 0 &&
    operableItems.every((t) => selectedIds.has(t.id));

  return (
    <div
      style={{
        marginBottom: 12,
        borderRadius: 16,
        background: C.white,
        border: `1.5px solid ${C.border}`,
        overflow: 'hidden',
      }}
    >
      {/* 天卡片头部（§7.2） */}
      <div
        style={{
          padding: '10px 14px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${C.line}`,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>
          {formatDayLabel(dayGroup.date)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: C.sub }}>
            {operableCount} 条不确定 / {totalCount} 条共计
          </span>
          {/* 批量模式下当天全选按钮（§11.3） */}
          {bulkActive && operableItems.length > 0 && (
            <button
              onClick={() => onSelectDay(dayGroup, !allDaySelected)}
              style={{
                padding: '2px 8px',
                borderRadius: 8,
                border: `1.5px solid ${C.dark}`,
                background: allDaySelected ? C.dark : C.white,
                color: allDaySelected ? C.white : C.dark,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'Nunito', sans-serif",
              }}
            >
              {allDaySelected ? '取消全选' : '全选'}
            </button>
          )}
        </div>
      </div>

      {/* 条目列表（§7.3 按时间升序，可操作与只读混排） */}
      {dayGroup.transactions.map((tx, idx) => (
        <InquiryTransactionItem
          key={tx.id}
          tx={tx}
          filter={filter}
          bulkActive={bulkActive}
          isSelected={selectedIds.has(tx.id)}
          isLast={idx === dayGroup.transactions.length - 1}
          onConfirm={onConfirmItem}
          onOpenDetail={onOpenDetail}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────
// InquiryTransactionItem（§5 单条请教项 + §8 左滑确认）
// ──────────────────────────────────────────────

interface SwipeState {
  active: boolean;
  startX: number;
  startY: number;
  currentX: number;
  /** 'none' = 方向未确定，'h' = 水平，'v' = 垂直 */
  dir: 'none' | 'h' | 'v';
  pointerId: number;
}

const IDLE_SWIPE: SwipeState = {
  active: false,
  startX: 0,
  startY: 0,
  currentX: 0,
  dir: 'none',
  pointerId: -1,
};

function InquiryTransactionItem({
  tx,
  filter,
  bulkActive,
  isSelected,
  isLast,
  onConfirm,
  onOpenDetail,
  onToggleSelect,
}: {
  tx: FullTransactionRecord;
  filter: InquiryFilter;
  bulkActive: boolean;
  isSelected: boolean;
  isLast: boolean;
  onConfirm: (id: string) => void;
  onOpenDetail: (tx: FullTransactionRecord) => void;
  onToggleSelect: (id: string) => void;
}) {
  const operable = isOperable(tx, filter);
  const [swipe, setSwipe] = useState<SwipeState>(IDLE_SWIPE);
  // dismissing=true: 播放左滑退场动画；dismissed=true: 从 DOM 移除（高度坍塌）
  const [dismissing, setDismissing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // 条目被外部确认（is_verified 变为 true）时播放退场动画
  useEffect(() => {
    if (tx.is_verified && !dismissed && !dismissing) {
      setDismissing(true);
      const timer = setTimeout(() => setDismissed(true), ANIM.swipeOutMs + ANIM.collapseMs);
      return () => clearTimeout(timer);
    }
  }, [tx.is_verified, dismissed, dismissing]);

  if (dismissed) return null;

  // 当前水平位移（只允许向左，即负值）
  const rawDeltaX = swipe.active && swipe.dir === 'h' ? swipe.currentX - swipe.startX : 0;
  const deltaX = Math.min(0, rawDeltaX);
  const pastThreshold = -deltaX >= SWIPE_CONFIRM_THRESHOLD_PX;

  // ── 手势 ─────────────────────────────────────

  const onPointerDown = (e: React.PointerEvent) => {
    if (!operable || bulkActive) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSwipe({
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      dir: 'none',
      pointerId: e.pointerId,
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!swipe.active || e.pointerId !== swipe.pointerId) return;
    const dx = e.clientX - swipe.startX;
    const dy = e.clientY - swipe.startY;

    if (swipe.dir === 'none') {
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx + absDy < 4) return; // 等待方向判定最小位移
      const direction = absDx >= absDy * SWIPE_DIRECTION_RATIO ? 'h' : 'v';
      setSwipe((prev) => ({ ...prev, dir: direction, currentX: e.clientX }));
    } else if (swipe.dir === 'h') {
      setSwipe((prev) => ({ ...prev, currentX: e.clientX }));
    }
  };

  const onPointerUp = () => {
    if (!swipe.active) return;
    const delta = swipe.currentX - swipe.startX;
    const wasHorizontal = swipe.dir === 'h';
    setSwipe(IDLE_SWIPE);
    if (wasHorizontal && -delta >= SWIPE_CONFIRM_THRESHOLD_PX) {
      // 超过阈值：播放退场动画，然后调用确认接口（§8.3）
      setDismissing(true);
      setTimeout(() => {
        onConfirm(tx.id);
        setDismissed(true);
      }, ANIM.swipeOutMs);
    }
  };

  const onPointerCancel = () => setSwipe(IDLE_SWIPE);

  // 单击（§10 单击进详情页 / 批量模式切换勾选）
  const onClick = () => {
    if (swipe.dir === 'h') return; // 水平滑动手势中不触发单击
    if (bulkActive) {
      if (operable) onToggleSelect(tx.id);
      return;
    }
    onOpenDetail(tx);
  };

  // ── 视觉参数 ──────────────────────────────────

  const confidenceBg = operable ? CONFIDENCE_BG[tx.ai_confidence] : C.bg;
  const confidenceBorderColor = operable ? CONFIDENCE_BORDER[tx.ai_confidence] : C.border;
  const displayTitle = tx.counterparty || tx.product || tx.rawClass || '未知商户';
  const displayCat = tx.user_category || tx.ai_category || '';

  // 退场动画：向左 110vw；回弹：无 transition 跟手，松手后 ease-out 回原点
  const bodyStyle: React.CSSProperties = dismissing
    ? {
        transform: `translateX(-110vw)`,
        transition: `transform ${ANIM.swipeOutMs}ms ease-out`,
      }
    : {
        transform: `translateX(${deltaX}px)`,
        transition: swipe.active && swipe.dir === 'h' ? 'none' : `transform ${ANIM.bounceMs}ms ease-out`,
      };

  return (
    <div
      style={{
        position: 'relative',
        borderBottom: isLast ? 'none' : `1px solid ${C.line}`,
        overflow: 'hidden',
        // 退场后高度坍塌（§14.1 阶段 B）
        maxHeight: dismissed ? 0 : undefined,
        transition: dismissed ? `max-height ${ANIM.collapseMs}ms ease-in-out` : undefined,
      }}
    >
      {/* 确认绿底（从右侧透出，§8.2） */}
      {operable && !bulkActive && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: '100%',
            background: pastThreshold ? C.mint : `${C.mint}55`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 16,
            transition: 'background 120ms',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: C.white }}>确认 ✓</span>
        </div>
      )}

      {/* 条目主体 */}
      <div
        style={{
          padding: '10px 14px',
          background: confidenceBg,
          borderLeft: `3px solid ${confidenceBorderColor}`,
          cursor: 'pointer',
          opacity: operable ? 1 : 0.52,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          touchAction: 'pan-y',
          ...bodyStyle,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={onClick}
      >
        {/* 批量模式勾选框（§11.2 仅可操作条目显示） */}
        {bulkActive && operable && (
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 5,
              border: `2px solid ${isSelected ? C.mint : C.border}`,
              background: isSelected ? C.mint : C.white,
              flexShrink: 0,
              marginTop: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: `background ${ANIM.enterBulkMs}ms, border-color ${ANIM.enterBulkMs}ms`,
            }}
          >
            {isSelected && (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 5l2.5 2.5L8 3" stroke={C.white} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        )}

        {/* 文字内容区 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 第一行：商户名 + 金额（§5.4） */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: C.dark,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {displayTitle}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: tx.direction === 'out' ? C.coral : C.mint,
                flexShrink: 0,
                marginLeft: 8,
                fontFamily: "'Space Mono', monospace",
              }}
            >
              {tx.direction === 'out' ? '-' : '+'}¥{tx.amount.toFixed(2)}
            </div>
          </div>

          {/* 第二行：分类标签 + 来源标签 + 时间（§5.4） */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: operable ? 4 : 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              {displayCat && (
                <span
                  style={{
                    fontSize: 11,
                    padding: '1px 6px',
                    borderRadius: 6,
                    background: C.bg,
                    color: C.sub,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  {displayCat}
                </span>
              )}
              {/* §3.8 来源标签 */}
              <span
                style={{
                  fontSize: 10,
                  padding: '1px 5px',
                  borderRadius: 5,
                  background: C.line,
                  color: C.muted,
                }}
              >
                {tx.sourceType === 'wechat' ? '微信' : tx.sourceType === 'alipay' ? '支付宝' : '手记'}
              </span>
            </div>
            <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>
              {tx.time.length >= 16 ? tx.time.slice(11, 16) : ''}
            </span>
          </div>

          {/* 第三行：confidence 标签 + uncertainty reason（§5.4，仅可操作条目）*/}
          {operable && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: 5,
                  background: `${confidenceBorderColor}20`,
                  color: confidenceBorderColor,
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {CONFIDENCE_LABEL[tx.ai_confidence]}
              </span>
              {tx.ai_uncertainty_reason && (
                <span
                  style={{
                    fontSize: 11,
                    color: C.sub,
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical' as const,
                  }}
                >
                  {tx.ai_uncertainty_reason}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
