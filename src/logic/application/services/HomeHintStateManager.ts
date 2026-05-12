import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterDirectory, AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
import { getLedgerHomeHintStatePath } from '@system/filesystem/persistence-paths';

/**
 * 首页情景提示系统的账本级持久化状态。
 *
 * 当前只存两类无法从现有业务数据稳定反推的事实：
 * 1. 用户是否真的启动过至少一次 AI 分类
 * 2. 用户是否已经完成过一次分类后交互学习
 */
export interface LedgerHomeHintState {
  version: 1;
  onboarding: {
    hasStartedAiProcessing: boolean;
    hasCompletedPostAiInteraction: boolean;
  };
  /** 最近一次成功导入账单的 ISO 时间戳；null 表示从未导入过 */
  lastBillImportAt: string | null;
  updatedAt: string;
}

/**
 * HomeHintStateManager - 首页情景提示系统状态管理器
 *
 * 存储位置：
 * - Directory.Data / ledgers/{ledger}/home_hint_state.json
 *
 * 设计原则：
 * 1. 只记录首页 onboarding 需要、但又无法从别处现算的事实
 * 2. 文件缺失或损坏时静默回退到默认值
 * 3. 账本删除/重命名时跟随生命周期同步清理或迁移
 */
export class HomeHintStateManager {
  private static instance: HomeHintStateManager;

  private constructor() {}

  public static getInstance(): HomeHintStateManager {
    if (!HomeHintStateManager.instance) {
      HomeHintStateManager.instance = new HomeHintStateManager();
    }
    return HomeHintStateManager.instance;
  }

  /**
   * 读取指定账本的首页提示状态。
   * 读取失败时返回默认值，避免影响首页主流程。
   */
  public async load(ledgerId: string): Promise<LedgerHomeHintState> {
    const raw = await this.readFile(ledgerId);
    return this.normalize(raw);
  }

  /**
   * 标记：用户已经真实发起过一次 AI 分类启动。
   * 该状态只增不减。
   */
  public async markAiStarted(ledgerId: string): Promise<LedgerHomeHintState> {
    const current = await this.load(ledgerId);
    if (current.onboarding.hasStartedAiProcessing) {
      return current;
    }

    const next: LedgerHomeHintState = {
      ...current,
      onboarding: {
        ...current.onboarding,
        hasStartedAiProcessing: true,
      },
      updatedAt: new Date().toISOString(),
    };
    await this.writeFile(ledgerId, next);
    return next;
  }

  /**
   * 标记：用户已经完成过一次分类后交互学习。
   * 当前接受两种首页行为：
   * 1. 单击交易进入详情页查看
   * 2. 通过长按拖拽改分类
   */
  public async markPostAiInteractionCompleted(ledgerId: string): Promise<LedgerHomeHintState> {
    const current = await this.load(ledgerId);
    if (current.onboarding.hasCompletedPostAiInteraction) {
      return current;
    }

    const next: LedgerHomeHintState = {
      ...current,
      onboarding: {
        ...current.onboarding,
        hasCompletedPostAiInteraction: true,
      },
      updatedAt: new Date().toISOString(),
    };
    await this.writeFile(ledgerId, next);
    return next;
  }

  /**
   * 标记：用户刚完成一次成功的账单导入，记录当前 ISO 时间戳。
   * 供首页提示引擎计算"距上次导入多久了"。
   */
  public async markBillImported(ledgerId: string): Promise<LedgerHomeHintState> {
    const current = await this.load(ledgerId);
    const next: LedgerHomeHintState = {
      ...current,
      lastBillImportAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.writeFile(ledgerId, next);
    return next;
  }

  /**
   * 删除账本时清理首页提示状态文件。
   */
  public async deleteLedgerState(ledgerId: string): Promise<void> {
    const fs = FilesystemService.getInstance();
    try {
      await fs.stat({
        path: this.filePath(ledgerId),
        directory: AdapterDirectory.Data,
      });
      await fs.deleteFile({
        path: this.filePath(ledgerId),
        directory: AdapterDirectory.Data,
      });
    } catch {
      // 状态文件属于可选文件，不存在时静默忽略。
    }
  }

  /**
   * 账本重命名时迁移状态文件。
   */
  public async renameLedgerState(oldLedgerId: string, newLedgerId: string): Promise<void> {
    const raw = await this.readFile(oldLedgerId);
    if (!raw) {
      return;
    }

    const normalized = this.normalize(raw);
    await this.writeFile(newLedgerId, {
      ...normalized,
      updatedAt: new Date().toISOString(),
    });
    await this.deleteLedgerState(oldLedgerId);
  }

  /**
   * 构造持久化路径。
   */
  private filePath(ledgerId: string): string {
    return getLedgerHomeHintStatePath(ledgerId);
  }

  /**
   * 默认状态。
   */
  private createDefaultState(): LedgerHomeHintState {
    return {
      version: 1,
      onboarding: {
        hasStartedAiProcessing: false,
        hasCompletedPostAiInteraction: false,
      },
      lastBillImportAt: null,
      updatedAt: new Date(0).toISOString(),
    };
  }

  /**
   * 读取原始 JSON。
   * 失败统一返回 null，让上层回退默认值。
   */
  private async readFile(ledgerId: string): Promise<unknown | null> {
    const fs = FilesystemService.getInstance();
    try {
      await fs.stat({
        path: this.filePath(ledgerId),
        directory: AdapterDirectory.Data,
      });
      const raw = await fs.readFile({
        path: this.filePath(ledgerId),
        directory: AdapterDirectory.Data,
        encoding: AdapterEncoding.UTF8,
      });
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * 写入状态文件。
   */
  private async writeFile(ledgerId: string, state: LedgerHomeHintState): Promise<void> {
    await FilesystemService.getInstance().writeFile({
      path: this.filePath(ledgerId),
      data: JSON.stringify(state, null, 2),
      directory: AdapterDirectory.Data,
      encoding: AdapterEncoding.UTF8,
      recursive: true,
    });
  }

  /**
   * 归一化状态对象。
   */
  private normalize(raw: unknown): LedgerHomeHintState {
    const defaults = this.createDefaultState();
    if (!raw || typeof raw !== 'object') {
      return defaults;
    }

    const candidate = raw as Partial<LedgerHomeHintState>;
    const onboarding = (candidate.onboarding ?? {}) as Partial<LedgerHomeHintState['onboarding']>;

    return {
      version: 1,
      onboarding: {
        hasStartedAiProcessing:
          typeof onboarding.hasStartedAiProcessing === 'boolean'
            ? onboarding.hasStartedAiProcessing
            : defaults.onboarding.hasStartedAiProcessing,
        hasCompletedPostAiInteraction:
          typeof onboarding.hasCompletedPostAiInteraction === 'boolean'
            ? onboarding.hasCompletedPostAiInteraction
            : defaults.onboarding.hasCompletedPostAiInteraction,
      },
      lastBillImportAt:
        typeof candidate.lastBillImportAt === 'string' && candidate.lastBillImportAt.trim().length > 0
          ? candidate.lastBillImportAt
          : null,
      updatedAt:
        typeof candidate.updatedAt === 'string' && candidate.updatedAt.trim().length > 0
          ? candidate.updatedAt
          : defaults.updatedAt,
    };
  }
}
