import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterDirectory, AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
import type {
  LedgerCompressionPreferences,
  LedgerLearningPreferences,
  LedgerPreferences,
} from '@shared/types/ledger-preferences';

/**
 * LedgerPreferencesManager - 账本级行为配置管理器
 *
 * 职责：
 * 1. 统一管理账本级学习/收编行为配置
 * 2. 提供默认值兜底，避免调用方自己散落常量
 * 3. 处理账本重命名/删除时的配置文件迁移与清理
 *
 * 存储位置：
 * - Directory.Data / ledger_prefs/{ledger}.json
 */
export class LedgerPreferencesManager {
  private static instance: LedgerPreferencesManager;

  /**
   * 当前冻结默认值。
   * 这里直接与文档口径保持一致：
   * - 学习阈值 5
   * - 自动学习开启
   * - 收编阈值 30
   * - 收编压缩比例 0.7
   */
  private static readonly DEFAULT_PREFERENCES: LedgerPreferences = {
    learning: {
      threshold: 5,
      autoLearn: true,
    },
    compression: {
      threshold: 30,
      ratio: 0.7,
    },
  };

  private constructor() {}

  public static getInstance(): LedgerPreferencesManager {
    if (!LedgerPreferencesManager.instance) {
      LedgerPreferencesManager.instance = new LedgerPreferencesManager();
    }
    return LedgerPreferencesManager.instance;
  }

  /**
   * 获取完整默认配置。
   * 返回深拷贝，避免调用方误改共享常量。
   */
  public getDefaults(): LedgerPreferences {
    return JSON.parse(JSON.stringify(LedgerPreferencesManager.DEFAULT_PREFERENCES)) as LedgerPreferences;
  }

  /**
   * 获取指定账本的完整偏好配置。
   * 若配置文件不存在或损坏，则返回默认值。
   */
  public async load(ledgerId: string): Promise<LedgerPreferences> {
    const raw = await this.readFile(ledgerId);
    if (!raw) {
      return this.getDefaults();
    }

    return this.normalizePreferences(raw);
  }

  /**
   * 保存完整配置。
   * 调用方应传入业务上已经确认过的配置值，这里负责归一化和落盘。
   */
  public async save(ledgerId: string, preferences: LedgerPreferences): Promise<LedgerPreferences> {
    const normalized = this.normalizePreferences(preferences);
    await this.writeFile(ledgerId, normalized);
    return normalized;
  }

  /**
   * 局部更新配置。
   * 这是当前业务最常用的形式，便于后续设置页逐项写入。
   */
  public async update(
    ledgerId: string,
    patch: Partial<LedgerPreferences>
  ): Promise<LedgerPreferences> {
    const current = await this.load(ledgerId);
    const next = this.normalizePreferences({
      ...current,
      ...patch,
      learning: {
        ...current.learning,
        ...(patch.learning ?? {}),
      },
      compression: {
        ...current.compression,
        ...(patch.compression ?? {}),
      },
    });
    await this.writeFile(ledgerId, next);
    return next;
  }

  /**
   * 只读取学习配置。
   */
  public async getLearningPreferences(ledgerId: string): Promise<LedgerLearningPreferences> {
    const config = await this.load(ledgerId);
    return config.learning;
  }

  /**
   * 只读取收编配置。
   */
  public async getCompressionPreferences(ledgerId: string): Promise<LedgerCompressionPreferences> {
    const config = await this.load(ledgerId);
    return config.compression;
  }

  /**
   * 账本删除时清理对应的偏好配置文件。
   */
  public async deleteLedgerPreferences(ledgerId: string): Promise<void> {
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
      // 偏好配置属于可选文件，不存在时静默忽略。
    }
  }

  /**
   * 账本重命名时迁移偏好配置文件。
   */
  public async renameLedgerPreferences(oldLedgerId: string, newLedgerId: string): Promise<void> {
    const config = await this.readFile(oldLedgerId);
    if (!config) {
      return;
    }

    const normalized = this.normalizePreferences(config);
    await this.writeFile(newLedgerId, normalized);
    await this.deleteLedgerPreferences(oldLedgerId);
  }

  /**
   * 构造配置文件路径。
   */
  private filePath(ledgerId: string): string {
    return `ledger_prefs/${ledgerId}.json`;
  }

  /**
   * 读取原始 JSON。
   * 读取失败统一返回 null，由上层兜底到默认值。
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
   * 写入配置文件。
   */
  private async writeFile(ledgerId: string, preferences: LedgerPreferences): Promise<void> {
    await FilesystemService.getInstance().writeFile({
      path: this.filePath(ledgerId),
      data: JSON.stringify(preferences, null, 2),
      directory: AdapterDirectory.Data,
      encoding: AdapterEncoding.UTF8,
      recursive: true,
    });
  }

  /**
   * 归一化配置对象。
   * 这里负责：
   * 1. 补默认值
   * 2. 修正非法阈值
   * 3. 将 ratio 限制在 (0, 1] 区间
   */
  private normalizePreferences(raw: unknown): LedgerPreferences {
    const defaults = this.getDefaults();
    if (!raw || typeof raw !== 'object') {
      return defaults;
    }

    const candidate = raw as Partial<LedgerPreferences>;
    const learningCandidate = (candidate.learning ?? {}) as Partial<LedgerLearningPreferences>;
    const compressionCandidate = (candidate.compression ?? {}) as Partial<LedgerCompressionPreferences>;

    const threshold =
      typeof learningCandidate.threshold === 'number' && learningCandidate.threshold > 0
        ? Math.floor(learningCandidate.threshold)
        : defaults.learning.threshold;
    const autoLearn =
      typeof learningCandidate.autoLearn === 'boolean'
        ? learningCandidate.autoLearn
        : defaults.learning.autoLearn;

    const compressionThreshold =
      typeof compressionCandidate.threshold === 'number' && compressionCandidate.threshold > 0
        ? Math.floor(compressionCandidate.threshold)
        : defaults.compression.threshold;
    const ratio =
      typeof compressionCandidate.ratio === 'number' &&
      Number.isFinite(compressionCandidate.ratio) &&
      compressionCandidate.ratio > 0 &&
      compressionCandidate.ratio <= 1
        ? compressionCandidate.ratio
        : defaults.compression.ratio;

    return {
      learning: {
        threshold,
        autoLearn,
      },
      compression: {
        threshold: compressionThreshold,
        ratio,
      },
    };
  }
}
