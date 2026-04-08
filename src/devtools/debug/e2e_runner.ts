import { appFacade } from '@bootstrap/appFacade';
import { classifyQueue } from '@logic/application/ai/ClassifyQueue';
import { BudgetManager } from '@logic/application/services/BudgetManager';
import { ExampleStore } from '@logic/application/services/ExampleStore';
import { LedgerManager } from '@logic/application/services/LedgerManager';
import { LedgerService } from '@logic/application/services/LedgerService';
import {
  type ManualEntryInput,
  ManualEntryManager,
} from '@logic/application/services/ManualEntryManager';
import type {
  BudgetConfig,
  CategoryBudgetEntry,
  MonthlyBudget,
} from '@shared/types/budget';
import type { MoniHomeReadModel } from '@shared/types';

/**
 * 调试步骤执行结果。
 * 每一步都返回结构化结果，便于 Playwright / MCP 直接读取并做自动断言，
 * 而不是只能依赖 console 文本做人工判断。
 */
interface DebugStepResult {
  name: string;
  ok: boolean;
  detail?: string;
  actual?: unknown;
}

/**
 * 调试测试报告。
 * ok 为总结果，steps 为逐步断言，context 用于补充关键环境信息。
 */
interface DebugTestReport {
  ok: boolean;
  test: string;
  steps: DebugStepResult[];
  context?: Record<string, unknown>;
}

/**
 * 浏览器调试入口。
 * 这一层负责“精确操控系统”，包括：
 * - 账本 CRUD
 * - 随手记增删改查
 * - 预算配置读写与统计读取
 * - 首页聚合读模型快照
 * - 分类队列状态读取
 */
interface MoniDebugApi {
  env: {
    ping: () => Promise<{ ok: true; now: string; activeLedger: string | null }>;
    getRuntimeInfo: () => Promise<Record<string, unknown>>;
  };
  ledger: {
    list: () => Promise<Array<{ name: string; fileName: string }>>;
    getActive: () => Promise<string | null>;
    switch: (ledgerId: string) => Promise<boolean>;
    create: (ledgerId: string) => Promise<boolean>;
    rename: (oldName: string, newName: string) => Promise<boolean>;
    delete: (ledgerId: string) => Promise<boolean>;
    snapshot: () => Promise<Record<string, unknown>>;
  };
  manualEntry: {
    add: (input: ManualEntryInput) => Promise<string>;
    delete: (id: string) => Promise<void>;
    listRecent: (limit?: number) => Promise<Array<Record<string, unknown>>>;
  };
  budget: {
    getConfig: (ledgerId?: string) => Promise<BudgetConfig | null>;
    setMonthly: (budget: MonthlyBudget, ledgerId?: string) => Promise<BudgetConfig | null>;
    clearMonthly: (ledgerId?: string) => Promise<BudgetConfig | null>;
    setCategoryBudgets: (
      budgets: Record<string, CategoryBudgetEntry>,
      options?: { ledgerId?: string; schemaVersion?: number }
    ) => Promise<BudgetConfig | null>;
    clearCategoryBudgets: (ledgerId?: string) => Promise<BudgetConfig | null>;
    getSummary: (ledgerId?: string) => Promise<Record<string, unknown>>;
  };
  classify: {
    getQueue: (ledgerId?: string) => Promise<Array<Record<string, unknown>>>;
    enqueueDate: (date: string, ledgerId?: string) => Promise<boolean>;
    peek: (ledgerId?: string) => Promise<Record<string, unknown> | null>;
  };
  home: {
    getReadModel: (input?: {
      trendWindowOffset?: number;
      range?: 'all' | { start: string | null; end: string | null };
    }) => Promise<MoniHomeReadModel>;
  };
}

/**
 * 浏览器测试编排入口。
 * 这一层不直接暴露所有底层能力，而是提供“标准测试场景”，
 * 让 Playwright / MCP 可以一键跑通核心业务链路。
 */
interface MoniE2EApi {
  tests: {
    runLedgerCrudTest: () => Promise<DebugTestReport>;
    runManualEntryFlowTest: () => Promise<DebugTestReport>;
    runBudgetFlowTest: () => Promise<DebugTestReport>;
    runHomeReadModelSmokeTest: () => Promise<DebugTestReport>;
  };
}

function formatNowForRecord(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function buildTempLedgerName(prefix: string): string {
  const timestamp = Date.now().toString(36);
  /**
   * LedgerManager 当前只允许中文、字母、数字、下划线。
   * 因此调试账本名统一使用下划线，避免测试脚本自己触发名称校验失败。
   */
  return `${prefix}_${timestamp}`;
}

function createReport(test: string): DebugTestReport {
  return {
    ok: true,
    test,
    steps: [],
  };
}

function pushStep(report: DebugTestReport, step: DebugStepResult): void {
  report.steps.push(step);
  if (!step.ok) {
    report.ok = false;
  }
}

function assertStep(
  report: DebugTestReport,
  name: string,
  condition: boolean,
  actual?: unknown,
  detail?: string
): void {
  pushStep(report, {
    name,
    ok: condition,
    actual,
    detail,
  });
}

/**
 * 确保调试入口在调用前已经完成主应用初始化。
 * 所有调试动作都走真实运行时单例，不走 mock service。
 */
async function ensureAppReady(): Promise<void> {
  await appFacade.init();
}

function getActiveLedgerName(): string | null {
  return LedgerService.getInstance().getCurrentLedgerName() ?? LedgerManager.getInstance().getActiveLedgerName();
}

function getCurrentLedgerMemory() {
  return LedgerService.getInstance().getState().ledgerMemory ?? null;
}

function toAllRangeInput(): { start: Date | null; end: Date | null } {
  return {
    start: null,
    end: null,
  };
}

/**
 * 读取当前账本的轻量快照。
 * 这个方法专门给调试入口使用，避免每次都去读完整状态树。
 */
function buildLedgerSnapshot(): Record<string, unknown> {
  const ledgerState = LedgerService.getInstance().getState();
  const memory = ledgerState.ledgerMemory;
  const records = Object.values(memory?.records ?? {});
  return {
    activeLedger: getActiveLedgerName(),
    isLoading: ledgerState.isLoading,
    transactionCount: records.length,
    manualEntryCount: records.filter((record) => record.sourceType === 'manual').length,
    categoryCount: Object.keys(memory?.defined_categories ?? {}).length,
    dateRange: {
      start: ledgerState.dateRange.start ? ledgerState.dateRange.start.toISOString() : null,
      end: ledgerState.dateRange.end ? ledgerState.dateRange.end.toISOString() : null,
    },
  };
}

async function getHomeReadModel(input?: {
  trendWindowOffset?: number;
  range?: 'all' | { start: string | null; end: string | null };
}): Promise<MoniHomeReadModel> {
  await ensureAppReady();
  const range = input?.range === 'all'
    ? toAllRangeInput()
    : input?.range
      ? {
          start: input.range.start ? new Date(`${input.range.start}T00:00:00`) : null,
          end: input.range.end ? new Date(`${input.range.end}T00:00:00`) : null,
        }
      : undefined;

  return await appFacade.getMoniHomeReadModel({
    trendWindowOffset: input?.trendWindowOffset ?? 0,
    homeDateRange: range,
  });
}

async function cleanupTempLedger(originalLedger: string | null, tempLedger: string | null): Promise<void> {
  const ledgerManager = LedgerManager.getInstance();
  if (originalLedger) {
    await ledgerManager.switchLedger(originalLedger);
  }
  if (tempLedger) {
    /**
     * 某些测试步骤自身已经完成删除。
     * 清理阶段先探测账本是否仍存在，避免重复删除把正常测试污染成 error 日志。
     */
    const ledgers = await ledgerManager.listLedgers({ syncWithFiles: false });
    if (ledgers.some((ledger) => ledger.name === tempLedger)) {
      await ledgerManager.deleteLedger(tempLedger);
    }
  }
}

async function runLedgerCrudTest(): Promise<DebugTestReport> {
  await ensureAppReady();

  const report = createReport('runLedgerCrudTest');
  const ledgerManager = LedgerManager.getInstance();
  const originalLedger = getActiveLedgerName();
  const createdLedger = buildTempLedgerName('调试账本');
  const renamedLedger = `${createdLedger}_已改名`;

  try {
    const created = await ledgerManager.createLedger(createdLedger);
    assertStep(report, 'createLedger', created, { createdLedger }, '应能创建临时账本并自动切换过去');

    const afterCreateList = await ledgerManager.listLedgers({ syncWithFiles: false });
    assertStep(
      report,
      'listAfterCreate',
      afterCreateList.some((ledger) => ledger.name === createdLedger),
      afterCreateList.map((ledger) => ledger.name),
      '账本列表中应出现新创建账本'
    );

    assertStep(
      report,
      'activeAfterCreate',
      getActiveLedgerName() === createdLedger,
      { activeLedger: getActiveLedgerName() },
      '创建后当前激活账本应切换为新账本'
    );

    const renamed = await ledgerManager.renameLedger(createdLedger, renamedLedger);
    assertStep(report, 'renameLedger', renamed, { createdLedger, renamedLedger }, '应能完成账本重命名');

    const afterRenameList = await ledgerManager.listLedgers({ syncWithFiles: false });
    assertStep(
      report,
      'listAfterRename',
      afterRenameList.some((ledger) => ledger.name === renamedLedger) &&
        !afterRenameList.some((ledger) => ledger.name === createdLedger),
      afterRenameList.map((ledger) => ledger.name),
      '重命名后列表中应只有新名称'
    );

    assertStep(
      report,
      'activeAfterRename',
      getActiveLedgerName() === renamedLedger,
      { activeLedger: getActiveLedgerName() },
      '重命名后当前激活账本也应更新'
    );

    if (originalLedger) {
      const switchedBack = await ledgerManager.switchLedger(originalLedger);
      assertStep(
        report,
        'switchBackOriginal',
        switchedBack && getActiveLedgerName() === originalLedger,
        { activeLedger: getActiveLedgerName(), originalLedger },
        '删除临时账本前应能切回原账本'
      );
    }

    const deleted = await ledgerManager.deleteLedger(renamedLedger);
    assertStep(report, 'deleteLedger', deleted, { renamedLedger }, '应能删除临时账本');

    const afterDeleteList = await ledgerManager.listLedgers({ syncWithFiles: false });
    assertStep(
      report,
      'listAfterDelete',
      !afterDeleteList.some((ledger) => ledger.name === renamedLedger),
      afterDeleteList.map((ledger) => ledger.name),
      '删除后账本列表中不应再出现临时账本'
    );
  } catch (error) {
    pushStep(report, {
      name: 'unexpectedError',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await cleanupTempLedger(originalLedger, renamedLedger);
  }

  report.context = {
    originalLedger,
    finalActiveLedger: getActiveLedgerName(),
  };
  return report;
}

async function runManualEntryFlowTest(): Promise<DebugTestReport> {
  await ensureAppReady();

  const report = createReport('runManualEntryFlowTest');
  const ledgerManager = LedgerManager.getInstance();
  const manualEntryManager = ManualEntryManager.getInstance();
  const originalLedger = getActiveLedgerName();
  const tempLedger = buildTempLedgerName('手记测试账本');
  let manualEntryId: string | null = null;

  try {
    const created = await ledgerManager.createLedger(tempLedger);
    assertStep(report, 'createTempLedger', created, { tempLedger }, '随手记测试先创建独立临时账本');

    const input: ManualEntryInput = {
      amount: 88.8,
      direction: 'out',
      category: '正餐',
      subject: '调试手记午餐',
      description: '用于验证浏览器调试入口的随手记链路',
      date: formatNowForRecord(),
    };

    manualEntryId = await manualEntryManager.addEntry(tempLedger, input);
    assertStep(report, 'addManualEntry', Boolean(manualEntryId), { manualEntryId, input }, '应返回新的随手记记录 ID');

    const stateAfterAdd = LedgerService.getInstance().getState();
    const addedRecord = manualEntryId ? stateAfterAdd.ledgerMemory?.records[manualEntryId] : null;
    assertStep(
      report,
      'manualEntryPersistedInMemory',
      Boolean(
        addedRecord &&
          addedRecord.sourceType === 'manual' &&
          addedRecord.user_category === input.category &&
          addedRecord.user_note === input.description
      ),
      addedRecord,
      '内存态记录应保留 manual/source/category/note 等关键字段'
    );

    const exampleStatsAfterAdd = await ExampleStore.getStats(tempLedger);
    assertStep(
      report,
      'manualEntrySyncedToExampleStore',
      exampleStatsAfterAdd.count >= 1,
      exampleStatsAfterAdd,
      '随手记有商品名时应写入 ExampleStore'
    );

    const homeReadModel = await getHomeReadModel({ range: 'all' });
    const manualHomeItem = homeReadModel.dailyTransactionGroups
      .flatMap((group) => group.items)
      .find((item) => item.id === manualEntryId);
    assertStep(
      report,
      'manualEntryVisibleInHomeReadModel',
      Boolean(
        manualHomeItem &&
          manualHomeItem.sourceType === 'manual' &&
          manualHomeItem.sourceLabel === '随手记' &&
          manualHomeItem.userNote === input.description
      ),
      manualHomeItem,
      '首页读模型应能把手记记录映射成随手记展示字段'
    );

    if (manualEntryId) {
      await manualEntryManager.deleteEntry(tempLedger, manualEntryId);
    }
    const stateAfterDelete = LedgerService.getInstance().getState();
    assertStep(
      report,
      'manualEntryDeletedFromMemory',
      !manualEntryId || !stateAfterDelete.ledgerMemory?.records[manualEntryId],
      { manualEntryId },
      '删除后内存态不应再保留该随手记记录'
    );

    const exampleStatsAfterDelete = await ExampleStore.getStats(tempLedger);
    assertStep(
      report,
      'manualEntryDeletedFromExampleStore',
      exampleStatsAfterDelete.count === 0,
      exampleStatsAfterDelete,
      '删除后 ExampleStore 应同步清空该记录'
    );
  } catch (error) {
    pushStep(report, {
      name: 'unexpectedError',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await cleanupTempLedger(originalLedger, tempLedger);
  }

  report.context = {
    originalLedger,
    manualEntryId,
    finalActiveLedger: getActiveLedgerName(),
  };
  return report;
}

async function runBudgetFlowTest(): Promise<DebugTestReport> {
  await ensureAppReady();

  const report = createReport('runBudgetFlowTest');
  const ledgerManager = LedgerManager.getInstance();
  const manualEntryManager = ManualEntryManager.getInstance();
  const budgetManager = BudgetManager.getInstance();
  const originalLedger = getActiveLedgerName();
  const tempLedger = buildTempLedgerName('预算测试账本');

  try {
    const created = await ledgerManager.createLedger(tempLedger);
    assertStep(report, 'createTempLedger', created, { tempLedger }, '预算测试先创建独立临时账本');

    const currentTime = formatNowForRecord();
    await manualEntryManager.addEntry(tempLedger, {
      amount: 100,
      direction: 'out',
      category: '正餐',
      subject: '预算测试午餐',
      description: '预算月度汇总测试样本',
      date: currentTime,
    });
    await manualEntryManager.addEntry(tempLedger, {
      amount: 80,
      direction: 'out',
      category: '交通',
      subject: '预算测试打车',
      description: '预算分类汇总测试样本',
      date: currentTime,
    });

    await budgetManager.saveMonthlyBudget(tempLedger, {
      amount: 300,
      currency: 'CNY',
    });
    const configAfterMonthly = await budgetManager.loadBudgetConfig(tempLedger);
    assertStep(
      report,
      'saveMonthlyBudget',
      configAfterMonthly?.monthly?.amount === 300,
      configAfterMonthly,
      '月预算应正确写入预算配置文件'
    );

    await budgetManager.saveCategoryBudgets(
      tempLedger,
      {
        正餐: { amount: 200 },
        交通: { amount: 50 },
      },
      1
    );
    const configAfterCategory = await budgetManager.loadBudgetConfig(tempLedger);
    assertStep(
      report,
      'saveCategoryBudgets',
      configAfterCategory?.categoryBudgets?.正餐?.amount === 200 &&
        configAfterCategory?.categoryBudgets?.交通?.amount === 50,
      configAfterCategory,
      '分类预算应正确写入预算配置文件'
    );

    const ledgerMemory = getCurrentLedgerMemory();
    const monthlySummary = await budgetManager.computeMonthlyBudgetSummary(tempLedger, ledgerMemory, new Date());
    assertStep(
      report,
      'computeMonthlyBudgetSummary',
      monthlySummary.enabled && monthlySummary.spent === 180 && monthlySummary.remaining === 120,
      monthlySummary,
      '月预算统计应基于真实流水算出 spent=180 / remaining=120'
    );

    const categorySummary = await budgetManager.computeCategoryBudgetSummary(tempLedger, ledgerMemory, new Date());
    const trafficBudgetItem = categorySummary.enabled
      ? categorySummary.items.find((item) => item.categoryKey === '交通')
      : null;
    assertStep(
      report,
      'computeCategoryBudgetSummary',
      Boolean(categorySummary.enabled && trafficBudgetItem?.spent === 80 && trafficBudgetItem.status === 'exceeded'),
      categorySummary,
      '分类预算统计应体现交通预算超支'
    );

    const homeReadModel = await getHomeReadModel({ range: 'all' });
    assertStep(
      report,
      'budgetVisibleInHomeReadModel',
      homeReadModel.budget.enabled && Boolean(homeReadModel.budget.card),
      homeReadModel.budget,
      '首页 facade 读模型应暴露预算卡数据'
    );

    await budgetManager.saveMonthlyBudget(tempLedger, null);
    await budgetManager.saveCategoryBudgets(tempLedger, null, 2);
    const configAfterClear = await budgetManager.loadBudgetConfig(tempLedger);
    assertStep(
      report,
      'clearBudgetConfig',
      configAfterClear?.monthly === null && configAfterClear?.categoryBudgets === null,
      configAfterClear,
      '预算清空后配置文件应回到空预算态'
    );
  } catch (error) {
    pushStep(report, {
      name: 'unexpectedError',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await cleanupTempLedger(originalLedger, tempLedger);
  }

  report.context = {
    originalLedger,
    finalActiveLedger: getActiveLedgerName(),
  };
  return report;
}

async function runHomeReadModelSmokeTest(): Promise<DebugTestReport> {
  await ensureAppReady();

  const report = createReport('runHomeReadModelSmokeTest');
  try {
    const readModel = await getHomeReadModel({ range: 'all' });
    assertStep(
      report,
      'homeReadModelBasicShape',
      Boolean(readModel.currentLedger.id && Array.isArray(readModel.dailyTransactionGroups)),
      {
        currentLedger: readModel.currentLedger,
        dayGroupCount: readModel.dailyTransactionGroups.length,
        trendWindow: readModel.trendCard,
      },
      '首页读模型至少应返回当前账本、按天流水与趋势窗口'
    );
  } catch (error) {
    pushStep(report, {
      name: 'unexpectedError',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
  return report;
}

function createDebugApi(): MoniDebugApi {
  return {
    env: {
      ping: async () => {
        await ensureAppReady();
        return {
          ok: true,
          now: new Date().toISOString(),
          activeLedger: getActiveLedgerName(),
        };
      },
      getRuntimeInfo: async () => {
        await ensureAppReady();
        return {
          activeLedger: getActiveLedgerName(),
          ledgerSnapshot: buildLedgerSnapshot(),
          queueSize: (await classifyQueue.getPending(getActiveLedgerName() ?? undefined)).length,
          hasHomeReadModel: true,
        };
      },
    },
    ledger: {
      list: async () => {
        await ensureAppReady();
        const ledgers = await LedgerManager.getInstance().listLedgers({ syncWithFiles: false });
        return ledgers.map((ledger) => ({
          name: ledger.name,
          fileName: ledger.fileName,
        }));
      },
      getActive: async () => {
        await ensureAppReady();
        return getActiveLedgerName();
      },
      switch: async (ledgerId: string) => {
        await ensureAppReady();
        return await LedgerManager.getInstance().switchLedger(ledgerId);
      },
      create: async (ledgerId: string) => {
        await ensureAppReady();
        return await LedgerManager.getInstance().createLedger(ledgerId);
      },
      rename: async (oldName: string, newName: string) => {
        await ensureAppReady();
        return await LedgerManager.getInstance().renameLedger(oldName, newName);
      },
      delete: async (ledgerId: string) => {
        await ensureAppReady();
        return await LedgerManager.getInstance().deleteLedger(ledgerId);
      },
      snapshot: async () => {
        await ensureAppReady();
        return buildLedgerSnapshot();
      },
    },
    manualEntry: {
      add: async (input: ManualEntryInput) => {
        await ensureAppReady();
        const activeLedger = getActiveLedgerName();
        if (!activeLedger) {
          throw new Error('No active ledger loaded');
        }
        return await ManualEntryManager.getInstance().addEntry(activeLedger, input);
      },
      delete: async (id: string) => {
        await ensureAppReady();
        const activeLedger = getActiveLedgerName();
        if (!activeLedger) {
          throw new Error('No active ledger loaded');
        }
        await ManualEntryManager.getInstance().deleteEntry(activeLedger, id);
      },
      listRecent: async (limit: number = 10) => {
        await ensureAppReady();
        const records = Object.values(LedgerService.getInstance().getState().ledgerMemory?.records ?? {})
          .filter((record) => record.sourceType === 'manual')
          .sort((left, right) => right.time.localeCompare(left.time))
          .slice(0, limit)
          .map((record) => ({
            id: record.id,
            time: record.time,
            product: record.product,
            amount: record.amount,
            category: record.user_category || record.category,
            note: record.user_note,
          }));
        return records;
      },
    },
    budget: {
      getConfig: async (ledgerId?: string) => {
        await ensureAppReady();
        const targetLedger = ledgerId ?? getActiveLedgerName();
        if (!targetLedger) {
          throw new Error('No active ledger loaded');
        }
        return await BudgetManager.getInstance().loadBudgetConfig(targetLedger);
      },
      setMonthly: async (budget: MonthlyBudget, ledgerId?: string) => {
        await ensureAppReady();
        const targetLedger = ledgerId ?? getActiveLedgerName();
        if (!targetLedger) {
          throw new Error('No active ledger loaded');
        }
        await BudgetManager.getInstance().saveMonthlyBudget(targetLedger, budget);
        return await BudgetManager.getInstance().loadBudgetConfig(targetLedger);
      },
      clearMonthly: async (ledgerId?: string) => {
        await ensureAppReady();
        const targetLedger = ledgerId ?? getActiveLedgerName();
        if (!targetLedger) {
          throw new Error('No active ledger loaded');
        }
        await BudgetManager.getInstance().saveMonthlyBudget(targetLedger, null);
        return await BudgetManager.getInstance().loadBudgetConfig(targetLedger);
      },
      setCategoryBudgets: async (
        budgets: Record<string, CategoryBudgetEntry>,
        options?: { ledgerId?: string; schemaVersion?: number }
      ) => {
        await ensureAppReady();
        const targetLedger = options?.ledgerId ?? getActiveLedgerName();
        if (!targetLedger) {
          throw new Error('No active ledger loaded');
        }
        await BudgetManager.getInstance().saveCategoryBudgets(
          targetLedger,
          budgets,
          options?.schemaVersion ?? 1
        );
        return await BudgetManager.getInstance().loadBudgetConfig(targetLedger);
      },
      clearCategoryBudgets: async (ledgerId?: string) => {
        await ensureAppReady();
        const targetLedger = ledgerId ?? getActiveLedgerName();
        if (!targetLedger) {
          throw new Error('No active ledger loaded');
        }
        const currentConfig = await BudgetManager.getInstance().loadBudgetConfig(targetLedger);
        await BudgetManager.getInstance().saveCategoryBudgets(
          targetLedger,
          null,
          (currentConfig?.categoryBudgetSchemaVersion ?? 0) + 1
        );
        return await BudgetManager.getInstance().loadBudgetConfig(targetLedger);
      },
      getSummary: async (ledgerId?: string) => {
        await ensureAppReady();
        const targetLedger = ledgerId ?? getActiveLedgerName();
        if (!targetLedger) {
          throw new Error('No active ledger loaded');
        }
        const ledgerMemory = getCurrentLedgerMemory();
        const budgetManager = BudgetManager.getInstance();
        const [config, monthlySummary, categorySummary, homeBudget] = await Promise.all([
          budgetManager.loadBudgetConfig(targetLedger),
          budgetManager.computeMonthlyBudgetSummary(targetLedger, ledgerMemory, new Date()),
          budgetManager.computeCategoryBudgetSummary(targetLedger, ledgerMemory, new Date()),
          budgetManager.getHomeBudgetReadModel(targetLedger, ledgerMemory, { now: new Date() }),
        ]);
        return {
          config,
          monthlySummary,
          categorySummary,
          homeBudget,
        };
      },
    },
    classify: {
      getQueue: async (ledgerId?: string) => {
        await ensureAppReady();
        const targetLedger = ledgerId ?? getActiveLedgerName() ?? undefined;
        const tasks = await classifyQueue.getPending(targetLedger);
        return tasks.map((task) => ({
          ledger: task.ledger,
          date: task.date,
          enqueuedAt: task.enqueuedAt,
        }));
      },
      enqueueDate: async (date: string, ledgerId?: string) => {
        await ensureAppReady();
        const targetLedger = ledgerId ?? getActiveLedgerName();
        if (!targetLedger) {
          throw new Error('No active ledger loaded');
        }
        return await classifyQueue.enqueue({
          ledger: targetLedger,
          date,
        });
      },
      peek: async (ledgerId?: string) => {
        await ensureAppReady();
        const targetLedger = ledgerId ?? getActiveLedgerName();
        if (!targetLedger) {
          throw new Error('No active ledger loaded');
        }
        const task = await classifyQueue.peek(targetLedger);
        if (!task) {
          return null;
        }
        return {
          ledger: task.ledger,
          date: task.date,
          enqueuedAt: task.enqueuedAt,
        };
      },
    },
    home: {
      getReadModel: getHomeReadModel,
    },
  };
}

function createE2EApi(): MoniE2EApi {
  return {
    tests: {
      runLedgerCrudTest,
      runManualEntryFlowTest,
      runBudgetFlowTest,
      runHomeReadModelSmokeTest,
    },
  };
}

/**
 * 将调试入口挂到浏览器全局对象。
 * 仅在开发态调用，正式构建不应暴露这些能力。
 */
export function installMoniDebugTools(): void {
  const globalWindow = window as Window & {
    __MONI_DEBUG__?: MoniDebugApi;
    __MONI_E2E__?: MoniE2EApi;
  };

  if (globalWindow.__MONI_DEBUG__ && globalWindow.__MONI_E2E__) {
    return;
  }

  globalWindow.__MONI_DEBUG__ = createDebugApi();
  globalWindow.__MONI_E2E__ = createE2EApi();

  console.info('[MoniDebug] 已挂载 window.__MONI_DEBUG__ 与 window.__MONI_E2E__');
}

/**
 * 兼容旧的手动调用方式。
 * 现阶段默认把它映射到首页读模型 smoke test，避免旧文档中的入口完全失效。
 */
export async function runE2ETest(): Promise<DebugTestReport> {
  return await runHomeReadModelSmokeTest();
}
