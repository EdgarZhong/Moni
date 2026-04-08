import type { Transaction } from './index';
import type { StorageHandle, StorageDirHandle } from '@system/filesystem/fs-storage';
import type { LedgerMemory } from './metadata';

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
  /** 当前窗口内的折线点 */
  points: HomeTrendPoint[];
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

export interface HomeHintCardReadModel {
  id: string;
  type: 'budget_alert' | 'budget_nudge';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  dismissible: boolean;
}

export interface HomeTransactionReadModel {
  id: string;
  title: string;
  amount: number;
  time: string;
  sourceType: 'wechat' | 'alipay' | 'manual';
  sourceLabel: string;
  paymentMethod: string;
  category: string | null;
  userCategory: string | null;
  aiCategory: string | null;
  reasoning: string | null;
  userNote: string | null;
  direction: 'in' | 'out';
  isVerified: boolean;
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
  activeDate: string | null;
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
  dateRange: { start: Date | null; end: Date | null };
  tabs: string[];
  memoryFileHandle: StorageHandle | null;
  currentLedgerId: string;
}

export interface LedgerImportInput {
  parsedData: Transaction[];
  dirHandle: StorageDirHandle;
}
