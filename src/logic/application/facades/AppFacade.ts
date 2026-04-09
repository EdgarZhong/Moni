import { BatchProcessor } from '@logic/application/ai/BatchProcessor';
import { classifyQueue } from '@logic/application/ai/ClassifyQueue';
import { LearningSession } from '@logic/application/ai/LearningSession';
import type { AIProgress, AIStatus } from '@logic/application/ai/types';
import { ExampleStore } from '@logic/application/services/ExampleStore';
import { LedgerPreferencesManager } from '@logic/application/services/LedgerPreferencesManager';
import { MemoryManager } from '@logic/application/services/MemoryManager';
import { SelfDescriptionManager } from '@system/config/SelfDescriptionManager';
import { SnapshotManager } from '@logic/application/services/SnapshotManager';
import { BudgetManager } from '@logic/application/services/BudgetManager';
import { LedgerManager } from '@logic/application/services/LedgerManager';
import { LedgerService } from '@logic/application/services/LedgerService';
import { ManualEntryManager } from '@logic/application/services/ManualEntryManager';
import type { ManualEntryInput } from '@logic/application/services/ManualEntryManager';
import { ConfigManager } from '@system/config/ConfigManager';
import { LLMClient } from '@logic/application/llm/LLMClient';
import type {
  EntryPageReadModel,
  EntryRecentReference,
  HomeAiEngineUiState,
  HomeBudgetCardReadModel,
  HomeDayGroupReadModel,
  HomeHintCardReadModel,
  HomeTransactionReadModel,
  HomeTrendCardReadModel,
  HomeTrendPoint,
  LedgerCategoryDefinition,
  LedgerFacadeState,
  LedgerOption,
  MoniHomeReadModel,
  SettingsPageReadModel,
} from '@shared/types';
import type { FullTransactionRecord } from '@shared/types/metadata';

const HOME_TREND_DAYS = 30;
const HOME_TREND_WINDOW_SIZE = 7;

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
    keys.push(toLocalDateKey(date));
  }
  return keys;
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 规范化首页日期范围。
 * - 未传入时退回到账本全范围
 * - 兜底保证 start <= end
 */
function normalizeHomeDateRange(
  range: { start: Date | null; end: Date | null },
  bounds: { min: Date | null; max: Date | null }
): { start: Date | null; end: Date | null } {
  const fallbackStart = bounds.min;
  const fallbackEnd = bounds.max;
  const start = range.start ?? fallbackStart;
  const end = range.end ?? fallbackEnd;
  if (!start || !end) {
    return { start: fallbackStart, end: fallbackEnd };
  }
  if (start.getTime() <= end.getTime()) {
    return { start, end };
  }
  return { start: end, end: start };
}

/**
 * 判断某个日期键是否落在首页当前范围内。
 */
function isDateKeyInRange(dateKey: string, range: { start: Date | null; end: Date | null }): boolean {
  if (!range.start || !range.end) {
    return true;
  }
  const date = new Date(`${dateKey}T00:00:00`);
  return date.getTime() >= range.start.getTime() && date.getTime() <= range.end.getTime();
}

/**
 * 基于完整趋势历史和窗口偏移量构建首页 trendCard。
 */
function buildTrendCard(
  points: HomeTrendPoint[],
  requestedOffset: number
): HomeTrendCardReadModel {
  const maxOffset = Math.max(0, points.length - HOME_TREND_WINDOW_SIZE);
  const windowOffset = Math.max(0, Math.min(requestedOffset, maxOffset));
  const startIndex = Math.max(0, points.length - HOME_TREND_WINDOW_SIZE - windowOffset);
  const sliced = points.slice(startIndex, startIndex + HOME_TREND_WINDOW_SIZE);
  return {
    windowSize: HOME_TREND_WINDOW_SIZE,
    points: sliced,
    windowStart: sliced[0]?.key ?? null,
    windowEnd: sliced[sliced.length - 1]?.key ?? null,
    hasEarlierWindow: startIndex > 0,
    hasLaterWindow: startIndex + sliced.length < points.length,
    windowOffset,
  };
}

function toHomeTransaction(txId: string, record: FullTransactionRecord, index: number): HomeTransactionReadModel {
  const normalizedProduct = record.product.trim();
  const normalizedCounterparty = record.counterparty.trim();
  const title = record.sourceType === 'manual'
    ? (normalizedProduct || '来自随手记')
    : (normalizedProduct && normalizedProduct !== '/' && normalizedProduct !== 'Unknown'
      ? normalizedProduct
      : (normalizedCounterparty || '未知'));
  const sourceLabel = record.sourceType === 'manual'
    ? '随手记'
    : record.sourceType === 'wechat'
      ? '微信'
      : '支付宝';

  return {
    id: txId,
    title,
    amount: record.amount,
    time: record.time.slice(11, 16),
    sourceType: record.sourceType,
    sourceLabel,
    paymentMethod: record.paymentMethod || '',
    category: record.user_category || record.ai_category || record.category || null,
    userCategory: record.user_category || null,
    aiCategory: record.ai_category || null,
    reasoning: record.ai_reasoning || null,
    userNote: record.user_note || null,
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
  private readonly manualEntryManager = ManualEntryManager.getInstance();
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

  public async getMoniHomeReadModel(input?: {
    now?: Date;
    trendWindowOffset?: number;
    homeDateRange?: { start: Date | null; end: Date | null };
  }): Promise<MoniHomeReadModel> {
    const now = input?.now ?? new Date();
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

    const sortedEntries = Object.entries(records).sort(([, a], [, b]) => b.time.localeCompare(a.time));
    const fullDataRange = this.computeLedgerBounds(records);
    const selectedHomeDateRange = normalizeHomeDateRange(
      input?.homeDateRange ?? ledgerState.dateRange,
      fullDataRange
    );

    const [availableLedgers, homeBudget, pendingTasks, lastLearningMeta] = await Promise.all([
      this.listLedgerOptions({ syncWithFiles: false }).catch(() => [currentLedger]),
      this.budgetManager.getHomeBudgetReadModel(currentLedgerId, ledgerState.ledgerMemory, { now }),
      classifyQueue.getPending(currentLedgerId).catch(() => []),
      this.loadLastLearningMeta(currentLedgerId),
    ]);

    const todayKey = toLocalDateKey(now);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayKey = toLocalDateKey(yesterday);

    const dayMap = new Map<string, HomeTransactionReadModel[]>();
    const income: MoniHomeReadModel['income'] = [];

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

    const allDailyTransactionGroups: HomeDayGroupReadModel[] = Array.from(dayMap.entries())
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([dateKey, items]) => ({
        id: dateKey,
        label: toDateLabel(dateKey, todayKey, yesterdayKey),
        items,
      }));
    const dailyTransactionGroups = allDailyTransactionGroups.filter((group) =>
      isDateKeyInRange(group.id, selectedHomeDateRange)
    );

    const trendRangeEnd = selectedHomeDateRange.end ?? now;
    const recentDayKeys = buildRecentDays(trendRangeEnd, HOME_TREND_DAYS);
    const trendHistory: HomeTrendPoint[] = recentDayKeys.map((key) => {
      const dayItems = isDateKeyInRange(key, selectedHomeDateRange) ? (dayMap.get(key) ?? []) : [];
      const amount = dayItems.reduce((sum, item) => sum + item.amount, 0);
      const [, month, day] = key.split('-');
      return {
        key,
        label: `${parseInt(month, 10)}/${parseInt(day, 10)}`,
        amount,
      };
    });
    const trendCard = buildTrendCard(trendHistory, input?.trendWindowOffset ?? 0);

    const budgetStatus = homeBudget.monthlyBudget.enabled ? homeBudget.monthlyBudget.status : 'none';
    const budgetCard: HomeBudgetCardReadModel | null = homeBudget.monthlyBudget.enabled
      ? this.budgetManager.toBudgetCard(homeBudget.monthlyBudget)
      : null;
    const hintCards: HomeHintCardReadModel[] = homeBudget.budgetHints;
    return {
      currentLedger,
      availableLedgers,
      categoryDefinitions,
      dailyTransactionGroups,
      income,
      trendCard,
      hintCards,
      budget: {
        enabled: homeBudget.monthlyBudget.enabled,
        status: budgetStatus,
        card: budgetCard,
      },
      unclassifiedCount: dailyTransactionGroups
        .flatMap((group) => group.items)
        .filter((item) => !item.category || item.category === 'uncategorized')
        .length,
      availableCategories: Object.keys(categoryMap),
      aiEngineUiState: this.toHomeAiState(currentLedgerId, pendingTasks, selectedHomeDateRange, lastLearningMeta),
      extensions: {
        budget: {
          status: 'available',
          owner: 'agent3',
          notes: '预算读模型已接入 facade，预算写入与规则演进仍由 Agent 3 负责。',
        },
        manualEntry: {
          status: 'available',
          owner: 'agent4',
          notes: '手记记录已进入首页读模型，录入/删除入口仍由记账页承接。',
        },
        memory: {
          status: lastLearningMeta ? 'available' : 'placeholder',
          owner: 'agent5',
          notes: lastLearningMeta
            ? '已接入最近一次学习快照时间，可用于首页 AI 工作态展示。'
            : '当前账本尚未发现可用学习快照，首页暂不显示学习完成通知。',
        },
      },
      dataRange: {
        min: fullDataRange.min ? toLocalDateKey(fullDataRange.min) : null,
        max: fullDataRange.max ? toLocalDateKey(fullDataRange.max) : null,
      },
      homeDateRange: {
        start: selectedHomeDateRange.start ? toLocalDateKey(selectedHomeDateRange.start) : null,
        end: selectedHomeDateRange.end ? toLocalDateKey(selectedHomeDateRange.end) : null,
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
    const currentLedgerId = this.ledgerManager.getActiveLedgerName();
    if (currentLedgerId) {
      const pendingCount = await classifyQueue.size(currentLedgerId).catch(() => 0);
      if (pendingCount === 0) {
        const records = this.ledgerService.getState().ledgerMemory?.records ?? {};
        const outgoingRecords = Object.values(records).filter((record) =>
          record.transactionStatus === 'SUCCESS' && record.direction === 'out'
        );

        const candidateDates = Array.from(
          new Set(
            outgoingRecords
              .filter((record) =>
                !record.is_verified &&
                (!record.category || record.category === 'uncategorized' || !record.ai_category)
              )
              .map((record) => toDateKey(record.time))
          )
        ).sort();

        if (candidateDates.length === 0 && outgoingRecords.length > 0) {
          const latestDate = toDateKey(outgoingRecords[0].time);
          await classifyQueue.enqueue({ ledger: currentLedgerId, date: latestDate });
        } else {
          for (const date of candidateDates) {
            await classifyQueue.enqueue({ ledger: currentLedgerId, date });
          }
        }
      }
    }
    await this.batchProcessor.run();
  }

  public stopAiProcessing(): void {
    this.batchProcessor.stop();
  }

  private toHomeAiState(
    currentLedgerId: string,
    pendingTasks: Awaited<ReturnType<typeof classifyQueue.getPending>>,
    selectedHomeDateRange: { start: Date | null; end: Date | null },
    lastLearningMeta: { timestamp: string; message: string } | null,
  ): HomeAiEngineUiState {
    const pendingCount = pendingTasks.length;
    const pendingInRangeCount = pendingTasks.filter((task) => isDateKeyInRange(task.date, selectedHomeDateRange)).length;
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
      hasPendingInRange: pendingInRangeCount > 0,
      hasPendingOutOfRange: pendingCount > pendingInRangeCount,
      pendingCount,
      lastLearnedAt: lastLearningMeta?.timestamp ?? null,
      lastLearningNotice: lastLearningMeta
        ? {
            type: 'learned',
            message: lastLearningMeta.message,
          }
        : null,
    };
  }

  // ──────────────────────────────────────────────
  // 记账页
  // ──────────────────────────────────────────────

  public async getEntryPageReadModel(): Promise<EntryPageReadModel> {
    const ledgerState = this.getLedgerState();
    const currentLedgerId = ledgerState.currentLedgerId;
    const currentLedger: LedgerOption = { id: currentLedgerId, name: currentLedgerId };

    const records = ledgerState.ledgerMemory?.records ?? {};
    const categoryMap = ledgerState.ledgerMemory?.defined_categories ?? {};
    const categoryDefinitions: LedgerCategoryDefinition[] = Object.entries(categoryMap).map(
      ([key, description]) => ({ key, label: key, description })
    );

    const [availableLedgers] = await Promise.all([
      this.listLedgerOptions({ syncWithFiles: false }).catch(() => [currentLedger]),
    ]);

    const recentReferences = this.buildRecentReferences(records);

    return {
      currentLedger,
      availableLedgers,
      categoryDefinitions,
      recentReferences,
      isLoading: ledgerState.isLoading,
    };
  }

  public async addManualEntry(input: ManualEntryInput): Promise<string> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) throw new Error('No active ledger');
    const id = await this.manualEntryManager.addEntry(ledgerId, input);
    this.notify();
    return id;
  }

  public async deleteManualEntry(id: string): Promise<void> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) throw new Error('No active ledger');
    await this.manualEntryManager.deleteEntry(ledgerId, id);
    this.notify();
  }

  /**
   * 构建记账页"最近流水参考区"。
   * 规则（来自 Integration Spec §4.4）：
   * - 取当前账本下日期最新的一天
   * - 在该日内按时间倒序取前两条
   * - 不过滤来源类型，不应用首页 data range
   */
  private buildRecentReferences(records: Record<string, FullTransactionRecord>): EntryRecentReference[] {
    const sortedEntries = Object.entries(records)
      .filter(([, r]) => r.transactionStatus === 'SUCCESS')
      .sort(([, a], [, b]) => b.time.localeCompare(a.time));

    if (sortedEntries.length === 0) return [];

    const latestDateKey = sortedEntries[0][1].time.slice(0, 10);
    const latestDayEntries = sortedEntries.filter(([, r]) => r.time.slice(0, 10) === latestDateKey);

    return latestDayEntries.slice(0, 2).map(([txId, record]) => {
      const normalizedProduct = record.product.trim();
      const normalizedCounterparty = record.counterparty.trim();
      const title = record.sourceType === 'manual'
        ? (normalizedProduct || '来自随手记')
        : (normalizedProduct && normalizedProduct !== '/' && normalizedProduct !== 'Unknown'
          ? normalizedProduct
          : (normalizedCounterparty || '未知'));

      return {
        id: txId,
        title,
        amount: record.amount,
        category: record.user_category || record.ai_category || record.category || null,
        direction: record.direction,
      };
    });
  }

  /**
   * 计算账本全量时间边界，专门供首页 Date Range Picker 使用。
   */
  private computeLedgerBounds(records: Record<string, FullTransactionRecord>): { min: Date | null; max: Date | null } {
    const allTimes = Object.values(records)
      .map((record) => record.time.slice(0, 10))
      .sort();
    if (allTimes.length === 0) {
      return { min: null, max: null };
    }
    return {
      min: new Date(`${allTimes[0]}T00:00:00`),
      max: new Date(`${allTimes[allTimes.length - 1]}T00:00:00`),
    };
  }

  /**
   * 读取最近一次学习快照信息。
   * 首页只需要一个轻量通知，不直接展开完整记忆内容。
   */
  private async loadLastLearningMeta(ledgerId: string): Promise<{ timestamp: string; message: string } | null> {
    try {
      const currentId = await SnapshotManager.getCurrentId(ledgerId);
      const lastLearnedRevision = await SnapshotManager.getLastLearnedExampleRevision(ledgerId);
      if (!currentId || lastLearnedRevision <= 0) {
        return null;
      }
      const snapshots = await SnapshotManager.list(ledgerId);
      const currentSnapshot = snapshots.find((snapshot) => snapshot.id === currentId);
      if (!currentSnapshot || currentSnapshot.trigger !== 'ai_learn') {
        return null;
      }
      return {
        timestamp: currentSnapshot.timestamp,
        message: 'AI 已学习新的分类偏好',
      };
    } catch {
      return null;
    }
  }

  // ──────────────────────────────────────────────
  // 设置页
  // ──────────────────────────────────────────────

  public async getSettingsPageReadModel(): Promise<SettingsPageReadModel> {
    const ledgerState = this.getLedgerState();
    const currentLedgerId = ledgerState.currentLedgerId;

    const config = await ConfigManager.getInstance().getConfig();
    const currentProvider = Object.keys(config.providers)[0] ?? 'deepseek';
    const providerConfig = config.providers[currentProvider];

    const aiConfig = {
      provider: currentProvider,
      hasApiKey: Boolean(providerConfig?.apiKey),
      baseUrl: providerConfig?.baseUrl ?? '',
      candidateModels: config.candidateModels ?? [],
      activeModel: config.candidateModels?.[0] ?? '',
      maxTokens: config.globalParams?.maxTokens ?? 4096,
      temperature: config.globalParams?.temperature ?? 0.3,
      enableThinking: config.globalParams?.enableThinking ?? false,
    };

    const selfDescription = await SelfDescriptionManager.getInstance().load() ?? '';

    const ledgerOptions = await this.listLedgerOptions({ syncWithFiles: false }).catch(() => []);
    const ledgers = ledgerOptions.map((l) => ({
      id: l.id,
      name: l.name,
      isDefault: l.id === '日常开销',
    }));

    const categoryMap = ledgerState.ledgerMemory?.defined_categories ?? {};
    const tags = Object.entries(categoryMap).map(([key, description]) => ({
      key,
      description,
      isSystem: key === '其他',
    }));

    const memoryItems = await MemoryManager.getInstance().load(currentLedgerId).catch(() => []);

    let exampleLibrarySummary = { delta: 0, total: 0 };
    try {
      const store = ExampleStore.getInstance();
      const total = await store.count(currentLedgerId);
      const lastRevision = await SnapshotManager.getLastLearnedExampleRevision(currentLedgerId);
      exampleLibrarySummary = { delta: Math.max(0, total - lastRevision), total };
    } catch { /* ignore */ }

    let learningConfig = { autoLearn: true, learningThreshold: 5, compressionThreshold: 30 };
    try {
      const prefs = await LedgerPreferencesManager.getInstance().load(currentLedgerId);
      if (prefs) {
        learningConfig = {
          autoLearn: prefs.auto_learn ?? true,
          learningThreshold: prefs.learning_threshold ?? 5,
          compressionThreshold: prefs.compression_threshold ?? 30,
        };
      }
    } catch { /* ignore */ }

    let budgetConfig = { monthlyTotal: 0, categoryBudgets: {} as Record<string, number> };
    try {
      const budget = await this.budgetManager.load(currentLedgerId);
      if (budget) {
        budgetConfig = {
          monthlyTotal: budget.monthly_total ?? 0,
          categoryBudgets: budget.category_budgets ?? {},
        };
      }
    } catch { /* ignore */ }

    const records = ledgerState.ledgerMemory?.records ?? {};
    const ledgerTransactions = Object.entries(records)
      .filter(([, r]) => r.transactionStatus === 'SUCCESS')
      .map(([id, r]) => ({
        id,
        date: r.time.slice(0, 10),
        title: r.product?.trim() || r.counterparty?.trim() || '未知',
        amount: r.amount,
        category: r.user_category || r.ai_category || r.category || '其他',
        isVerified: r.is_verified ?? false,
      }));

    return {
      aiConfig,
      selfDescription,
      ledgers,
      activeLedgerId: currentLedgerId,
      tags,
      memoryItems,
      exampleLibrarySummary,
      learningConfig,
      budgetConfig,
      ledgerTransactions,
    };
  }

  // AI Config
  public async updateProvider(provider: string): Promise<void> {
    const cm = ConfigManager.getInstance();
    const config = await cm.getConfig();
    if (!config.providers[provider]) {
      config.providers[provider] = { apiKey: '', baseUrl: '' };
    }
    await cm.saveConfig(config);
    this.notify();
  }

  public async updateApiKey(provider: string, key: string): Promise<void> {
    const cm = ConfigManager.getInstance();
    const config = await cm.getConfig();
    if (!config.providers[provider]) {
      config.providers[provider] = { apiKey: '', baseUrl: '' };
    }
    config.providers[provider].apiKey = key;
    await cm.saveConfig(config);
    this.notify();
  }

  public async updateBaseUrl(url: string): Promise<void> {
    const cm = ConfigManager.getInstance();
    const config = await cm.getConfig();
    const provider = Object.keys(config.providers)[0] ?? 'custom';
    if (!config.providers[provider]) {
      config.providers[provider] = { apiKey: '', baseUrl: '' };
    }
    config.providers[provider].baseUrl = url;
    await cm.saveConfig(config);
    this.notify();
  }

  public async updateActiveModel(model: string): Promise<void> {
    const cm = ConfigManager.getInstance();
    const config = await cm.getConfig();
    config.candidateModels = [model];
    await cm.saveConfig(config);
    this.notify();
  }

  public async updateEnableThinking(enabled: boolean): Promise<void> {
    const cm = ConfigManager.getInstance();
    const config = await cm.getConfig();
    config.globalParams.enableThinking = enabled;
    await cm.saveConfig(config);
    this.notify();
  }

  public async testConnection(): Promise<boolean> {
    try {
      const client = LLMClient.getInstance();
      await client.testConnection();
      return true;
    } catch {
      return false;
    }
  }

  // Self description
  public async saveSelfDescription(text: string): Promise<void> {
    await SelfDescriptionManager.getInstance().save(text);
    this.notify();
  }

  // Ledger management
  public async createLedger(name: string): Promise<void> {
    await this.ledgerManager.createLedger(name);
    this.notify();
  }

  public async renameLedger(id: string, newName: string): Promise<void> {
    await this.ledgerManager.renameLedger(id, newName);
    this.notify();
  }

  public async deleteLedger(id: string): Promise<void> {
    await this.ledgerManager.deleteLedger(id);
    this.notify();
  }

  // Tag management
  public async createTag(name: string, desc: string): Promise<void> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return;
    await this.ledgerService.addCategory(ledgerId, name, desc);
    this.notify();
  }

  public async renameTag(oldKey: string, newKey: string): Promise<void> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return;
    await this.ledgerService.renameCategory(ledgerId, oldKey, newKey);
    this.notify();
  }

  public async updateTagDescription(key: string, desc: string): Promise<void> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return;
    await this.ledgerService.updateCategoryDescription(ledgerId, key, desc);
    this.notify();
  }

  public async deleteTag(key: string): Promise<void> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return;
    await this.ledgerService.removeCategory(ledgerId, key);
    this.notify();
  }

  // AI Memory
  public async updateMemoryItems(items: string[]): Promise<void> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return;
    await MemoryManager.getInstance().save(ledgerId, items);
    await SnapshotManager.create(ledgerId, 'user_edit');
    this.notify();
  }

  public async triggerImmediateLearning(): Promise<boolean> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return false;
    try {
      await LearningSession.runImmediate(ledgerId);
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  // Learning settings
  public async updateLearningThreshold(value: number): Promise<void> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return;
    const prefs = await LedgerPreferencesManager.getInstance().load(ledgerId) ?? {};
    prefs.learning_threshold = value;
    await LedgerPreferencesManager.getInstance().save(ledgerId, prefs);
    this.notify();
  }

  public async toggleAutoLearn(enabled: boolean): Promise<void> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return;
    const prefs = await LedgerPreferencesManager.getInstance().load(ledgerId) ?? {};
    prefs.auto_learn = enabled;
    await LedgerPreferencesManager.getInstance().save(ledgerId, prefs);
    this.notify();
  }

  public async updateCompressionThreshold(value: number): Promise<void> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return;
    const prefs = await LedgerPreferencesManager.getInstance().load(ledgerId) ?? {};
    prefs.compression_threshold = value;
    await LedgerPreferencesManager.getInstance().save(ledgerId, prefs);
    this.notify();
  }

  // Budget
  public async updateMonthlyBudget(amount: number): Promise<void> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return;
    await this.budgetManager.setMonthlyTotal(ledgerId, amount);
    this.notify();
  }

  public async updateCategoryBudget(tag: string, amount: number): Promise<void> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return;
    await this.budgetManager.setCategoryBudget(ledgerId, tag, amount);
    this.notify();
  }

  // Reclassification
  public async triggerFullReclassification(): Promise<void> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return;
    await this.batchProcessor.triggerFullReclassification(ledgerId);
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
