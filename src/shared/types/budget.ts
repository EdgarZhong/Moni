import type { LedgerMemory } from './metadata';

export interface MonthlyBudget {
  amount: number;
  currency: string;
}

export interface CategoryBudgetEntry {
  amount: number;
}

export interface BudgetConfig {
  monthly: MonthlyBudget | null;
  categoryBudgets: Record<string, CategoryBudgetEntry> | null;
  categoryBudgetSchemaVersion: number;
  updatedAt: string;
}

export type BudgetStatus = 'none' | 'healthy' | 'warning' | 'exceeded';

export type CategoryBudgetStatus = 'within' | 'exceeded';

export type MonthlyBudgetSummary =
  | { enabled: false }
  | {
      enabled: true;
      status: 'healthy' | 'warning' | 'exceeded';
      period: string;
      amount: number;
      spent: number;
      remaining: number;
      usageRatio: number;
      remainingDays: number;
      dailyAvailable: number;
    };

export interface CategoryBudgetItem {
  categoryKey: string;
  budgetAmount: number;
  spent: number;
  remaining: number;
  status: CategoryBudgetStatus;
  overageAmount: number;
}

export type CategoryBudgetSummary =
  | { enabled: false }
  | {
      enabled: true;
      items: CategoryBudgetItem[];
    };

export interface BudgetHintCard {
  id: string;
  type: 'budget_alert' | 'budget_nudge';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  dismissible: boolean;
}

export interface DisplayBoardBudgetCard {
  periodLabel: string;
  budgetAmount: number;
  spentAmount: number;
  remainingAmount: number;
  remainingDays: number;
  dailyAvailableAmount: number;
  status: 'healthy' | 'warning' | 'exceeded';
  usageRatio: number;
}

export interface HomeBudgetReadModel {
  monthlyBudget: MonthlyBudgetSummary;
  categoryBudget: CategoryBudgetSummary;
  budgetHints: BudgetHintCard[];
}

export interface BudgetStore {
  loadBudgetConfig(ledgerId: string): Promise<BudgetConfig | null>;
  saveMonthlyBudget(ledgerId: string, budget: MonthlyBudget | null): Promise<void>;
  saveCategoryBudgets(
    ledgerId: string,
    budgets: Record<string, CategoryBudgetEntry> | null,
    schemaVersion: number
  ): Promise<void>;
  saveBudgetConfig(ledgerId: string, config: BudgetConfig): Promise<void>;
}

export interface BudgetService {
  computeMonthlyBudgetSummary(
    ledgerId: string,
    ledgerMemory: LedgerMemory | null,
    now?: Date
  ): Promise<MonthlyBudgetSummary>;
  computeCategoryBudgetSummary(
    ledgerId: string,
    ledgerMemory: LedgerMemory | null,
    now?: Date
  ): Promise<CategoryBudgetSummary>;
  getBudgetHints(input: {
    prevMonthlyStatus: BudgetStatus | null;
    currentMonthlyStatus: BudgetStatus;
    categorySummary: CategoryBudgetSummary;
    totalTransactionCount: number;
    hasInvalidatedCategoryBudget?: boolean;
  }): BudgetHintCard[];
  getHomeBudgetReadModel(
    ledgerId: string,
    ledgerMemory: LedgerMemory | null,
    options?: {
      now?: Date;
      prevMonthlyStatus?: BudgetStatus | null;
    }
  ): Promise<HomeBudgetReadModel>;
}
