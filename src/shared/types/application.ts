import type { Transaction } from './index';
import type { StorageHandle, StorageDirHandle } from '@system/filesystem/fs-storage';
import type { FullTransactionRecord, LedgerMemory } from './metadata';

export interface LedgerOption {
  id: string;
  name: string;
}

export interface LedgerCategoryDefinition {
  key: string;
  label: string;
  description: string;
}

export interface HomeIncomeEntry {
  date: string;
  amount: number;
}

export interface HomeTrendPoint {
  key: string;
  label: string;
  amount: number;
}

export interface HomeTrendCardReadModel {
  /** 当前窗口大小，首轮固定为 7 */
  windowSize: number;
  /** 当前窗口内的折线点（向后兼容，新 UI 直接用 allPoints） */
  points: HomeTrendPoint[];
  /** 完整趋势历史（不受 dateRange 过滤），供连续滚动渲染用 */
  allPoints: HomeTrendPoint[];
  /** 当前窗口起始日期 */
  windowStart: string | null;
  /** 当前窗口结束日期 */
  windowEnd: string | null;
  /** 是否还存在更早窗口 */
  hasEarlierWindow: boolean;
  /** 是否还存在更晚窗口 */
  hasLaterWindow: boolean;
  /** 当前窗口偏移量，供表现层维持交互状态 */
  windowOffset: number;
}

export interface HomeBudgetCardReadModel {
  periodLabel: string;
  budgetAmount: number;
  spentAmount: number;
  remainingAmount: number;
  remainingDays: number;
  dailyAvailableAmount: number;
  status: 'healthy' | 'warning' | 'exceeded';
  usageRatio: number;
}

export interface HomeBudgetSummaryReadModel {
  enabled: boolean;
  status: 'none' | 'healthy' | 'warning' | 'exceeded';
  card: HomeBudgetCardReadModel | null;
}

export interface HomeCategoryBudgetItemReadModel {
  categoryKey: string;
  budgetAmount: number;
  spent: number;
  remaining: number;
  status: 'within' | 'exceeded';
  overageAmount: number;
}

export type HomeHintCardType = 'onboarding_step' | 'budget_alert' | 'budget_nudge' | 'import_reminder';
export type HomeHintCardPriority = 'high' | 'medium' | 'low';
export type HomeHintActionTarget = 'settings_self_description' | 'settings_budget' | 'entry_import';

export interface HomeHintActionReadModel {
  kind: 'navigate';
  target: HomeHintActionTarget;
  label: string;
}

export interface HomeHintCardReadModel {
  id: string;
  type: HomeHintCardType;
  priority: HomeHintCardPriority;
  title: string;
  description: string;
  dismissible: boolean;
  action: HomeHintActionReadModel | null;
}

export interface HomeTransactionReadModel {
  id: string;
  originalId?: string | null;
  title: string;
  amount: number;
  time: string;
  fullTime?: string;
  sourceType: 'wechat' | 'alipay' | 'manual';
  sourceLabel: string;
  paymentMethod: string;
  rawClass?: string | null;
  counterparty?: string | null;
  product?: string | null;
  transactionStatus?: string | null;
  category: string | null;
  userCategory: string | null;
  aiCategory: string | null;
  reasoning: string | null;
  userNote: string | null;
  remark: string | null;
  direction: 'in' | 'out';
  isVerified: boolean;
  updatedAt?: string | null;
  sequence: number;
}

export interface HomeDayGroupReadModel {
  id: string;
  label: string;
  items: HomeTransactionReadModel[];
}

export interface HomeAiEngineUiState {
  status: 'idle' | 'running' | 'draining' | 'paused' | 'error';
  activeLedger: string;
  /**
   * 当前批次的首日。
   * 保留这个字段，方便旧 UI 或日志快速拿到一个代表性日期。
   */
  activeDate: string | null;
  /**
   * 当前 AI 引擎明确声明“正在处理”的完整日期集合。
   * 首页日卡高亮必须消费这个接口，而不是默认写死 1 天或 3 天。
   */
  activeDates: string[];
  hasPendingInRange: boolean;
  hasPendingOutOfRange: boolean;
  pendingCount: number;
  lastLearnedAt: string | null;
  lastLearningNotice: {
    type: 'learned';
    message: string;
  } | null;
}

export interface HomeExtensionPointState {
  status: 'available' | 'placeholder';
  owner: 'agent3' | 'agent4' | 'agent5' | 'agent6';
  notes: string;
}

export interface MoniHomeReadModel {
  currentLedger: LedgerOption;
  availableLedgers: LedgerOption[];
  categoryDefinitions: LedgerCategoryDefinition[];
  dailyTransactionGroups: HomeDayGroupReadModel[];
  income: HomeIncomeEntry[];
  totalTransactionCount: number;
  trendCard: HomeTrendCardReadModel;
  hintCards: HomeHintCardReadModel[];
  budget: HomeBudgetSummaryReadModel;
  unclassifiedCount: number;
  availableCategories: string[];
  aiEngineUiState: HomeAiEngineUiState;
  extensions: {
    budget: HomeExtensionPointState;
    manualEntry: HomeExtensionPointState;
    memory: HomeExtensionPointState;
  };
  dataRange: {
    min: string | null;
    max: string | null;
  };
  homeDateRange: {
    start: string | null;
    end: string | null;
    isEmpty?: boolean;
  };
  isLoading: boolean;
}

export interface LedgerFacadeState {
  rawTransactions: Transaction[];
  computedTransactions: Transaction[];
  ledgerMemory: LedgerMemory | null;
  isLoading: boolean;
  filter: string;
  direction: number;
  dateRange: { start: Date | null; end: Date | null; isEmpty?: boolean };
  tabs: string[];
  memoryFileHandle: StorageHandle | null;
  currentLedgerId: string;
}

export interface LedgerImportInput {
  parsedData: Transaction[];
  dirHandle: StorageDirHandle;
}

// ──────────────────────────────────────────────
// 记账页读模型
// ──────────────────────────────────────────────

export interface EntryRecentReference {
  id: string;
  title: string;
  amount: number;
  category: string | null;
  direction: 'in' | 'out';
}

export interface EntryPageReadModel {
  currentLedger: LedgerOption;
  availableLedgers: LedgerOption[];
  categoryDefinitions: LedgerCategoryDefinition[];
  recentReferences: EntryRecentReference[];
  isLoading: boolean;
}

// ──────────────────────────────────────────────
// 设置页读模型
// ──────────────────────────────────────────────

export interface SettingsAiConfig {
  provider: string;
  hasApiKey: boolean;
  baseUrl: string;
  candidateModels: string[];
  activeModel: string;
  maxTokens: number;
  temperature: number;
  enableThinking: boolean;
}

export interface SettingsLedgerItem {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface SettingsTagItem {
  key: string;
  description: string;
  isSystem: boolean;
}

export interface SettingsMemoryItem {
  index: number;
  content: string;
}

export interface SettingsSnapshotItem {
  id: string;
  trigger: string;
  summary: string;
  isCurrent: boolean;
}

export interface SettingsExampleLibrarySummary {
  delta: number;
  total: number;
}

export interface SettingsLearningConfig {
  autoLearn: boolean;
  learningThreshold: number;
  compressionThreshold: number;
}

export interface SettingsBudgetConfig {
  monthlyTotal: number;
  categoryBudgets: Record<string, number>;
}

export interface SettingsLedgerTransaction {
  id: string;
  date: string;
  title: string;
  amount: number;
  category: string;
  isVerified: boolean;
  homeTransaction: HomeTransactionReadModel;
}

export interface FullReclassificationSubmitResult {
  affectedTxIds: string[];
  dirtyDates: string[];
  enqueueSuccess: boolean;
}

export interface SettingsPageReadModel {
  aiConfig: SettingsAiConfig;
  selfDescription: string;
  ledgers: SettingsLedgerItem[];
  activeLedgerId: string;
  tags: SettingsTagItem[];
  memoryItems: string[];
  snapshots: SettingsSnapshotItem[];
  exampleLibrarySummary: SettingsExampleLibrarySummary;
  learningConfig: SettingsLearningConfig;
  budgetConfig: SettingsBudgetConfig;
  ledgerTransactions: SettingsLedgerTransaction[];
}

// ──────────────────────────────────────────────
// 洞察页读模型
// ──────────────────────────────────────────────

/** 洞察页完整视图数据 */
export interface InsightsViewData {
  /** 账本元信息 */
  ledger: {
    name: string;
    earliestTxDate: string | null;
    latestTxDate: string | null;
  };

  /** 顶部摘要带 */
  summary: {
    totalIncome: number;
    totalExpense: number;
    netCashflow: number;
    coverageStart: string | null;
    coverageEnd: string | null;
  };

  /** 收支柱状图数据 — 按月分组 */
  cashflowByMonth: InsightsCashflowBucket[];

  /** 收支柱状图数据 — 按周分组 */
  cashflowByWeek: InsightsCashflowBucket[];

  /** 分类时间趋势综合表 */
  categoryBreakdown: {
    expense: InsightsCategoryBreakdownTabData;
    income: InsightsCategoryBreakdownTabData;
  };
}

/** 单个时间桶（月或周）的收支聚合 */
export interface InsightsCashflowBucket {
  /** 时间标识："YYYY-MM" 或 "YYYY-Www" */
  key: string;
  /** 该桶内总收入 */
  income: number;
  /** 该桶内总支出 */
  expense: number;
  /** 净值 = income - expense */
  net: number;
}

/** 单个 direction tab 的分类分解 */
export interface InsightsCategoryBreakdownTabData {
  /** 本月各标签占比（环状图 + 列表用） */
  currentMonth: InsightsCategorySlice[];
  /** 各标签全账本月度历史（二级展开图表用） */
  byTagHistory: Record<string, InsightsTagMonthlyPoint[]>;
}

/** 环状图 / 列表的单个标签数据 */
export interface InsightsCategorySlice {
  tagId: string;
  tagName: string;
  amount: number;
  share: number;
  budget: number | null;
}

/** 某标签某月的金额 */
export interface InsightsTagMonthlyPoint {
  monthKey: string;
  amount: number;
}

// ──────────────────────────────────────────────
// 请教页读模型（§2.3 审计队列视图组织语义）
// ──────────────────────────────────────────────

/**
 * 请教页 filter 档位：决定哪些条目可操作、哪些天可见。
 * - all: 全部条目可操作
 * - medium（默认）: medium / low 可操作，high 只读
 * - low: 仅 low 可操作
 */
export type InquiryFilter = 'all' | 'medium' | 'low';

/**
 * 请教页视图状态码，对应 §2.3-F 空状态分类。
 * RUNNING_NON_EMPTY 虽不是真正的空状态，但需要让表现层显示"AI 正在追加"提示。
 */
export type InquiryViewStateCode =
  | 'NO_BILLS'          // 当前账本未导入任何账单
  | 'NO_REVIEW_YET'     // 已导入账单，但从未产出 ai_needs_review=true 条目
  | 'RUNNING_NON_EMPTY' // AI 正在运行，且队列已有 ai_needs_review=true 条目（非空）
  | 'ALL_REVIEWED'      // 放宽 filter 后亦无可操作条目（全部已审核）
  | 'FILTER_EMPTY';     // 当前 filter 下为空，但放宽后非空

/** 请教页天卡片（按天聚合的交易组） */
export interface InquiryDayGroup {
  /** 日期键 YYYY-MM-DD */
  date: string;
  /**
   * 天级不确定度均值（§2.3-B 天级排序键）。
   * 仅统计当天 ai_needs_review=true && is_verified=false 的条目。
   * score: low=3 / medium=2 / high or ''=1
   */
  dayUncertaintyScore: number;
  /** 当天全部 is_verified=false 的条目，按时间升序排列 */
  transactions: FullTransactionRecord[];
}

/** 请教页完整视图数据 */
export interface InquiryViewData {
  /** 当前生效的 filter 档位 */
  filter: InquiryFilter;
  /** 可见天卡片列表，按天级不确定度降序排列 */
  days: InquiryDayGroup[];
  /**
   * 视图状态码。
   * null 表示正常有内容状态（days 非空且无特殊状态提示）。
   * RUNNING_NON_EMPTY 时 days 非空（AI 正在运行，新条目会追加）。
   */
  viewStateCode: InquiryViewStateCode | null;
  /** AI 引擎当前是否正在运行 */
  isAiRunning: boolean;
}
