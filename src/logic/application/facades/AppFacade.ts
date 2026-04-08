import { BatchProcessor } from '@logic/application/ai/BatchProcessor';
import { classifyQueue } from '@logic/application/ai/ClassifyQueue';
import type { AIProgress, AIStatus } from '@logic/application/ai/types';
import { BudgetManager } from '@logic/application/services/BudgetManager';
import { LedgerManager } from '@logic/application/services/LedgerManager';
import { LedgerService } from '@logic/application/services/LedgerService';
import type {
  HomeAiEngineUiState,
  HomeBudgetCardReadModel,
  HomeDayGroupReadModel,
  HomeHintCardReadModel,
  HomeTransactionReadModel,
  HomeTrendPoint,
  LedgerCategoryDefinition,
  LedgerFacadeState,
  LedgerOption,
  MoniHomeReadModel,
} from '@shared/types';
import type { FullTransactionRecord } from '@shared/types/metadata';

const HOME_TREND_DAYS = 30;

function toDateKey(time: string): string {
  return time.slice(0, 10);
}

function toDateLabel(dateKey: string, todayKey: string, yesterdayKey: string): string {
  if (dateKey === todayKey) return '今天';
  if (dateKey === yesterdayKey) return '昨天';
  const [, month, day] = dateKey.split('-');
  return `${parseInt(month, 10)}月${parseInt(day, 10)}日`;
}

function buildRecentDays(now: Date, count: number): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    keys.push(date.toISOString().slice(0, 10));
  }
  return keys;
}

function toHomeTransaction(txId: string, record: FullTransactionRecord, index: number): HomeTransactionReadModel {
  return {
    id: txId,
    title: record.counterparty || record.product || '未知',
    amount: record.amount,
    time: record.time.slice(11, 16),
    paymentMethod: record.paymentMethod || '',
    category: record.user_category || record.ai_category || record.category || null,
    userCategory: record.user_category || null,
    aiCategory: record.ai_category || null,
    reasoning: record.ai_reasoning || null,
    direction: record.direction,
    isVerified: record.is_verified,
    sequence: index,
  };
}

export class AppFacade {
  private static instance: AppFacade;

  private readonly ledgerService = LedgerService.getInstance();
  private readonly ledgerManager = LedgerManager.getInstance();
  private readonly budgetManager = BudgetManager.getInstance();
  private readonly batchProcessor = BatchProcessor.getInstance();
  private readonly listeners = new Set<() => void>();

  private aiStatus: AIStatus = 'IDLE';
  private aiProgress: AIProgress = { total: 0, current: 0, currentDate: '' };

  private constructor() {
    this.ledgerService.subscribe(() => {
      this.notify();
    });

    this.batchProcessor.subscribe((status, progress) => {
      this.aiStatus = status;
      this.aiProgress = progress;
      this.notify();
    });
  }

  public static getInstance(): AppFacade {
    if (!AppFacade.instance) {
      AppFacade.instance = new AppFacade();
    }
    return AppFacade.instance;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getLedgerState(): LedgerFacadeState {
    const state = this.ledgerService.getState();
    return {
      rawTransactions: state.rawTransactions,
      computedTransactions: state.computedTransactions,
      ledgerMemory: state.ledgerMemory,
      isLoading: state.isLoading,
      filter: state.filter,
      direction: state.direction,
      dateRange: state.dateRange,
      tabs: state.TABS,
      memoryFileHandle: state.memoryFileHandle,
      currentLedgerId: this.ledgerManager.getActiveLedgerName(),
    };
  }

  public async listLedgerOptions(options?: { syncWithFiles?: boolean }): Promise<LedgerOption[]> {
    const ledgers = await this.ledgerManager.listLedgers(options);
    return ledgers.map((ledger) => ({
      id: ledger.name,
      name: ledger.name,
    }));
  }

  public async getMoniHomeReadModel(now: Date = new Date()): Promise<MoniHomeReadModel> {
    const ledgerState = this.getLedgerState();
    const currentLedgerId = ledgerState.currentLedgerId;
    const currentLedger: LedgerOption = {
      id: currentLedgerId,
      name: currentLedgerId,
    };

    const records = ledgerState.ledgerMemory?.records ?? {};
    const categoryMap = ledgerState.ledgerMemory?.defined_categories ?? {};
    const categoryDefinitions: LedgerCategoryDefinition[] = Object.entries(categoryMap).map(
      ([key, description]) => ({
        key,
        label: key,
        description,
      })
    );

    const [availableLedgers, monthlyBudget, categoryBudget, pendingCount] = await Promise.all([
      this.listLedgerOptions({ syncWithFiles: false }).catch(() => [currentLedger]),
      this.budgetManager.computeMonthlyBudgetSummary(currentLedgerId, ledgerState.ledgerMemory, now),
      this.budgetManager.computeCategoryBudgetSummary(currentLedgerId, ledgerState.ledgerMemory, now),
      classifyQueue.size(currentLedgerId).catch(() => 0),
    ]);

    const todayKey = now.toISOString().slice(0, 10);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);

    const dayMap = new Map<string, HomeTransactionReadModel[]>();
    const income: MoniHomeReadModel['income'] = [];
    const sortedEntries = Object.entries(records).sort(([, a], [, b]) => b.time.localeCompare(a.time));

    let itemIndex = 0;
    for (const [txId, record] of sortedEntries) {
      if (record.transactionStatus !== 'SUCCESS') {
        continue;
      }

      const dateKey = toDateKey(record.time);
      if (record.direction === 'out') {
        if (!dayMap.has(dateKey)) {
          dayMap.set(dateKey, []);
        }
        dayMap.get(dateKey)?.push(toHomeTransaction(txId, record, itemIndex));
        itemIndex += 1;
        continue;
      }

      const existingIncome = income.find((entry) => entry.date === dateKey);
      if (existingIncome) {
        existingIncome.amount += record.amount;
      } else {
        income.push({ date: dateKey, amount: record.amount });
      }
    }

    const dailyTransactionGroups: HomeDayGroupReadModel[] = Array.from(dayMap.entries())
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([dateKey, items]) => ({
        id: dateKey,
        label: toDateLabel(dateKey, todayKey, yesterdayKey),
        items,
      }));

    const recentDayKeys = buildRecentDays(now, HOME_TREND_DAYS);
    const trend: HomeTrendPoint[] = recentDayKeys.map((key) => {
      const dayItems = dayMap.get(key) ?? [];
      const amount = dayItems.reduce((sum, item) => sum + item.amount, 0);
      const [, month, day] = key.split('-');
      return {
        key,
        label: `${parseInt(month, 10)}/${parseInt(day, 10)}`,
        amount,
      };
    });

    const budgetStatus = monthlyBudget.enabled ? monthlyBudget.status : 'none';
    const budgetCard: HomeBudgetCardReadModel | null = monthlyBudget.enabled
      ? this.budgetManager.toBudgetCard(monthlyBudget)
      : null;
    const hintCards: HomeHintCardReadModel[] = this.budgetManager.getBudgetHints(
      null,
      budgetStatus,
      categoryBudget,
      sortedEntries.length
    );

    return {
      currentLedger,
      availableLedgers,
      categoryDefinitions,
      dailyTransactionGroups,
      income,
      trend,
      hintCards,
      budget: {
        enabled: monthlyBudget.enabled,
        status: budgetStatus,
        card: budgetCard,
      },
      unclassifiedCount: dailyTransactionGroups
        .flatMap((group) => group.items)
        .filter((item) => !item.category || item.category === 'uncategorized')
        .length,
      availableCategories: Object.keys(categoryMap),
      aiEngineUiState: this.toHomeAiState(currentLedgerId, pendingCount),
      extensions: {
        budget: {
          status: 'available',
          owner: 'agent3',
          notes: '预算读模型已接入 facade，预算写入与规则演进仍由 Agent 3 负责。',
        },
        manualEntry: {
          status: 'placeholder',
          owner: 'agent4',
          notes: '已预留手记入口位，等待 Agent 4 提供正式录入/删除接口。',
        },
        memory: {
          status: 'placeholder',
          owner: 'agent5',
          notes: '已预留 AI 记忆/学习状态位，等待 Agent 5 提供 v7 revision 与学习基线数据。',
        },
      },
      isLoading: ledgerState.isLoading,
    };
  }

  public async init(): Promise<void> {
    await this.ledgerManager.init();
  }

  public async switchLedger(ledgerId: string): Promise<boolean> {
    const switched = await this.ledgerManager.switchLedger(ledgerId);
    if (switched) {
      this.notify();
    }
    return switched;
  }

  public async importParsedData(parsedData: LedgerFacadeState['rawTransactions'], dirHandle: import('@system/filesystem/fs-storage').StorageDirHandle): Promise<void> {
    await this.ledgerService.ingestParsedData(parsedData, dirHandle);
  }

  public async importRawData(parsedData: LedgerFacadeState['rawTransactions']): Promise<void> {
    await this.ledgerService.ingestRawData(parsedData);
  }

  public updateTransactionCategory(id: string, category: string, reasoning?: string): void {
    this.ledgerService.updateCategory(id, category, reasoning);
  }

  public updateUserNote(id: string, note: string): void {
    this.ledgerService.updateUserNote(id, note);
  }

  public setTransactionVerification(id: string, isVerified: boolean): void {
    this.ledgerService.setVerification(id, isVerified);
  }

  public setFilter(filter: string): void {
    this.ledgerService.setFilter(filter);
  }

  public setDateRange(range: { start: Date | null; end: Date | null }): void {
    this.ledgerService.setDateRange(range);
  }

  public async reloadLedgerMemory(): Promise<void> {
    await this.ledgerService.reloadMemory();
  }

  public async startAiProcessing(): Promise<void> {
    await this.batchProcessor.run();
  }

  public stopAiProcessing(): void {
    this.batchProcessor.stop();
  }

  private toHomeAiState(currentLedgerId: string, pendingCount: number): HomeAiEngineUiState {
    const status: HomeAiEngineUiState['status'] = this.aiStatus === 'ERROR'
      ? 'error'
      : this.aiStatus === 'ANALYZING'
        ? (this.batchProcessor.isStopping ? 'draining' : 'running')
        : pendingCount > 0
          ? 'paused'
          : 'idle';

    return {
      status,
      activeLedger: currentLedgerId,
      activeDate: this.aiProgress.currentDate || null,
      hasPendingInRange: pendingCount > 0,
      hasPendingOutOfRange: false,
      pendingCount,
      lastLearnedAt: null,
      lastLearningNotice: null,
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

