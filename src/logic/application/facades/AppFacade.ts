import { BatchProcessor } from '@logic/application/ai/BatchProcessor';
import { classifyIndex } from '@logic/application/ai/ClassifyQueue';
import { CompressionSession } from '@logic/application/ai/CompressionSession';
import { LearningAutomationService, type AutoLearningEvent } from '@logic/application/ai/LearningAutomationService';
import { LearningSession } from '@logic/application/ai/LearningSession';
import type { AIProgress, AIStatus } from '@logic/application/ai/types';
import { ExampleStore } from '@logic/application/services/ExampleStore';
import { HomeHintStateManager } from '@logic/application/services/HomeHintStateManager';
import { HomeHintSystemBuilder } from '@logic/application/services/HomeHintSystemBuilder';
import { LedgerPreferencesManager } from '@logic/application/services/LedgerPreferencesManager';
import { MemoryManager } from '@logic/application/services/MemoryManager';
import { SelfDescriptionManager } from '@system/config/SelfDescriptionManager';
import { SnapshotManager } from '@logic/application/services/SnapshotManager';
import { BudgetManager } from '@logic/application/services/BudgetManager';
import { BillImportManager } from '@logic/application/services/BillImportManager';
import { LedgerManager } from '@logic/application/services/LedgerManager';
import { LedgerService } from '@logic/application/services/LedgerService';
import { ManualEntryManager } from '@logic/application/services/ManualEntryManager';
import type { ManualEntryInput } from '@logic/application/services/ManualEntryManager';
import { ConfigManager } from '@system/config/ConfigManager';
import { LLMClient } from '@logic/application/llm/LLMClient';
import { DemoSeedInstaller } from '@system/filesystem/DemoSeedInstaller';
import type {
  BillImportExecutionResult,
  BillImportOptions,
  BillImportProbeResult,
  EntryPageReadModel,
  EntryRecentReference,
  FullReclassificationSubmitResult,
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
  InsightsViewData,
  InsightsCashflowBucket,
  InsightsCategoryBreakdownTabData,
  InsightsCategorySlice,
  InquiryFilter,
  InquiryViewData,
  InquiryViewStateCode,
  InquiryDayGroup,
} from '@shared/types';
import type { FullTransactionRecord } from '@shared/types/metadata';

const HOME_TREND_DAYS = 30;
const HOME_TREND_WINDOW_SIZE = 7;
type ZeroMemoryWarningChoice = 'classify7days' | 'consumeAll' | 'cancel';

/**
 * 顶部轻提示事件。
 * AppRoot 订阅后会把这些事件渲染成全局顶部提示。
 */
export interface TopNoticeEvent {
  title: string;
  message: string;
}

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

// ──────────────────────────────────────────────
// 请教页视图构建辅助函数（§2.3）
// ──────────────────────────────────────────────

/** confidence 对应的不确定度评分：low=3 / medium=2 / high or ''=1 */
function inquiryConfidenceScore(confidence: string): number {
  if (confidence === 'low') return 3;
  if (confidence === 'medium') return 2;
  return 1;
}

/** §2.3-D.3 可操作性判定 */
function inquiryIsOperable(t: FullTransactionRecord, filter: InquiryFilter): boolean {
  if (t.ai_needs_review) return true; // 不变量1：ai_needs_review=true 任何 filter 下均可操作
  // 不变量2：confidence_rank >= filter_rank 时可操作
  const filterRank = filter === 'low' ? 3 : filter === 'medium' ? 2 : 1;
  return inquiryConfidenceScore(t.ai_confidence) >= filterRank;
}

/**
 * 构建原始天组（不带 filter 过滤）。
 * 天 D 进入集合 ⟺ 当天存在 ai_needs_review=true && is_verified=false 的条目。
 * 每天附带当天全部 is_verified=false 的条目（含上下文条目），按时间升序排列。
 * 天级按 day_uncertainty_score 降序排列，同分按日期降序。
 */
function buildInquiryRawDays(allRecords: FullTransactionRecord[]): InquiryDayGroup[] {
  const reviewDates = new Set<string>();
  for (const r of allRecords) {
    if (r.ai_needs_review && !r.is_verified) {
      reviewDates.add(r.time.slice(0, 10));
    }
  }
  if (reviewDates.size === 0) return [];

  const dayMap = new Map<string, FullTransactionRecord[]>();
  for (const date of reviewDates) {
    dayMap.set(date, []);
  }
  for (const r of allRecords) {
    if (r.is_verified) continue;
    const date = r.time.slice(0, 10);
    if (dayMap.has(date)) {
      dayMap.get(date)!.push(r);
    }
  }

  const days: InquiryDayGroup[] = Array.from(dayMap.entries()).map(([date, txns]) => {
    const reviewItems = txns.filter((r) => r.ai_needs_review && !r.is_verified);
    const scoreSum = reviewItems.reduce((s, r) => s + inquiryConfidenceScore(r.ai_confidence), 0);
    const dayUncertaintyScore = reviewItems.length > 0 ? scoreSum / reviewItems.length : 0;
    const sortedTxns = [...txns].sort((a, b) => a.time.localeCompare(b.time));
    return { date, dayUncertaintyScore, transactions: sortedTxns };
  });

  days.sort((a, b) => {
    const diff = b.dayUncertaintyScore - a.dayUncertaintyScore;
    return diff !== 0 ? diff : b.date.localeCompare(a.date);
  });

  return days;
}

/** §2.3-D.4 天卡片可见性过滤：保留当天至少有一个可操作条目的天 */
function filterInquiryDays(days: InquiryDayGroup[], filter: InquiryFilter): InquiryDayGroup[] {
  return days.filter((day) => day.transactions.some((t) => inquiryIsOperable(t, filter)));
}

/**
 * 规范化首页日期范围。
 * - 未传入时退回到账本全范围
 * - 兜底保证 start <= end
 */
function normalizeHomeDateRange(
  range: { start: Date | null; end: Date | null; isEmpty?: boolean },
  bounds: { min: Date | null; max: Date | null }
): { start: Date | null; end: Date | null; isEmpty?: boolean } {
  const fallbackStart = bounds.min;
  const fallbackEnd = bounds.max;
  if (range.isEmpty) {
    return {
      start: range.start ?? fallbackStart,
      end: range.end ?? fallbackEnd,
      isEmpty: true,
    };
  }
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
  if ((range as { isEmpty?: boolean }).isEmpty) {
    return false;
  }
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
    allPoints: points,
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
    originalId: record.originalId || null,
    title,
    amount: record.amount,
    time: record.time.slice(11, 16),
    fullTime: record.time,
    sourceType: record.sourceType,
    sourceLabel,
    paymentMethod: record.paymentMethod || '',
    rawClass: record.rawClass || null,
    counterparty: normalizedCounterparty || null,
    product: normalizedProduct || null,
    transactionStatus: record.transactionStatus || null,
    category: record.user_category || record.ai_category || record.category || null,
    userCategory: record.user_category || null,
    aiCategory: record.ai_category || null,
    reasoning: record.ai_reasoning || null,
    userNote: record.user_note || null,
    remark: record.remark && record.remark !== '/' ? record.remark : null,
    direction: record.direction,
    isVerified: record.is_verified,
    updatedAt: record.updated_at || null,
    sequence: index,
  };
}

export class AppFacade {
  private static instance: AppFacade;
  /**
   * 只在“切换 provider 且该 provider 尚未选过模型”时使用的推荐默认值。
   * 当前 release 以 DeepSeek 为默认供应商，因此这里把 DeepSeek 默认指向 V4 Pro。
   */
  private static readonly PROVIDER_DEFAULT_MODELS: Record<string, string> = {
    deepseek: 'deepseek-v4-pro',
    moonshot: 'moonshot-v1-8k',
    siliconflow: 'deepseek-ai/DeepSeek-R1',
    modelscope: 'deepseek-ai/DeepSeek-R1',
    zhipu: 'GLM-4.6',
    custom: 'default-model',
  };

  private readonly ledgerService = LedgerService.getInstance();
  private readonly ledgerManager = LedgerManager.getInstance();
  private readonly budgetManager = BudgetManager.getInstance();
  private readonly billImportManager = BillImportManager.getInstance();
  private readonly batchProcessor = BatchProcessor.getInstance();
  private readonly manualEntryManager = ManualEntryManager.getInstance();
  private readonly listeners = new Set<() => void>();
  private readonly topNoticeListeners = new Set<(event: TopNoticeEvent) => void>();
  /**
   * 记录“分类真正开始前，用户已经请求停止”这一瞬时意图。
   *
   * 目前最关键的场景是：
   * 1. 用户手动开启分类
   * 2. 系统先进入前置学习会话
   * 3. 用户在学习进行中点了“停止”
   *
   * 此时学习会话本身仍继续完成，但后续必须中断，不再进入 BatchProcessor 分类阶段。
   */
  private stopRequestedBeforeBatchStart = false;

  private aiStatus: AIStatus = 'IDLE';
  private aiProgress: AIProgress = { total: 0, current: 0, currentDate: '', currentDates: [] };

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

  /**
   * 订阅顶部轻提示事件。
   */
  public subscribeTopNoticeEvents(listener: (event: TopNoticeEvent) => void): () => void {
    this.topNoticeListeners.add(listener);
    return () => {
      this.topNoticeListeners.delete(listener);
    };
  }

  public subscribeAutoLearningEvents(listener: (event: AutoLearningEvent) => void): () => void {
    return LearningAutomationService.subscribe(listener);
  }

  /**
   * 统一向外发出顶部轻提示。
   */
  private emitTopNotice(event: TopNoticeEvent): void {
    for (const listener of this.topNoticeListeners) {
      try {
        listener(event);
      } catch (error) {
        console.warn('[AppFacade] top notice listener failed:', error);
      }
    }
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
    homeDateRange?: { start: Date | null; end: Date | null; isEmpty?: boolean };
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

    const [availableLedgers, homeBudget, pendingTasks, lastLearningMeta, selfDescription, onboardingState] = await Promise.all([
      this.listLedgerOptions({ syncWithFiles: false }).catch(() => [currentLedger]),
      this.budgetManager.getHomeBudgetReadModel(currentLedgerId, ledgerState.ledgerMemory, { now }),
      classifyIndex.getPending(currentLedgerId).catch(() => []),
      this.loadLastLearningMeta(currentLedgerId),
      SelfDescriptionManager.load().catch(() => '') ?? '',
      HomeHintStateManager.getInstance().load(currentLedgerId),
    ]);

    const todayKey = toLocalDateKey(now);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayKey = toLocalDateKey(yesterday);

    /**
     * 首页日流水列表当前口径已收敛为“收支混排”：
     * - `dayMap` 承接当前范围内所有成功交易，不再只塞支出；
     * - 这样二维码收款、红包收款等收入条目也会出现在当天日卡里；
     * - 统计摘要里的收入聚合仍单独走 `income[]`，避免表现层自己重新猜收入。
     */
    const dayMap = new Map<string, HomeTransactionReadModel[]>();
    const income: MoniHomeReadModel['income'] = [];
    let totalTransactionCount = 0;

    let itemIndex = 0;
    for (const [txId, record] of sortedEntries) {
      if (record.transactionStatus !== 'SUCCESS') {
        continue;
      }

      const dateKey = toDateKey(record.time);
      if (isDateKeyInRange(dateKey, selectedHomeDateRange)) {
        totalTransactionCount += 1;
      }
      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, []);
      }
      dayMap.get(dateKey)?.push(toHomeTransaction(txId, record, itemIndex));
      itemIndex += 1;

      /**
       * 收入汇总卡仍只统计真实入账。
       * 日卡现在已经混排收支，因此这里不能再把全部条目都累到 `income`，否则统计会失真。
       */
      if (record.direction === 'in') {
        const existingIncome = income.find((entry) => entry.date === dateKey);
        if (existingIncome) {
          existingIncome.amount += record.amount;
        } else {
          income.push({ date: dateKey, amount: record.amount });
        }
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

    // 趋势图覆盖账本全历史：从账本实际最早有记录的日期到今天，而不是固定天数。
    // 当账本无任何记录时退回到 HOME_TREND_DAYS（30天）保底。
    const sortedDayKeys = Array.from(dayMap.keys()).sort();
    const earliestKey = sortedDayKeys.length > 0 ? sortedDayKeys[0] : null;
    const trendDays = earliestKey
      ? Math.max(HOME_TREND_DAYS, Math.round(
          (new Date(toLocalDateKey(now) + 'T00:00:00').getTime() -
           new Date(earliestKey + 'T00:00:00').getTime()) / 86400000
        ) + 1)
      : HOME_TREND_DAYS;
    const recentDayKeys = buildRecentDays(now, trendDays);
    const trendHistory: HomeTrendPoint[] = recentDayKeys.map((key) => {
      const dayItems = dayMap.get(key) ?? [];
      // 趋势图只统计支出（direction === 'out'），收入不计入
      const amount = dayItems.filter((item) => item.direction === 'out').reduce((sum, item) => sum + item.amount, 0);
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
    /**
     * onboarding 的“导入账单”步骤只认真实账单导入结果。
     * 因此这里不能把 manual 条目算作“已导入”。
     */
    const hasImportedTransactions = Object.values(records).some((record) =>
      record.transactionStatus === 'SUCCESS' &&
      (record.sourceType === 'wechat' || record.sourceType === 'alipay')
    );
    const hintCards: HomeHintCardReadModel[] = HomeHintSystemBuilder.build({
      selfDescription,
      hasMonthlyBudget: homeBudget.monthlyBudget.enabled,
      hasImportedTransactions,
      lastBillImportAt: onboardingState.lastBillImportAt,
      onboardingState,
      budgetHints: homeBudget.budgetHints,
    });
    return {
      currentLedger,
      availableLedgers,
      categoryDefinitions,
      dailyTransactionGroups,
      income,
      totalTransactionCount,
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
        isEmpty: selectedHomeDateRange.isEmpty === true,
      },
      isLoading: ledgerState.isLoading,
    };
  }

  public async init(): Promise<void> {
    /**
     * 原生演示包首启时，优先尝试把随 APK 携带的 demo seed 写入正式沙盒目录。
     *
     * 这样后续 LedgerManager / ConfigManager 看到的就是已经就位的真实持久化文件，
     * 不需要为“预置演示数据”再走一套旁路读取逻辑。
     */
    await DemoSeedInstaller.installIfNeeded();
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

  /**
   * 账单导入预探测接口。
   * 表现层应先调用这个接口，再决定是否展示密码输入和导入确认。
   */
  public async probeBillImportFiles(
    files: File[],
    options: BillImportOptions = {},
  ): Promise<BillImportProbeResult> {
    return await this.billImportManager.probeFiles(files, options);
  }

  /**
   * 账单文件导入接口。
   * 内部默认写入当前激活账本，并返回结构化导入结果给表现层 / 调试工具。
   */
  public async importBillFiles(
    files: File[],
    options: BillImportOptions = {},
  ): Promise<BillImportExecutionResult> {
    const result = await this.billImportManager.importFiles(files, options);
    // 导入成功后记录时间戳，供首页提示引擎计算距上次导入天数
    const currentLedgerId = this.ledgerManager.getActiveLedgerName();
    if (currentLedgerId && result.importedCount > 0) {
      HomeHintStateManager.getInstance().markBillImported(currentLedgerId).catch(() => {});
    }
    return result;
  }

  public updateTransactionCategory(id: string, category: string, reasoning?: string): void {
    this.ledgerService.updateCategory(id, category, reasoning);
  }

  public updateUserReasoning(id: string, note: string): void {
    this.ledgerService.updateUserReasoning(id, note);
  }

  public updateTransactionRemark(id: string, remark: string): void {
    this.ledgerService.updateRemark(id, remark);
  }

  public updateUserNote(id: string, note: string): void {
    /**
     * 当前正式口径中，用户只可编辑“说明 / 理由”，写入 user_note；
     * 原始账单里的 remark 继续只读展示，不再允许旧兼容路径把用户输入混写到 remark。
     */
    this.ledgerService.updateUserReasoning(id, note);
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

  public async startAiProcessing(
    onShowZeroMemoryDialog?: (latestDate: Date, daysCount: number) => Promise<ZeroMemoryWarningChoice>
  ): Promise<void> {
    const currentLedgerId = this.ledgerManager.getActiveLedgerName();
    console.log(`[MONI_AI_DEBUG][AppFacade] startAiProcessing triggered for ledger: ${currentLedgerId}`);
    this.stopRequestedBeforeBatchStart = false;

    if (currentLedgerId) {
      let completedPreLearningBeforeClassification = false;
      /**
       * 关键口径收口：
       * “开始分类”只应服务于当前真的存在可分类任务的场景。
       *
       * 因此前置学习不能先于“是否有可消费分类任务”这个判断。
       * 否则会出现：
       * 1. 当前 data range 内根本没有可分类日期
       * 2. 但实例库恰好还有未学习增量
       * 3. 用户点击“开始分类”后，系统意外触发学习
       *
       * 这不符合用户对“分类引擎”入口的预期。
       */
      const ledgerState = this.ledgerService.getState();
      const currentDateRange = ledgerState.dateRange;
      const pendingTasks = await classifyIndex.getPending(currentLedgerId).catch(() => []);
      const consumableTasks = pendingTasks.filter((task) => isDateKeyInRange(task.date, currentDateRange));
      const pendingCount = pendingTasks.length;
      const consumableDates = Array.from(new Set(consumableTasks.map((task) => task.date))).sort();

      if (consumableDates.length === 0) {
        console.log('[MONI_AI_DEBUG][AppFacade] No consumable classify tasks in current data range, skip pre-learning and classification start.');
        this.stopRequestedBeforeBatchStart = false;
        return;
      }

      /**
       * 用户主动点击“开始分类”时，先检查是否存在尚未学习的实例增量。
       * 若存在，必须先做一轮学习，再进入正式分类。
       *
       * UI 口径：
       * 1. AI 工作态立即亮起，表示系统已经开始处理用户请求
       * 2. currentDates 保持为空，避免首页误以为“某一天已经在分类”
       */
      const learningState = await LearningAutomationService.inspect(currentLedgerId).catch((error) => {
        console.warn('[MONI_AI_DEBUG][AppFacade] Failed to inspect pending learning window, continue:', error);
        return null;
      });

      if (learningState && learningState.pendingCount > 0) {
        const previousAiState = this.snapshotAiState();
        this.emitTopNotice({
          title: 'AI 正在自动学习',
          message: '有尚未学习的实例，AI 正在自动学习。',
        });
        this.setPreLearningAiWorkingState();

        const categories = this.ledgerService.getState().ledgerMemory?.defined_categories ?? {};
        const learningResult = await LearningSession.run(currentLedgerId, categories);
        if (!learningResult.success) {
          console.error('[MONI_AI_DEBUG][AppFacade] Pre-learning failed, abort AI processing:', learningResult.error);
          this.stopRequestedBeforeBatchStart = false;
          this.restoreAiState(previousAiState);
          return;
        }

        /**
         * 学习阶段如果用户已经点过“停止”，本轮要求是：
         * - 允许这次学习会话自然完成
         * - 但学习结束后不得继续进入分类
         */
        if (this.stopRequestedBeforeBatchStart) {
          console.log('[MONI_AI_DEBUG][AppFacade] Stop requested during pre-learning, skip classification start.');
          this.stopRequestedBeforeBatchStart = false;
          this.restoreAiState(previousAiState);
          return;
        }
        completedPreLearningBeforeClassification = true;
      }

      /**
       * 新口径下，”开始消费”是纯只读启动信号：
       * - 只允许读取当前 queue 状态
       * - 不允许在 queue 为空时重扫账本并补生产任务
       *
       * 任务生产必须由导入 / 重分类 / 用户操作等被动外部事件同步完成。
       */
      console.log(`[MONI_AI_DEBUG][AppFacade] Existing pending queue size: ${pendingCount}`);

      // 检查零记忆警告条件
      if (onShowZeroMemoryDialog && pendingCount > 7) {
        try {
          // 如果过滤后的消费日期数 > 7，显示零记忆警告弹窗
          if (consumableDates.length > 7) {
            const hasMemory = await this.checkHasMemory(currentLedgerId);

            if (!hasMemory) {
              // 最晚日期（最后一个待处理日期）
              const latestDateStr = consumableDates[consumableDates.length - 1];
              /**
               * 这里必须按“本地自然日”解析日期键。
               * 首页范围过滤、DateRangePicker 展示、消费窗口口径都基于本地日历日；
               * 若改用 UTC 零点，在 UTC 负时区设备上会整体偏移一天。
               */
              const latestDate = new Date(`${latestDateStr}T00:00:00`);

              // 显示弹窗，等待用户选择
              const userChoice = await onShowZeroMemoryDialog(latestDate, consumableDates.length);

              /**
               * 关闭弹窗属于用户显式取消本次启动。
               * 这里必须直接返回，不能继续跑 BatchProcessor。
               */
              if (userChoice === 'cancel') {
                this.stopRequestedBeforeBatchStart = false;
                return;
              }

              if (userChoice === 'classify7days') {
                // 用户选择只分类 7 天，自动调整 data range
                const adjustedRange = this.computeAdjustedDateRangeFor7Days(latestDate);
                this.ledgerService.setDateRange({
                  start: adjustedRange.start,
                  end: adjustedRange.end,
                });
              }
              // 如果选择 'consumeAll'，保持原 data range，继续执行
            }
          }
        } catch (err) {
          console.warn('[MONI_AI_DEBUG][AppFacade] Zero memory check failed, continue:', err);
          // 检查失败时不阻断消费，直接继续
        }
      }

      /**
       * 前置学习完成后，如果在真正进入 BatchProcessor 之前用户又发出了停止请求，
       * 也必须直接中断，不允许继续开始分类。
       */
      if (this.stopRequestedBeforeBatchStart) {
        console.log('[MONI_AI_DEBUG][AppFacade] Stop requested before BatchProcessor.run(), abort classification start.');
        this.stopRequestedBeforeBatchStart = false;
        this.aiStatus = 'IDLE';
        this.aiProgress = {
          total: 0,
          current: 0,
          currentDate: '',
          currentDates: []
        };
        this.notify();
        return;
      }

      if (completedPreLearningBeforeClassification) {
        this.emitTopNotice({
          title: '已学习完成',
          message: '已学习完成，开始进行分类。',
        });
      }

      /**
       * 只有走过前置检查且没有被中途取消，这次“主动开启 AI 分类”才算成立。
       * 这里再落盘 onboarding 状态，避免用户只打开了风险提示或半路取消，也被误判成完成。
       */
      await HomeHintStateManager.getInstance().markAiStarted(currentLedgerId).catch((error) => {
        console.warn('[MONI_AI_DEBUG][AppFacade] Failed to persist ai-started onboarding state:', error);
      });
      this.notify();
    }

    console.log(`[MONI_AI_DEBUG][AppFacade] Invoking BatchProcessor.run()`);
    try {
      await this.batchProcessor.run();
      console.log(`[MONI_AI_DEBUG][AppFacade] BatchProcessor.run() completed.`);
    } catch (err) {
      console.error(`[MONI_AI_DEBUG][AppFacade] BatchProcessor.run() error:`, err);
    } finally {
      this.stopRequestedBeforeBatchStart = false;
    }
  }

  public stopAiProcessing(): void {
    /**
     * 若当前 facade 正处于“只亮 AI 工作态、但 아직未进入任何 activeDates”的阶段，
     * 这代表系统仍在前置学习或即将进入分类前的短暂窗口。
     * 此时停止请求应被记住，等学习完成后直接中断，不再继续开始分类。
     */
    if (
      this.aiStatus === 'ANALYZING' &&
      !this.aiProgress.currentDate &&
      this.aiProgress.currentDates.length === 0
    ) {
      this.stopRequestedBeforeBatchStart = true;
      this.notify();
    }
    this.batchProcessor.stop();
  }

  /**
   * 标记：用户已经完成一次分类后交互学习。
   * 当前由首页在“打开详情页”或“完成拖拽改分类”后调用。
   */
  public async markHomePostAiInteractionCompleted(): Promise<void> {
    const currentLedgerId = this.ledgerManager.getActiveLedgerName();
    if (!currentLedgerId) {
      return;
    }

    await HomeHintStateManager.getInstance().markPostAiInteractionCompleted(currentLedgerId).catch((error) => {
      console.warn('[AppFacade] Failed to persist post-ai interaction onboarding state:', error);
    });
    this.notify();
  }

  /**
   * 检查账本是否有激活的记忆
   */
  private async checkHasMemory(ledgerName: string): Promise<boolean> {
    try {
      const memories = await MemoryManager.load(ledgerName);
      return memories.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * 自动调整 data range 为 7 天窗口
   * 从最晚日期往前倒 7 天
   *
   * 注：返回调整后的 start 和 end，UI 层负责同步更新 rangeMode 为 'custom'
   */
  public computeAdjustedDateRangeFor7Days(latestDate: Date): { start: Date; end: Date } {
    const startDate = new Date(latestDate);
    startDate.setDate(startDate.getDate() - 6);
    return { start: startDate, end: latestDate };
  }

  /**
   * 复制当前 facade 层 AI 状态。
   * 这里要显式复制 currentDates，避免后续被引用共享污染。
   */
  private snapshotAiState(): { status: AIStatus; progress: AIProgress } {
    return {
      status: this.aiStatus,
      progress: {
        ...this.aiProgress,
        currentDates: [...this.aiProgress.currentDates]
      }
    };
  }

  /**
   * 恢复 facade 层 AI 状态。
   * 主要用于“强制学习失败，尚未真正进入 BatchProcessor”这一类早停场景。
   */
  private restoreAiState(state: { status: AIStatus; progress: AIProgress }): void {
    this.aiStatus = state.status;
    this.aiProgress = {
      ...state.progress,
      currentDates: [...state.progress.currentDates]
    };
    this.notify();
  }

  /**
   * 进入“分类前先学习”的临时工作态。
   * 这时只点亮 AI 正在处理，不声明任何 activeDate / activeDates，
   * 避免首页把学习阶段误渲染成某几天已经开始正式分类。
   */
  private setPreLearningAiWorkingState(): void {
    this.aiStatus = 'ANALYZING';
    this.aiProgress = {
      total: 0,
      current: 0,
      currentDate: '',
      currentDates: []
    };
    this.notify();
  }

  private toHomeAiState(
    currentLedgerId: string,
    pendingTasks: Awaited<ReturnType<typeof classifyIndex.getPending>>,
    selectedHomeDateRange: { start: Date | null; end: Date | null; isEmpty?: boolean },
    lastLearningMeta: { timestamp: string; message: string } | null,
  ): HomeAiEngineUiState {
    const pendingCount = pendingTasks.length;
    const pendingInRangeCount = pendingTasks.filter((task) => isDateKeyInRange(task.date, selectedHomeDateRange)).length;
    const status: HomeAiEngineUiState['status'] = this.aiStatus === 'ERROR'
      ? 'error'
      : this.aiStatus === 'ANALYZING'
        ? ((this.batchProcessor.isStopping || this.stopRequestedBeforeBatchStart) ? 'draining' : 'running')
        : pendingCount > 0
          ? 'paused'
          : 'idle';

    return {
      status,
      activeLedger: currentLedgerId,
      activeDate: this.aiProgress.currentDate || null,
      /**
       * 显示层高亮范围只读这里，不再自己猜“当前批次可能是几天”。
       * 这样后续即便引擎批次策略继续变化，首页也只需要跟接口同步。
       */
      activeDates: this.aiProgress.currentDates ?? [],
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
   * 删除任意来源的单条交易记录。
   * ManualEntryManager.deleteEntry 已统一清理实例库、学习评估与 dedup 关联，
   * 不再区分 manual 与账单导入来源。
   */
  public async deleteTransaction(id: string): Promise<void> {
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
    const { provider: currentProvider, model: activeModel } = this.resolveActiveProviderAndModel(config);
    const providerConfig = config.providers[currentProvider] ?? { apiKey: '', baseUrl: '' };
    const candidateModels = config.candidateModels
      .map((item) => {
        const [provider, ...modelParts] = item.split('::');
        return {
          provider,
          model: modelParts.join('::'),
        };
      })
      .filter((item) => item.provider === currentProvider && item.model)
      .map((item) => item.model);

    const aiConfig = {
      provider: currentProvider,
      hasApiKey: Boolean(providerConfig?.apiKey),
      baseUrl: providerConfig?.baseUrl ?? '',
      candidateModels,
      activeModel,
      maxTokens: config.globalParams?.maxTokens ?? 8000,
      temperature: config.globalParams?.temperature ?? 0.2,
      enableThinking: config.globalParams?.enableThinking ?? true,
    };

    const selfDescription = await SelfDescriptionManager.load().catch(() => '') ?? '';

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

    const memoryItems = await MemoryManager.load(currentLedgerId).catch(() => []);
    let currentSnapshotId = await SnapshotManager.getCurrentId(currentLedgerId).catch(() => '');
    let snapshots = await SnapshotManager.list(currentLedgerId)
      .then((items) => items.map((item) => ({
        id: item.id,
        trigger: item.trigger,
        summary: item.summary,
        isCurrent: item.id === currentSnapshotId,
      })))
      .catch(() => []);

    // 兼容老账本：若当前账本缺失快照索引，则自动补建一个迁移快照，
    // 让“AI 记忆 > 历史版本”至少能展示当前版本。
    if (snapshots.length === 0) {
      try {
        await MemoryManager.save(
          currentLedgerId,
          memoryItems,
          'migration',
          '历史快照补建'
        );
        currentSnapshotId = await SnapshotManager.getCurrentId(currentLedgerId).catch(() => '');
        snapshots = await SnapshotManager.list(currentLedgerId)
          .then((items) => items.map((item) => ({
            id: item.id,
            trigger: item.trigger,
            summary: item.summary,
            isCurrent: item.id === currentSnapshotId,
          })))
          .catch(() => []);
      } catch {
        // 补建失败不阻断设置页渲染
      }
    }

    let exampleLibrarySummary = { delta: 0, total: 0 };
    try {
      const stats = await ExampleStore.getStats(currentLedgerId);
      const lastRevision = await SnapshotManager.getLastLearnedExampleRevision(currentLedgerId);
      const delta = await ExampleStore.getLearningDelta(currentLedgerId, lastRevision);
      const pendingDelta = delta.mode === 'full_reconcile'
        ? (delta.allEntries?.length ?? 0)
        : (delta.upserts.length + delta.deletions.length);
      exampleLibrarySummary = { delta: pendingDelta, total: stats.count };
    } catch { /* ignore */ }

    let learningConfig = { autoLearn: true, learningThreshold: 5, compressionThreshold: 30 };
    try {
      const prefs = await LedgerPreferencesManager.getInstance().load(currentLedgerId);
      if (prefs) {
        learningConfig = {
          autoLearn: prefs.learning.autoLearn ?? true,
          learningThreshold: prefs.learning.threshold ?? 5,
          compressionThreshold: prefs.compression.threshold ?? 30,
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
      .map(([id, r], index) => ({
        id,
        date: r.time.slice(0, 10),
        title: r.product?.trim() || r.counterparty?.trim() || '未知',
        amount: r.amount,
        category: r.user_category || r.ai_category || r.category || '其他',
        isVerified: r.is_verified ?? false,
        homeTransaction: toHomeTransaction(id, r, index),
      }));

    return {
      aiConfig,
      selfDescription,
      ledgers,
      activeLedgerId: currentLedgerId,
      tags,
      memoryItems,
      snapshots,
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
    const currentModel = config.candidateModels
      .map((item) => {
        const [providerName, ...modelParts] = item.split('::');
        return {
          providerName,
          model: modelParts.join('::'),
        };
      })
      .find((item) => item.providerName === provider)?.model;
    const fallbackModel = AppFacade.PROVIDER_DEFAULT_MODELS[provider] ?? 'default-model';
    config.candidateModels = [`${provider}::${currentModel || fallbackModel}`];
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
    const { provider } = this.resolveActiveProviderAndModel(config);
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
    const { provider } = this.resolveActiveProviderAndModel(config);
    config.candidateModels = [`${provider}::${model}`];
    await cm.saveConfig(config);
    this.notify();
  }

  public async updateMaxTokens(value: number): Promise<void> {
    const cm = ConfigManager.getInstance();
    const config = await cm.getConfig();
    config.globalParams.maxTokens = Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
    await cm.saveConfig(config);
    this.notify();
  }

  public async updateTemperature(value: number): Promise<void> {
    const cm = ConfigManager.getInstance();
    const config = await cm.getConfig();
    const normalized = Number.isFinite(value) ? Math.min(2, Math.max(0, value)) : 0.2;
    config.globalParams.temperature = normalized;
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
      const llmConfig = await ConfigManager.getInstance().getActiveModelConfig();
      if (!llmConfig.apiKey || !llmConfig.baseUrl || !llmConfig.model) {
        return false;
      }
      const client = new LLMClient({
        apiKey: llmConfig.apiKey,
        baseUrl: llmConfig.baseUrl,
        model: llmConfig.model,
        temperature: llmConfig.temperature,
        maxTokens: llmConfig.maxTokens,
        enableThinking: llmConfig.enableThinking,
      });
      await client.testConnection();
      return true;
    } catch {
      return false;
    }
  }

  private resolveActiveProviderAndModel(config: Awaited<ReturnType<ConfigManager['getConfig']>>): { provider: string; model: string } {
    const fallbackProvider = Object.keys(config.providers).find((name) => Boolean(config.providers[name]?.apiKey))
      ?? 'deepseek';
    const candidate = config.candidateModels[0] ?? '';
    const [providerName, ...modelParts] = candidate.split('::');
    const hasProviderPrefix = modelParts.length > 0;
    const provider = hasProviderPrefix && config.providers[providerName]
      ? providerName
      : fallbackProvider;
    const model = hasProviderPrefix ? (modelParts.join('::') || '') : candidate;
    return { provider, model };
  }

  // Self description
  public async saveSelfDescription(text: string): Promise<void> {
    await SelfDescriptionManager.save(text);
    this.notify();
  }

  // Ledger management
  public async createLedger(name: string): Promise<boolean> {
    const created = await this.ledgerManager.createLedger(name);
    if (created) {
      this.notify();
    }
    return created;
  }

  public async renameLedger(id: string, newName: string): Promise<boolean> {
    const renamed = await this.ledgerManager.renameLedger(id, newName);
    if (renamed) {
      this.notify();
    }
    return renamed;
  }

  public async deleteLedger(id: string): Promise<boolean> {
    const deleted = await this.ledgerManager.deleteLedger(id);
    if (deleted) {
      this.notify();
    }
    return deleted;
  }

  // Tag management
  public async createTag(name: string, desc: string): Promise<void> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return;
    await this.ledgerService.addCategory(name, desc);
    this.notify();
  }

  public async renameTag(oldKey: string, newKey: string): Promise<void> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return;
    await this.ledgerService.renameCategory(oldKey, newKey);
    this.notify();
  }

  public async updateTagDescription(key: string, desc: string): Promise<void> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return;
    await this.ledgerService.updateCategoryDescription(key, desc);
    this.notify();
  }

  public async deleteTag(key: string): Promise<void> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return;
    await this.ledgerService.deleteCategory(key);
    this.notify();
  }

  // AI Memory
  public async updateMemoryItems(items: string[]): Promise<void> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return;
    await MemoryManager.save(ledgerId, items);
    this.notify();
  }

  public async triggerImmediateLearning(): Promise<boolean> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return false;
    try {
      const categories = this.ledgerService.getState().ledgerMemory?.defined_categories ?? {};
      const beforeSnapshotId = await SnapshotManager.getCurrentId(ledgerId);
      const result = await LearningSession.run(ledgerId, categories);
      if (!result.success) {
        return false;
      }
      const afterSnapshotId = await SnapshotManager.getCurrentId(ledgerId);
      this.notify();
      // 返回“是否产生了新历史版本”，用于设置页给出准确反馈。
      return Boolean(afterSnapshotId) && afterSnapshotId !== beforeSnapshotId;
    } catch {
      return false;
    }
  }

  public async rollbackMemorySnapshot(snapshotId: string): Promise<boolean> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return false;
    const rolled = await MemoryManager.rollbackToSnapshot(ledgerId, snapshotId);
    if (rolled) {
      this.notify();
    }
    return rolled;
  }

  public async deleteMemorySnapshot(snapshotId: string): Promise<boolean> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return false;
    const deleted = await SnapshotManager.delete(ledgerId, snapshotId);
    if (deleted) {
      this.notify();
    }
    return deleted;
  }

  // Learning settings
  public async updateLearningThreshold(value: number): Promise<void> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return;
    await LedgerPreferencesManager.getInstance().update(ledgerId, {
      learning: { threshold: value },
    });
    this.notify();
  }

  public async toggleAutoLearn(enabled: boolean): Promise<void> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return;
    await LedgerPreferencesManager.getInstance().update(ledgerId, {
      learning: { autoLearn: enabled },
    });
    this.notify();
  }

  public async updateCompressionThreshold(value: number): Promise<void> {
    const ledgerId = this.ledgerManager.getActiveLedgerName();
    if (!ledgerId) return;
    await LedgerPreferencesManager.getInstance().update(ledgerId, {
      compression: { threshold: value },
    });
    // 收编阈值更新后，按新阈值立即评估一次自动收编，避免用户感知为“设置不生效”。
    void this.evaluateCompressionAfterThresholdUpdate(ledgerId);
    this.notify();
  }

  /**
   * 保存收编阈值后执行一次后台评估：
   * - 达阈值则尝试触发收编
   * - 未达阈值则静默跳过
   * 这层不抛错，避免阻塞设置页保存动作。
   */
  private async evaluateCompressionAfterThresholdUpdate(ledgerId: string): Promise<void> {
    try {
      const prefs = await LedgerPreferencesManager.getInstance().getCompressionPreferences(ledgerId);
      const currentMemory = await MemoryManager.load(ledgerId);
      if (!CompressionSession.shouldTrigger(currentMemory.length, prefs.threshold)) {
        return;
      }

      const categories = this.ledgerService.getState().ledgerMemory?.defined_categories ?? {};
      const result = await CompressionSession.run(ledgerId, categories);
      if (!result.success) {
        console.warn('[AppFacade] Auto compression after threshold update failed:', result.error);
        return;
      }

      this.notify();
    } catch (error) {
      console.warn('[AppFacade] Failed to evaluate compression after threshold update:', error);
    }
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
  public async triggerFullReclassification(unlockTxIds: string[] = []): Promise<FullReclassificationSubmitResult> {
    /**
     * 设置页全量重分类在新的三段式交互里，当前方法只负责：
     * 1. 执行真正的数据提交（解锁 / 分类字段重置 / 实例库清理）
     * 2. 将 dirtyDates 入队
     *
     * 注意：这里故意不再自动启动 BatchProcessor。
     * “是否立即通知 AI 开始消费”由 UI 在提交成功后单独再问一次用户。
     */
    const result = await this.ledgerService.submitFullReclassification(unlockTxIds);
    if (!result.success || !result.enqueueSuccess) {
      throw new Error('submit_full_reclassification_failed');
    }
    this.notify();
    return {
      affectedTxIds: result.affectedTxIds,
      dirtyDates: result.dirtyDates,
      enqueueSuccess: result.enqueueSuccess
    };
  }

  /**
   * 显式通知 AI 引擎开始消费当前账本的已入队日期。
   * 该入口专门给设置页“全量重分类”提交成功后的第三步确认使用。
   */
  public async startQueuedClassification(): Promise<void> {
    await this.startAiProcessing();
  }

  /**
   * 获取洞察页所需的完整聚合数据。
   *
   * 聚合逻辑：
   * - cashflowByMonth / cashflowByWeek：对所有 SUCCESS 交易按月/周分桶求和
   * - categoryBreakdown：按 direction 分流，再按本月 & 历史月分别聚合
   * - 数据层完成聚合，表现层只做渲染
   */
  public async getInsightsViewData(): Promise<InsightsViewData> {
    const ledgerState = this.getLedgerState();
    const records = ledgerState.ledgerMemory?.records ?? {};
    const ledgerName = ledgerState.currentLedgerId;
    const categoryMap = ledgerState.ledgerMemory?.defined_categories ?? {};

    /* 筛选有效交易 */
    const allTx = Object.values(records).filter(
      (r): r is FullTransactionRecord => r.transactionStatus === 'SUCCESS',
    );

    if (allTx.length === 0) {
      return {
        ledger: { name: ledgerName, earliestTxDate: null, latestTxDate: null },
        summary: { totalIncome: 0, totalExpense: 0, netCashflow: 0, coverageStart: null, coverageEnd: null },
        cashflowByMonth: [],
        cashflowByWeek: [],
        categoryBreakdown: {
          expense: { currentMonth: [], byTagHistory: {} },
          income: { currentMonth: [], byTagHistory: {} },
        },
      };
    }

    /* 日期范围 */
    const sortedTimes = allTx.map((r) => r.time.slice(0, 10)).sort();
    const earliestTxDate = sortedTimes[0];
    const latestTxDate = sortedTimes[sortedTimes.length - 1];

    /* ── 月度分桶 ── */
    const monthBuckets = new Map<string, { income: number; expense: number }>();
    for (const tx of allTx) {
      const mk = tx.time.slice(0, 7); // "YYYY-MM"
      if (!monthBuckets.has(mk)) monthBuckets.set(mk, { income: 0, expense: 0 });
      const b = monthBuckets.get(mk)!;
      if (tx.direction === 'in') b.income += tx.amount;
      else b.expense += tx.amount;
    }
    const cashflowByMonth: InsightsCashflowBucket[] = Array.from(monthBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([key, { income, expense }]) => ({ key, income, expense, net: income - expense }));

    /* ── 周分桶 ── */
    const weekBuckets = new Map<string, { income: number; expense: number }>();
    for (const tx of allTx) {
      const d = new Date(tx.time.slice(0, 10) + 'T00:00:00');
      const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay();
      const mon = new Date(d);
      mon.setDate(d.getDate() - dayOfWeek + 1);
      const mm = String(mon.getMonth() + 1).padStart(2, '0');
      const dd = String(mon.getDate()).padStart(2, '0');
      const wk = `${mm}/${dd}`;
      if (!weekBuckets.has(wk)) weekBuckets.set(wk, { income: 0, expense: 0 });
      const b = weekBuckets.get(wk)!;
      if (tx.direction === 'in') b.income += tx.amount;
      else b.expense += tx.amount;
    }
    const cashflowByWeek: InsightsCashflowBucket[] = Array.from(weekBuckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([key, { income, expense }]) => ({ key, income, expense, net: income - expense }));

    /* ── 摘要 ── */
    const totalIncome = allTx.filter((r) => r.direction === 'in').reduce((s, r) => s + r.amount, 0);
    const totalExpense = allTx.filter((r) => r.direction === 'out').reduce((s, r) => s + r.amount, 0);
    const coverageStart = earliestTxDate?.slice(0, 7) ?? null;
    const coverageEnd = latestTxDate?.slice(0, 7) ?? null;

    /* ── 本月 ── */
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    /* ── 分类分解构建器 ── */
    const buildBreakdown = (direction: 'in' | 'out'): InsightsCategoryBreakdownTabData => {
      const dirTx = allTx.filter((r) => r.direction === direction);

      /* 实际用过的标签集合 */
      const usedTags = new Set<string>();
      for (const tx of dirTx) {
        const cat = tx.user_category || tx.ai_category || '__uncategorized__';
        usedTags.add(cat);
      }

      /* 本月各标签金额 */
      const currentMonthAmounts = new Map<string, number>();
      for (const tx of dirTx) {
        if (!tx.time.startsWith(currentMonthKey)) continue;
        const cat = tx.user_category || tx.ai_category || '__uncategorized__';
        currentMonthAmounts.set(cat, (currentMonthAmounts.get(cat) ?? 0) + tx.amount);
      }
      const monthTotal = Array.from(currentMonthAmounts.values()).reduce((s, v) => s + v, 0);

      const currentMonth: InsightsCategorySlice[] = Array.from(currentMonthAmounts.entries())
        .filter(([, amt]) => amt > 0)
        .map(([tagId, amount]) => {
          const tagName = tagId === '__uncategorized__' ? '未分类' : (categoryMap[tagId] ?? tagId);
          const budget = null; // 分类预算需要接入 BudgetManager，当前先返回 null
          return {
            tagId,
            tagName,
            amount,
            share: monthTotal > 0 ? amount / monthTotal : 0,
            budget,
          };
        });

      /* 各标签全账本月度历史 */
      const byTagHistory: Record<string, Array<{ monthKey: string; amount: number }>> = {};
      for (const tagId of usedTags) {
        const monthMap = new Map<string, number>();
        for (const tx of dirTx) {
          const cat = tx.user_category || tx.ai_category || '__uncategorized__';
          if (cat !== tagId) continue;
          const mk = tx.time.slice(0, 7);
          monthMap.set(mk, (monthMap.get(mk) ?? 0) + tx.amount);
        }
        byTagHistory[tagId] = Array.from(monthMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([monthKey, amount]) => ({ monthKey, amount }));
      }

      return { currentMonth, byTagHistory };
    };

    return {
      ledger: { name: ledgerName, earliestTxDate, latestTxDate },
      summary: { totalIncome, totalExpense, netCashflow: totalIncome - totalExpense, coverageStart, coverageEnd },
      cashflowByMonth,
      cashflowByWeek,
      categoryBreakdown: {
        expense: buildBreakdown('out'),
        income: buildBreakdown('in'),
      },
    };
  }

  // ──────────────────────────────────────────────
  // 请教页接口（§2.3）
  // ──────────────────────────────────────────────

  /**
   * 获取请教页完整视图数据。
   *
   * 实现 §2.3-A 返回结构、§2.3-B 排序规则、§2.3-D filter 联动、§2.3-F 空状态分类。
   * 会话视图快照（§2.3-E）由前端 session state 管理，本方法每次调用均实时重算。
   *
   * @param filter 可操作性阈值，默认 'medium'
   */
  public getInquiryViewData(filter: InquiryFilter = 'medium'): InquiryViewData {
    const records = this.getLedgerState().ledgerMemory?.records ?? {};
    const allRecords = Object.values(records) as FullTransactionRecord[];
    const isAiRunning = this.aiStatus === 'ANALYZING';

    // 无任何记录 → NO_BILLS
    if (allRecords.length === 0) {
      return { filter, days: [], viewStateCode: 'NO_BILLS', isAiRunning };
    }

    // 从未产出 ai_needs_review=true 条目（含"AI 未运行"和"全部 high confidence"两种情况）→ NO_REVIEW_YET
    const hasAnyNeedsReview = allRecords.some((r) => r.ai_needs_review);
    if (!hasAnyNeedsReview) {
      return { filter, days: [], viewStateCode: 'NO_REVIEW_YET', isAiRunning };
    }

    // 计算原始天组（不带 filter）
    const rawDays = buildInquiryRawDays(allRecords);

    // 用 all filter 判断是否已全部审核（ALL_REVIEWED vs FILTER_EMPTY）
    const daysWithAllFilter = filterInquiryDays(rawDays, 'all');
    if (daysWithAllFilter.length === 0) {
      // 放宽到 all 仍为空 → 全部已审核
      return { filter, days: [], viewStateCode: 'ALL_REVIEWED', isAiRunning };
    }

    // 应用当前 filter
    const visibleDays = filter === 'all' ? daysWithAllFilter : filterInquiryDays(rawDays, filter);
    if (visibleDays.length === 0) {
      // 当前 filter 为空，但放宽后非空
      return { filter, days: [], viewStateCode: 'FILTER_EMPTY', isAiRunning };
    }

    // 正常有内容，AI 正在运行时附加状态码供表现层展示"新条目会追加"提示
    const viewStateCode: InquiryViewStateCode | null = isAiRunning ? 'RUNNING_NON_EMPTY' : null;
    return { filter, days: visibleDays, viewStateCode, isAiRunning };
  }

  /**
   * 左滑确认单条请教项（§2.3-C 出列机制）。
   * 等同于"用户在审计中再次选择同一分类"：仅设置 is_verified=true，不修改 user_category / user_note。
   */
  public confirmInquiryItem(id: string): void {
    const memory = this.getLedgerState().ledgerMemory;
    if (!memory) return;
    const record = memory.records[id];
    if (!record || record.is_verified) return;
    this.ledgerService.setVerification(id, true);
    this.notify();
  }

  /**
   * 批量确认多条请教项（§2.3-C 批量确认）。
   * 对每条传入 id 执行与 confirmInquiryItem 相同的单条逻辑，只发出一次 notify。
   */
  public batchConfirmInquiryItems(ids: string[]): void {
    const memory = this.getLedgerState().ledgerMemory;
    if (!memory) return;
    let changed = false;
    for (const id of ids) {
      const record = memory.records[id];
      if (!record || record.is_verified) continue;
      this.ledgerService.setVerification(id, true);
      changed = true;
    }
    if (changed) this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
