import { appFacade } from '@bootstrap/appFacade';
import { classifyQueue } from '@logic/application/ai/ClassifyQueue';
import { CompressionSession } from '@logic/application/ai/CompressionSession';
import type { CompressionContext, CompressionResult } from '@logic/application/ai/CompressionSession';
import { LearningAutomationService, type AutoLearningStatus } from '@logic/application/ai/LearningAutomationService';
import { LearningSession, type LearningDeltaPayload } from '@logic/application/ai/LearningSession';
import { BudgetManager } from '@logic/application/services/BudgetManager';
import { ExampleStore } from '@logic/application/services/ExampleStore';
import { LedgerManager } from '@logic/application/services/LedgerManager';
import { LedgerPreferencesManager } from '@logic/application/services/LedgerPreferencesManager';
import { LedgerService } from '@logic/application/services/LedgerService';
import {
  type ManualEntryInput,
  ManualEntryManager,
} from '@logic/application/services/ManualEntryManager';
import { MemoryManager } from '@logic/application/services/MemoryManager';
import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterDirectory } from '@system/adapters/IFilesystemAdapter';
import {
  getLedgerAiPrefsPath,
  getLedgerExampleChangesPath,
  getLedgerExamplesPath,
  getLedgerMemoryDirectoryPath,
} from '@system/filesystem/persistence-paths';
import type {
  BillImportExecutionResult,
  BillImportOptions,
  BillImportProbeResult,
  BillImportSource,
} from '@shared/types';
import type {
  BudgetConfig,
  CategoryBudgetEntry,
  MonthlyBudget,
} from '@shared/types/budget';
import type { LedgerPreferences } from '@shared/types/ledger-preferences';
import { TransactionStatus, type FullTransactionRecord } from '@shared/types/metadata';
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
  prefs: {
    get: (ledgerId?: string) => Promise<LedgerPreferences>;
    update: (patch: Record<string, unknown>, ledgerId?: string) => Promise<LedgerPreferences>;
  };
  learning: {
    getDeltaPayload: (ledgerId?: string, baselineRevision?: number) => Promise<LearningDeltaPayload>;
    getAutoTriggerState: (ledgerId?: string) => Promise<AutoLearningStatus>;
  };
  compression: {
    getContext: (ledgerId?: string, force?: boolean) => Promise<CompressionContext>;
    parseOutput: (raw: string, targetCount: number) => Promise<string[]>;
    run: (ledgerId?: string, force?: boolean) => Promise<CompressionResult>;
  };
  home: {
    getReadModel: (input?: {
      trendWindowOffset?: number;
      range?: 'all' | { start: string | null; end: string | null };
    }) => Promise<MoniHomeReadModel>;
  };
  billImport: {
    probe: (files: File[], options?: BillImportOptions) => Promise<BillImportProbeResult>;
    import: (files: File[], options?: BillImportOptions) => Promise<BillImportExecutionResult>;
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
    runExampleStoreSpecTest: () => Promise<DebugTestReport>;
    runLearningPayloadSpecTest: () => Promise<DebugTestReport>;
    runLearningAutomationSpecTest: () => Promise<DebugTestReport>;
    runCompressionSpecTest: () => Promise<DebugTestReport>;
    runHomeReadModelSmokeTest: () => Promise<DebugTestReport>;
    runBillImportBackendTest: () => Promise<DebugTestReport>;
  };
}

const BILL_IMPORT_FIXTURE_PATHS = {
  passwordFile: '/virtual_android_filesys/Downloads_path/extract_passwords.txt',
  wechatZip: '/virtual_android_filesys/Downloads_path/微信支付账单流水文件(20260312-20260412)——【解压密码可在微信支付公众号查看】.zip',
  alipayZip: '/virtual_android_filesys/Downloads_path/支付宝交易明细(20260413-20260424).zip',
} as const;

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

/**
 * 探测开发态文件系统中的路径是否存在。
 * 这里统一走真实适配器的 stat，避免测试为了判断文件是否存在再读文件内容，
 * 从而把“文件不存在”的正常分支污染成额外的 404 / error 噪音。
 */
async function pathExists(path: string, directory: AdapterDirectory): Promise<boolean> {
  try {
    await FilesystemService.getInstance().stat({
      path,
      directory,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 从仓库现有样本目录读取导入测试文件。
 * 这里统一使用 encodeURI，避免中文路径在浏览器 fetch 时被错误处理。
 */
async function loadFixtureFile(path: string): Promise<File> {
  const response = await fetch(encodeURI(path));
  if (!response.ok) {
    throw new Error(`加载测试样本失败：${path}`);
  }

  const blob = await response.blob();
  const fileName = decodeURIComponent(path.split('/').pop() ?? 'fixture.bin');
  return new File([blob], fileName, {
    type: blob.type || 'application/octet-stream',
    lastModified: Date.now(),
  });
}

/**
 * 读取用户已经放入样本目录的压缩包密码。
 * 这样测试脚本始终和当前仓库里的真实样本保持一致，不再额外复制一份口令。
 */
async function loadImportFixturePasswords(): Promise<Record<BillImportSource, string>> {
  const response = await fetch(encodeURI(BILL_IMPORT_FIXTURE_PATHS.passwordFile));
  if (!response.ok) {
    throw new Error('加载账单样本密码失败');
  }

  const text = await response.text();
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const passwords: Partial<Record<BillImportSource, string>> = {};

  for (const line of lines) {
    if (line.startsWith('微信：')) {
      passwords.wechat = line.replace('微信：', '').trim();
    } else if (line.startsWith('支付宝：')) {
      passwords.alipay = line.replace('支付宝：', '').trim();
    }
  }

  if (!passwords.wechat || !passwords.alipay) {
    throw new Error('测试样本密码文件缺少微信或支付宝密码');
  }

  return passwords as Record<BillImportSource, string>;
}

/**
 * 构造一个“不需要密码的直传文件”样本。
 * 后缀故意不用 `.csv`，用于验证后端确实会先尝试直接解析，而不是直接逼 UI 走密码分支。
 */
function buildDirectWechatFixtureFile(): File {
  const content = [
    '微信支付账单明细,,,,,,,,,,',
    '微信昵称：[调试样本],,,,,,,,,,',
    '起始时间：[2026-04-01 00:00:00] 终止时间：[2026-04-01 23:59:59],,,,,,,,,,',
    '导出类型：[全部],,,,,,,,,,',
    '导出时间：[2026-04-24 20:00:00],,,,,,,,,,',
    '交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注',
    '2026-04-01 12:00:00,商户消费,调试商户,测试午餐,支出,12.50,零钱,支付成功,wx_debug_import_plain_001,merchant_debug_001,直传文本账单',
  ].join('\n');

  return new File([content], 'wechat_plain_fixture.txt', {
    type: 'text/plain',
    lastModified: Date.now(),
  });
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

    /**
     * 先写入一条真实随手记，确保该临时账本已经生成：
     * - ledgers/{ledger}/examples.json
     * - ledgers/{ledger}/example_changes.json
     *
     * 否则后面的重命名 / 删除只能测到账本主文件，测不到实例库增量文件生命周期。
     */
    const seededEntryId = created
      ? await ManualEntryManager.getInstance().addEntry(createdLedger, {
          amount: 12.5,
          direction: 'out',
          category: '零食',
          subject: '账本链路测试样本',
          description: '用于验证实例库与变更日志文件迁移',
          date: formatNowForRecord(),
        })
      : null;
    assertStep(
      report,
      'seedExampleStore',
      Boolean(seededEntryId),
      { seededEntryId },
      '账本重命名前应先生成一条样本，确保实例库与变更日志文件真实存在'
    );

    const beforeRenameFiles = {
      snapshotDir: await pathExists(getLedgerMemoryDirectoryPath(createdLedger), AdapterDirectory.Data),
      examples: await pathExists(getLedgerExamplesPath(createdLedger), AdapterDirectory.Data),
      changeLog: await pathExists(getLedgerExampleChangesPath(createdLedger), AdapterDirectory.Data),
    };
    assertStep(
      report,
      'aiFilesCreatedBeforeRename',
      beforeRenameFiles.snapshotDir && beforeRenameFiles.examples && beforeRenameFiles.changeLog,
      beforeRenameFiles,
      '临时账本在写入样本后应生成快照目录、实例库文件与实例库变更日志文件'
    );

    await LedgerPreferencesManager.getInstance().update(createdLedger, {
      compression: {
        threshold: 40,
        ratio: 0.7,
      },
    });
    const prefsBeforeRename = await pathExists(getLedgerAiPrefsPath(createdLedger), AdapterDirectory.Data);
    assertStep(
      report,
      'ledgerPrefsCreatedBeforeRename',
      prefsBeforeRename,
      { createdLedger, prefsBeforeRename },
      '写入账本行为配置后，应生成 ledgers/{ledger}/ai_prefs.json'
    );

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

    const afterRenameFiles = {
      oldSnapshotDir: await pathExists(getLedgerMemoryDirectoryPath(createdLedger), AdapterDirectory.Data),
      newSnapshotDir: await pathExists(getLedgerMemoryDirectoryPath(renamedLedger), AdapterDirectory.Data),
      oldExamples: await pathExists(getLedgerExamplesPath(createdLedger), AdapterDirectory.Data),
      newExamples: await pathExists(getLedgerExamplesPath(renamedLedger), AdapterDirectory.Data),
      oldChangeLog: await pathExists(getLedgerExampleChangesPath(createdLedger), AdapterDirectory.Data),
      newChangeLog: await pathExists(getLedgerExampleChangesPath(renamedLedger), AdapterDirectory.Data),
      oldPrefs: await pathExists(getLedgerAiPrefsPath(createdLedger), AdapterDirectory.Data),
      newPrefs: await pathExists(getLedgerAiPrefsPath(renamedLedger), AdapterDirectory.Data),
    };
    assertStep(
      report,
      'aiFilesMigratedOnRename',
      !afterRenameFiles.oldSnapshotDir &&
        afterRenameFiles.newSnapshotDir &&
        !afterRenameFiles.oldExamples &&
        afterRenameFiles.newExamples &&
        !afterRenameFiles.oldChangeLog &&
        afterRenameFiles.newChangeLog &&
        !afterRenameFiles.oldPrefs &&
        afterRenameFiles.newPrefs,
      afterRenameFiles,
      '账本重命名后，快照目录、实例库主文件、实例库变更日志、账本行为配置都应一起迁移到新账本名'
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

    const afterDeleteFiles = {
      snapshotDir: await pathExists(getLedgerMemoryDirectoryPath(renamedLedger), AdapterDirectory.Data),
      examples: await pathExists(getLedgerExamplesPath(renamedLedger), AdapterDirectory.Data),
      changeLog: await pathExists(getLedgerExampleChangesPath(renamedLedger), AdapterDirectory.Data),
      prefs: await pathExists(getLedgerAiPrefsPath(renamedLedger), AdapterDirectory.Data),
    };
    assertStep(
      report,
      'aiFilesDeletedOnLedgerDelete',
      !afterDeleteFiles.snapshotDir &&
        !afterDeleteFiles.examples &&
        !afterDeleteFiles.changeLog &&
        !afterDeleteFiles.prefs,
      afterDeleteFiles,
      '账本删除后，不应遗留快照目录、实例库主文件、实例库变更日志或账本行为配置文件'
    );

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

    const manualExampleEntry = (await ExampleStore.load(tempLedger)).find((entry) => entry.id === manualEntryId);
    assertStep(
      report,
      'manualEntryExampleStoreMapping',
      Boolean(
        manualExampleEntry &&
          manualExampleEntry.sourceType === 'manual' &&
          manualExampleEntry.rawClass === '' &&
          manualExampleEntry.counterparty === '' &&
          manualExampleEntry.product === input.subject &&
          manualExampleEntry.paymentMethod === '' &&
          manualExampleEntry.transactionStatus === TransactionStatus.SUCCESS &&
          manualExampleEntry.remark === '' &&
          manualExampleEntry.category === input.category &&
          manualExampleEntry.ai_category === '' &&
          manualExampleEntry.ai_reasoning === '' &&
          manualExampleEntry.user_note === input.description &&
          manualExampleEntry.is_verified === true
      ),
      manualExampleEntry,
      'D 类手记写入实例库时，应严格按手记规格映射字段'
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

async function runExampleStoreSpecTest(): Promise<DebugTestReport> {
  await ensureAppReady();

  const report = createReport('runExampleStoreSpecTest');
  const ledgerManager = LedgerManager.getInstance();
  const originalLedger = getActiveLedgerName();
  const tempLedger = buildTempLedgerName('实例库测试账本');

  try {
    const created = await ledgerManager.createLedger(tempLedger);
    assertStep(report, 'createTempLedger', created, { tempLedger }, '实例库规格测试先创建独立临时账本');

    /**
     * 先种入一条 D 类手记样本，验证手记到实例库的字段映射。
     */
    const manualId = await ManualEntryManager.getInstance().addEntry(tempLedger, {
      amount: 23.6,
      direction: 'out',
      category: '零食',
      subject: '实例库测试面包',
      description: '手记写入实例库字段映射验证',
      date: formatNowForRecord(),
    });

    const manualEntry = (await ExampleStore.load(tempLedger)).find((entry) => entry.id === manualId);
    assertStep(
      report,
      'manualExampleEntryMatchesSpec',
      Boolean(
        manualEntry &&
          manualEntry.sourceType === 'manual' &&
          manualEntry.rawClass === '' &&
          manualEntry.counterparty === '' &&
          manualEntry.product === '实例库测试面包' &&
          manualEntry.paymentMethod === '' &&
          manualEntry.transactionStatus === TransactionStatus.SUCCESS &&
          manualEntry.remark === '' &&
          manualEntry.category === '零食' &&
          manualEntry.ai_category === '' &&
          manualEntry.ai_reasoning === '' &&
          manualEntry.user_note === '手记写入实例库字段映射验证' &&
          manualEntry.is_verified === true
      ),
      manualEntry,
      'D 类手记样本应与手记规格和 v7 实例库字段表一致'
    );

    /**
     * 再种入一条 B 类错误纠正样本，验证分类阶段运行时注入 schema：
     * - 不带 created_at
     * - B 区块保留并前缀化 ai_category / ai_reasoning
     * - A+C+D 区块去掉 ai_category，但保留 ai_reasoning
     */
    const correctedRecord: FullTransactionRecord = {
      id: `spec_csv_${Date.now().toString(36)}`,
      time: formatNowForRecord(),
      sourceType: 'wechat',
      category: '零食',
      rawClass: '商户消费',
      counterparty: '实例库测试商户',
      product: '实例库测试奶茶',
      amount: 19.9,
      direction: 'out',
      paymentMethod: '零钱',
      transactionStatus: TransactionStatus.SUCCESS,
      remark: '实例库规格测试',
      ai_category: '正餐',
      ai_reasoning: '错误示例：餐饮商户默认归正餐',
      user_category: '零食',
      user_note: '用户明确修正为零食',
      is_verified: false,
      updated_at: formatNowForRecord(),
    };
    await ExampleStore.addOrUpdate(tempLedger, correctedRecord, true);

    const references = await ExampleStore.retrieveRelevant(tempLedger, [
      {
        id: 'probe_manual',
        counterparty: '',
        description: '实例库测试面包',
        amount: 23.6,
        time: '12:00:00',
      },
      {
        id: 'probe_csv',
        counterparty: '实例库测试商户',
        description: '实例库测试奶茶',
        amount: 19.9,
        time: '12:30:00',
      },
    ]);

    const misclassified = references?.misclassified_examples[0];
    const confirmedManual = references?.confirmed_examples.find((entry) => entry.id === manualId);
    assertStep(
      report,
      'runtimeInjectionMatchesV7Shape',
      Boolean(
        references &&
          misclassified &&
          confirmedManual &&
          !Object.prototype.hasOwnProperty.call(misclassified, 'created_at') &&
          !Object.prototype.hasOwnProperty.call(confirmedManual, 'created_at') &&
          misclassified.ai_category.startsWith('[错误判断] ') &&
          misclassified.ai_reasoning.startsWith('[错误判断] ') &&
          !Object.prototype.hasOwnProperty.call(confirmedManual, 'ai_category') &&
          Object.prototype.hasOwnProperty.call(confirmedManual, 'ai_reasoning') &&
          Object.prototype.hasOwnProperty.call(confirmedManual, 'rawClass') &&
          Object.prototype.hasOwnProperty.call(confirmedManual, 'paymentMethod') &&
          Object.prototype.hasOwnProperty.call(confirmedManual, 'transactionStatus') &&
          Object.prototype.hasOwnProperty.call(confirmedManual, 'remark')
      ),
      references,
      '分类阶段运行时注入应符合 v7 rich schema：去掉 created_at，B 区块前缀化错误字段，A+C+D 区块保留 ai_reasoning 但去掉 ai_category'
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

async function runLearningPayloadSpecTest(): Promise<DebugTestReport> {
  await ensureAppReady();

  const report = createReport('runLearningPayloadSpecTest');
  const ledgerManager = LedgerManager.getInstance();
  const originalLedger = getActiveLedgerName();
  const tempLedger = buildTempLedgerName('学习载荷测试账本');

  try {
    const created = await ledgerManager.createLedger(tempLedger);
    assertStep(report, 'createTempLedger', created, { tempLedger }, '学习 payload 规格测试先创建独立临时账本');

    /**
     * 先造一条 D 类手记样本，再删除它，确保 delta 中同时出现 upserts 与 deletions。
     */
    const manualEntryId = await ManualEntryManager.getInstance().addEntry(tempLedger, {
      amount: 18.2,
      direction: 'out',
      category: '零食',
      subject: '学习载荷测试面包',
      description: '用于验证 deletions 与 rich schema',
      date: formatNowForRecord(),
    });
    /**
     * 基线必须推进到“手记样本仍然存在”的时刻。
     * 这样后续删除它时，delta 中才会出现真正的 deletions。
     */
    const baselineRevision = (await ExampleStore.getStats(tempLedger)).revision;
    await ManualEntryManager.getInstance().deleteEntry(tempLedger, manualEntryId);

    /**
     * 再造一条仍然存在的 B 类纠正样本，确保 upserts 中能看到完整 rich schema。
     */
    const correctedRecord: FullTransactionRecord = {
      id: `learning_csv_${Date.now().toString(36)}`,
      time: formatNowForRecord(),
      sourceType: 'wechat',
      category: '零食',
      rawClass: '商户消费',
      counterparty: '学习载荷测试商户',
      product: '学习载荷测试奶茶',
      amount: 16.8,
      direction: 'out',
      paymentMethod: '零钱',
      transactionStatus: TransactionStatus.SUCCESS,
      remark: '学习载荷规格测试',
      ai_category: '正餐',
      ai_reasoning: '错误示例：餐饮商户默认归正餐',
      user_category: '零食',
      user_note: '用户明确修正为零食',
      is_verified: false,
      updated_at: formatNowForRecord(),
    };
    await ExampleStore.addOrUpdate(tempLedger, correctedRecord, true);

    const delta = await ExampleStore.getLearningDelta(tempLedger, baselineRevision);
    const payload = LearningSession.buildLearningPayload(delta);
    const firstUpsert = payload.upserts[0];
    const firstDeletion = payload.deletions[0];
    assertStep(
      report,
      'learningDeltaPayloadMatchesV7Shape',
      payload.mode === 'delta' &&
        payload.from_revision === baselineRevision &&
        payload.to_revision > baselineRevision &&
        Array.isArray(payload.upserts) &&
        Array.isArray(payload.deletions) &&
        payload.current_examples === undefined &&
        Boolean(
          firstUpsert &&
            !Object.prototype.hasOwnProperty.call(firstUpsert, 'created_at') &&
            Object.prototype.hasOwnProperty.call(firstUpsert, 'paymentMethod') &&
            Object.prototype.hasOwnProperty.call(firstUpsert, 'transactionStatus') &&
            Object.prototype.hasOwnProperty.call(firstUpsert, 'remark') &&
            Object.prototype.hasOwnProperty.call(firstUpsert, 'ai_category') &&
            Object.prototype.hasOwnProperty.call(firstUpsert, 'is_verified')
        ) &&
        Boolean(
          firstDeletion &&
            !Object.prototype.hasOwnProperty.call(firstDeletion, 'created_at') &&
            Object.prototype.hasOwnProperty.call(firstDeletion, 'paymentMethod') &&
            Object.prototype.hasOwnProperty.call(firstDeletion, 'transactionStatus') &&
            Object.prototype.hasOwnProperty.call(firstDeletion, 'remark') &&
            Object.prototype.hasOwnProperty.call(firstDeletion, 'ai_category') &&
            Object.prototype.hasOwnProperty.call(firstDeletion, 'is_verified')
        ),
      payload,
      '学习阶段 payload 应符合 v7 rich schema：mode=delta、from/to_revision、upserts+deletions 同时存在、字段完整且不带 created_at'
    );

    const fullReconcilePayload = LearningSession.buildLearningPayload({
      mode: 'full_reconcile',
      lastLearnedRevision: 99,
      currentRevision: 1,
      upserts: [],
      deletions: [],
      allEntries: await ExampleStore.load(tempLedger),
      reason: 'debug_full_reconcile',
    });
    assertStep(
      report,
      'fullReconcileUsesCurrentExamples',
      fullReconcilePayload.mode === 'full_reconcile' &&
        Array.isArray(fullReconcilePayload.current_examples) &&
        !Object.prototype.hasOwnProperty.call(fullReconcilePayload, 'all_examples'),
      fullReconcilePayload,
      'full_reconcile 模式应使用 current_examples，而不是旧的 all_examples'
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

async function runLearningAutomationSpecTest(): Promise<DebugTestReport> {
  await ensureAppReady();

  const report = createReport('runLearningAutomationSpecTest');
  const ledgerManager = LedgerManager.getInstance();
  const prefsManager = LedgerPreferencesManager.getInstance();
  const manualManager = ManualEntryManager.getInstance();
  const originalLedger = getActiveLedgerName();
  const tempLedger = buildTempLedgerName('学习偏好测试账本');

  try {
    const created = await ledgerManager.createLedger(tempLedger);
    assertStep(report, 'createTempLedger', created, { tempLedger }, '自动学习偏好测试先创建独立临时账本');

    const savedPrefs = await prefsManager.update(tempLedger, {
      learning: {
        threshold: 2,
        autoLearn: true,
      },
    });
    assertStep(
      report,
      'persistInitialLearningPrefs',
      savedPrefs.learning.threshold === 2 && savedPrefs.learning.autoLearn === true,
      savedPrefs.learning,
      '学习阈值与 autoLearn 应写入 ledgers/{ledger}/ai_prefs.json'
    );

    const seededId = await manualManager.addEntry(tempLedger, {
      amount: 26,
      direction: 'out',
      category: '正餐',
      subject: '学习自动触发样本',
      description: '用于验证自动学习阈值',
      date: '2026-04-09 12:30:00',
    });
    assertStep(report, 'seedManualExample', Boolean(seededId), { seededId }, '应成功写入一条 D 类样本');

    const beforeTrigger = await LearningAutomationService.inspect(tempLedger);
    assertStep(
      report,
      'thresholdBlocksAutoLearning',
      beforeTrigger.pendingCount === 1 && beforeTrigger.threshold === 2 && beforeTrigger.shouldTrigger === false,
      beforeTrigger,
      '当 pendingCount 小于阈值时，不应触发自动学习'
    );

    const loweredPrefs = await prefsManager.update(tempLedger, {
      learning: {
        threshold: 1,
        autoLearn: true,
      },
    });
    assertStep(
      report,
      'lowerLearningThreshold',
      loweredPrefs.learning.threshold === 1,
      loweredPrefs.learning,
      '降低阈值后，自动学习判定应变为可触发'
    );

    const afterLowering = await LearningAutomationService.inspect(tempLedger);
    assertStep(
      report,
      'thresholdEnablesAutoLearning',
      afterLowering.pendingCount === 1 && afterLowering.threshold === 1 && afterLowering.shouldTrigger === true,
      afterLowering,
      '当 pendingCount 达到阈值时，应进入可自动学习状态'
    );

    const disabledPrefs = await prefsManager.update(tempLedger, {
      learning: {
        autoLearn: false,
      },
    });
    assertStep(
      report,
      'disableAutoLearn',
      disabledPrefs.learning.autoLearn === false,
      disabledPrefs.learning,
      '关闭 autoLearn 后，配置文件应保留该状态'
    );

    const afterDisable = await LearningAutomationService.inspect(tempLedger);
    assertStep(
      report,
      'autoLearnStopsTrigger',
      afterDisable.pendingCount === 1 && afterDisable.autoLearn === false && afterDisable.shouldTrigger === false,
      afterDisable,
      '即便达到阈值，只要 autoLearn 关闭，就不应自动触发学习'
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

async function runCompressionSpecTest(): Promise<DebugTestReport> {
  await ensureAppReady();

  const report = createReport('runCompressionSpecTest');
  const ledgerManager = LedgerManager.getInstance();
  const originalLedger = getActiveLedgerName();
  const tempLedger = buildTempLedgerName('收编测试账本');

  try {
    const created = await ledgerManager.createLedger(tempLedger);
    assertStep(report, 'createTempLedger', created, { tempLedger }, '收编规格测试先创建独立临时账本');

    const prefs = await LedgerPreferencesManager.getInstance().update(tempLedger, {
      compression: {
        threshold: 30,
        ratio: 0.7,
      },
    });
    assertStep(
      report,
      'compressionPrefsStored',
      prefs.compression.threshold === 30 && prefs.compression.ratio === 0.7,
      prefs,
      '账本行为配置应能稳定保存收编阈值与压缩比例'
    );

    /**
     * 人工构造 31 条记忆，使其超过默认阈值 30。
     * 这样可以验证 targetCount = floor(31 * 0.7) = 21。
     */
    const memoryEntries = Array.from({ length: 31 }, (_, index) => `收编测试记忆 ${index + 1}`);
    await MemoryManager.save(tempLedger, memoryEntries, 'manual', '收编规格测试：注入 31 条记忆');
    await ExampleStore.addOrUpdate(
      tempLedger,
      {
        id: `compress_csv_${Date.now().toString(36)}`,
        time: formatNowForRecord(),
        sourceType: 'wechat',
        category: '零食',
        rawClass: '商户消费',
        counterparty: '收编测试商户',
        product: '收编测试奶茶',
        amount: 12.8,
        direction: 'out',
        paymentMethod: '零钱',
        transactionStatus: TransactionStatus.SUCCESS,
        remark: '用于验证 currentExamples 全量注入',
        ai_category: '零食',
        ai_reasoning: '正向参考',
        user_category: '零食',
        user_note: '',
        is_verified: true,
        updated_at: formatNowForRecord(),
      },
      false
    );

    const categories = LedgerService.getInstance().getCategories();
    const context = await CompressionSession.buildContext(tempLedger, categories);
    assertStep(
      report,
      'compressionContextMatchesPrefs',
      context.currentCount === 31 &&
        context.threshold === 30 &&
        context.ratio === 0.7 &&
        context.targetCount === 21 &&
        context.currentExamples.length >= 1,
      context,
      '收编上下文应读取 ledgers/{ledger}/ai_prefs.json，并按 floor(currentCount * 0.7) 计算 targetCount'
    );

    const parsed = CompressionSession.parseOutput(
      Array.from({ length: 21 }, (_, index) => `${index + 1}. 压缩结果 ${index + 1}`).join('\n'),
      context.targetCount
    );
    assertStep(
      report,
      'compressionOutputAcceptedWithinLimit',
      parsed.length === 21,
      parsed,
      '不超过 targetCount 的编号列表应通过基础校验'
    );

    let overflowError = '';
    try {
      CompressionSession.parseOutput(
        Array.from({ length: 22 }, (_, index) => `${index + 1}. 超限结果 ${index + 1}`).join('\n'),
        context.targetCount
      );
    } catch (error) {
      overflowError = error instanceof Error ? error.message : String(error);
    }
    assertStep(
      report,
      'compressionOutputRejectsOverflow',
      overflowError.includes('exceeds target count'),
      { overflowError, targetCount: context.targetCount },
      '超过 targetCount 的结果必须被拒绝，避免脏写 ai_compress 快照'
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

async function runBillImportBackendTest(): Promise<DebugTestReport> {
  await ensureAppReady();

  const report = createReport('runBillImportBackendTest');
  const ledgerManager = LedgerManager.getInstance();
  const originalLedger = getActiveLedgerName();
  const tempLedger = buildTempLedgerName('导入测试账本');

  try {
    const created = await ledgerManager.createLedger(tempLedger);
    assertStep(report, 'createTempLedger', created, { tempLedger }, '账单导入后端测试必须先切到独立临时账本');
    if (!created || getActiveLedgerName() !== tempLedger) {
      throw new Error('创建临时账本失败，已中止账单导入测试，避免污染当前账本');
    }

    const passwords = await loadImportFixturePasswords();
    assertStep(
      report,
      'loadFixturePasswords',
      Boolean(passwords.wechat && passwords.alipay),
      passwords,
      '应能从样本目录读取微信和支付宝压缩包密码'
    );

    const directFile = buildDirectWechatFixtureFile();
    const directProbe = await appFacade.probeBillImportFiles([directFile], { expectedSource: 'wechat' });
    assertStep(
      report,
      'probeDirectTextFile',
      directProbe.status === 'ready' && directProbe.transactionCount === 1,
      directProbe,
      '未知后缀的直传文本账单应可直接识别，不应要求输入密码'
    );

    const wechatZip = await loadFixtureFile(BILL_IMPORT_FIXTURE_PATHS.wechatZip);
    const wechatProbeWithoutPassword = await appFacade.probeBillImportFiles([wechatZip], { expectedSource: 'wechat' });
    assertStep(
      report,
      'probeWechatZipNeedsPassword',
      wechatProbeWithoutPassword.status === 'password_required' && wechatProbeWithoutPassword.passwordState === 'missing',
      wechatProbeWithoutPassword,
      '加密微信压缩包在未提供密码时应明确返回 password_required'
    );

    const wechatProbeWrongPassword = await appFacade.probeBillImportFiles([wechatZip], {
      expectedSource: 'wechat',
      password: 'wrong-password',
    });
    assertStep(
      report,
      'probeWechatZipInvalidPassword',
      wechatProbeWrongPassword.status === 'password_required' && wechatProbeWrongPassword.passwordState === 'invalid',
      wechatProbeWrongPassword,
      '错误密码不应被吞掉，而应明确返回 invalid password 状态'
    );

    const wechatProbeReady = await appFacade.probeBillImportFiles([wechatZip], {
      expectedSource: 'wechat',
      password: passwords.wechat,
    });
    assertStep(
      report,
      'probeWechatZipReady',
      wechatProbeReady.status === 'ready' && (wechatProbeReady.transactionCount ?? 0) > 0,
      wechatProbeReady,
      '正确密码下，微信压缩包应能被识别为可直接导入'
    );

    const beforeWechatImportCount = Object.keys(LedgerService.getInstance().getState().ledgerMemory?.records ?? {}).length;
    const wechatImport = await appFacade.importBillFiles([wechatZip], {
      expectedSource: 'wechat',
      password: passwords.wechat,
    });
    const afterWechatImportCount = Object.keys(LedgerService.getInstance().getState().ledgerMemory?.records ?? {}).length;
    assertStep(
      report,
      'importWechatZip',
      wechatImport.importedCount > 0 && afterWechatImportCount - beforeWechatImportCount === wechatImport.importedCount,
      {
        beforeWechatImportCount,
        afterWechatImportCount,
        wechatImport,
      },
      '微信压缩包导入后，临时账本记录数应按导入条数增长'
    );

    const beforeDirectImportCount = afterWechatImportCount;
    const directImport = await appFacade.importBillFiles([directFile], { expectedSource: 'wechat' });
    const afterDirectImportCount = Object.keys(LedgerService.getInstance().getState().ledgerMemory?.records ?? {}).length;
    assertStep(
      report,
      'importDirectTextFile',
      directImport.importedCount === 1 && afterDirectImportCount - beforeDirectImportCount === 1,
      {
        beforeDirectImportCount,
        afterDirectImportCount,
        directImport,
      },
      '非压缩直传文本账单也应能完整走通后端导入链路'
    );

    const alipayZip = await loadFixtureFile(BILL_IMPORT_FIXTURE_PATHS.alipayZip);
    const alipayProbeWithoutPassword = await appFacade.probeBillImportFiles([alipayZip], { expectedSource: 'alipay' });
    assertStep(
      report,
      'probeAlipayZipNeedsPassword',
      alipayProbeWithoutPassword.status === 'password_required' && alipayProbeWithoutPassword.passwordState === 'missing',
      alipayProbeWithoutPassword,
      '加密支付宝压缩包在未提供密码时也应先返回 password_required'
    );

    const beforeAlipayImportCount = Object.keys(LedgerService.getInstance().getState().ledgerMemory?.records ?? {}).length;
    const alipayImport = await appFacade.importBillFiles([alipayZip], {
      expectedSource: 'alipay',
      password: passwords.alipay,
    });
    const afterAlipayImportCount = Object.keys(LedgerService.getInstance().getState().ledgerMemory?.records ?? {}).length;
    assertStep(
      report,
      'importAlipayZip',
      alipayImport.importedCount > 0 && afterAlipayImportCount - beforeAlipayImportCount === alipayImport.importedCount,
      {
        beforeAlipayImportCount,
        afterAlipayImportCount,
        alipayImport,
      },
      '支付宝压缩包应能通过后端接口完成导入，并写入独立临时账本'
    );
  } catch (error) {
    pushStep(report, {
      name: 'unexpectedError',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await cleanupTempLedger(originalLedger, tempLedger);
    const ledgersAfterCleanup = await ledgerManager.listLedgers({ syncWithFiles: false });
    report.context = {
      finalActiveLedger: getActiveLedgerName(),
      tempLedgerCleaned: !ledgersAfterCleanup.some((ledger) => ledger.name === tempLedger),
      remainingLedgers: ledgersAfterCleanup.map((ledger) => ledger.name),
    };
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
    prefs: {
      get: async (ledgerId?: string) => {
        await ensureAppReady();
        const targetLedger = ledgerId ?? getActiveLedgerName();
        if (!targetLedger) {
          throw new Error('No active ledger loaded');
        }
        return await LedgerPreferencesManager.getInstance().load(targetLedger);
      },
      update: async (patch: Record<string, unknown>, ledgerId?: string) => {
        await ensureAppReady();
        const targetLedger = ledgerId ?? getActiveLedgerName();
        if (!targetLedger) {
          throw new Error('No active ledger loaded');
        }
        return await LedgerPreferencesManager.getInstance().update(
          targetLedger,
          patch as Partial<LedgerPreferences>
        );
      },
    },
    learning: {
      getDeltaPayload: async (ledgerId?: string, baselineRevision: number = 0) => {
        await ensureAppReady();
        const targetLedger = ledgerId ?? getActiveLedgerName();
        if (!targetLedger) {
          throw new Error('No active ledger loaded');
        }
        const delta = await ExampleStore.getLearningDelta(targetLedger, baselineRevision);
        return LearningSession.buildLearningPayload(delta);
      },
      getAutoTriggerState: async (ledgerId?: string) => {
        await ensureAppReady();
        const targetLedger = ledgerId ?? getActiveLedgerName();
        if (!targetLedger) {
          throw new Error('No active ledger loaded');
        }
        return await LearningAutomationService.inspect(targetLedger);
      },
    },
    compression: {
      getContext: async (ledgerId?: string, force: boolean = false) => {
        await ensureAppReady();
        const targetLedger = ledgerId ?? getActiveLedgerName();
        if (!targetLedger) {
          throw new Error('No active ledger loaded');
        }
        return await CompressionSession.buildContext(
          targetLedger,
          LedgerService.getInstance().getCategories(),
          { force }
        );
      },
      parseOutput: async (raw: string, targetCount: number) => {
        await ensureAppReady();
        return CompressionSession.parseOutput(raw, targetCount);
      },
      run: async (ledgerId?: string, force: boolean = false) => {
        await ensureAppReady();
        const targetLedger = ledgerId ?? getActiveLedgerName();
        if (!targetLedger) {
          throw new Error('No active ledger loaded');
        }
        return await CompressionSession.run(
          targetLedger,
          LedgerService.getInstance().getCategories(),
          { force }
        );
      },
    },
    home: {
      getReadModel: getHomeReadModel,
    },
    billImport: {
      probe: async (files: File[], options?: BillImportOptions) => {
        await ensureAppReady();
        return await appFacade.probeBillImportFiles(files, options);
      },
      import: async (files: File[], options?: BillImportOptions) => {
        await ensureAppReady();
        return await appFacade.importBillFiles(files, options);
      },
    },
  };
}

function createE2EApi(): MoniE2EApi {
  return {
    tests: {
      runLedgerCrudTest,
      runManualEntryFlowTest,
      runBudgetFlowTest,
      runExampleStoreSpecTest,
      runLearningPayloadSpecTest,
      runLearningAutomationSpecTest,
      runCompressionSpecTest,
      runHomeReadModelSmokeTest,
      runBillImportBackendTest,
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
