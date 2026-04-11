import { LedgerService } from './LedgerService';
import {
  getAutoDirectoryHandle,
  getLedgerStorageDirectory,
  readMemoryFile,
  writeMemoryFile,
  DEFAULT_MEMORY,
  // 账本索引管理
  getLedgersIndexHandle,
  readLedgersIndex,
  writeLedgersIndex,
  getLedgerFileHandle,
  deleteLedgerFile,
  scanForLedgerFiles,
  DEFAULT_LEDGER_INDEX,
  DEFAULT_LEDGER_NAME,
  type StorageDirHandle,
  type LedgerIndex,
  type LedgerMeta
} from '@system/filesystem/fs-storage';
import type { LedgerMemory } from '@shared/types/metadata';
import { format } from 'date-fns';
import { classifyQueue } from '../ai/ClassifyQueue';
import { classifyTrigger } from '../ai/ClassifyTrigger';
import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterDirectory, AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
import { MemoryManager } from './MemoryManager';
import { BudgetManager } from './BudgetManager';
import { LedgerPreferencesManager } from './LedgerPreferencesManager';

/**
 * LedgerManager - 账本管理器（决策层）
 *
 * 职责：
 * 1. 管理 ledgers.json 索引（存储在 APP 沙箱目录）
 * 2. 扫描文件系统，同步索引与实际状态
 * 3. 检查账本文件存在性
 * 4. 决定：加载现有账本 or 创建 default 账本
 * 5. 控制 LedgerService 生命周期（决定何时重启 Service）
 *
 * 与 LedgerService 的边界：
 * - LedgerManager: 决策层，管理索引和文件状态
 * - LedgerService: 执行层，管理账本内容和应用状态
 */
export class LedgerManager {
  private static instance: LedgerManager;

  // 账本数据文件目录（Documents/Moni/）
  private ledgerDirHandle: StorageDirHandle | null = null;

  // 当前激活的账本名称
  private activeLedgerName: string = DEFAULT_LEDGER_NAME;

  // LedgerService 单例
  private ledgerService: LedgerService;

  // 初始化 Promise，用于防止重复初始化和并发等待
  private initPromise: Promise<void> | null = null;
  private isInitialized = false;

  private constructor() {
    this.ledgerService = LedgerService.getInstance();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): LedgerManager {
    if (!LedgerManager.instance) {
      LedgerManager.instance = new LedgerManager();
    }
    return LedgerManager.instance;
  }

  /**
   * 初始化账本管理器
   * 在应用启动时调用，执行文件同步并加载 active 账本
   */
  public async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      console.log('[LedgerManager] Initializing...');
      try {
        // 1. 获取账本数据文件目录（Documents/Moni/）
        this.ledgerDirHandle = await getAutoDirectoryHandle();
        console.log('[LedgerManager] Ledger directory initialized');

        // 2. 同步索引与文件系统
        await this.syncIndexWithFiles();

        // 3. 获取 active 账本名称（syncIndexWithFiles 已确保其存在）
        const index = await this.readIndex();
        this.activeLedgerName = index.activeLedger;

        // 4. 加载 active 账本
        await this.loadActiveLedger();

        this.isInitialized = true;
        console.log('[LedgerManager] Initialization complete, active ledger:', this.activeLedgerName);
      } catch (error) {
        console.error('[LedgerManager] Initialization failed:', error);
        // Reset promise so we can try again
        this.initPromise = null;
        throw error;
      }
    })();

    return this.initPromise;
  }

  /**
   * 确保已初始化 (Lazy Init Helper)
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      console.log('[LedgerManager] Not initialized, attempting lazy init...');
      await this.init();
    }
  }

  /**
   * 同步索引与文件系统状态
   * 核心逻辑：确保 ledgers.json 索引与实际 .moni.json 文件一致
   */
  private async syncIndexWithFiles(): Promise<void> {
    console.log('[LedgerManager] Syncing index with files...');

    if (!this.ledgerDirHandle) {
      throw new Error('Ledger directory not initialized');
    }

    // 1. 扫描实际文件（Documents/Moni/）
    const actualFiles = await scanForLedgerFiles(this.ledgerDirHandle);
    console.log('[LedgerManager] Scanned ledger files:', actualFiles.map(f => f.name));

    // 2. 读取索引（沙箱目录）
    let index: LedgerIndex;
    try {
      index = await this.readIndex();
    } catch (e) {
      console.warn('[LedgerManager] Failed to read index, creating default:', e);
        index = { ledgers: [], activeLedger: DEFAULT_LEDGER_NAME };
    }

    // 3. 构建文件名集合
    const actualFileNames = new Set(actualFiles.map(f => f.fileName));

    // 4. 移除孤儿记录（索引中有但文件不存在）
    const beforeCount = index.ledgers.length;
    index.ledgers = index.ledgers.filter((l: LedgerMeta) => actualFileNames.has(l.fileName));
    if (index.ledgers.length !== beforeCount) {
      console.log('[LedgerManager] Removed orphaned ledger records:',
        beforeCount - index.ledgers.length);
    }

    // 5. 添加新发现的文件（文件存在但索引中没有）
    const existingNames = new Set(index.ledgers.map((l: LedgerMeta) => l.name));
    for (const file of actualFiles) {
      if (!existingNames.has(file.name)) {
        index.ledgers.push(file);
        console.log('[LedgerManager] Found new ledger file:', file.name);
      }
    }

    // 6. 确保默认账本存在
    const hasDefault = index.ledgers.some((l: LedgerMeta) => l.name === DEFAULT_LEDGER_NAME);
    if (!hasDefault) {
      const defaultExists = actualFiles.some(f => f.name === DEFAULT_LEDGER_NAME);
      if (!defaultExists) {
        // 创建默认账本文件
        console.log('[LedgerManager] Creating default ledger file...');
        const newDefaultHandle = await getLedgerFileHandle(
          this.ledgerDirHandle,
          DEFAULT_LEDGER_NAME,
          true
        );
        if (newDefaultHandle) {
          await writeMemoryFile(newDefaultHandle, {
            ...DEFAULT_MEMORY,
            last_sync: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
          });
        }
      }
      // 添加默认账本到索引
      const defaultFile = actualFiles.find(f => f.name === DEFAULT_LEDGER_NAME) || {
        name: DEFAULT_LEDGER_NAME,
        fileName: `${DEFAULT_LEDGER_NAME}.moni.json`,
        createdAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString()
      };
      index.ledgers.unshift(defaultFile);
    }

    // 7. 检查 active 账本
    const activeExists = index.ledgers.some((l: LedgerMeta) => l.name === index.activeLedger);
    if (!activeExists) {
      console.warn('[LedgerManager] Active ledger "' + index.activeLedger + '" not found, falling back to default ledger');
      index.activeLedger = DEFAULT_LEDGER_NAME;
    }

    // 8. 写入更新后的索引
    await this.writeIndex(index);
    console.log('[LedgerManager] Index sync complete');
  }

  /**
   * 读取账本索引
   */
  private async readIndex(): Promise<LedgerIndex> {
    const indexHandle = await getLedgersIndexHandle(true);
    if (!indexHandle) {
      return DEFAULT_LEDGER_INDEX;
    }
    return readLedgersIndex(indexHandle);
  }

  /**
   * 写入账本索引
   */
  private async writeIndex(index: LedgerIndex): Promise<void> {
    const indexHandle = await getLedgersIndexHandle(true);
    if (!indexHandle) {
      throw new Error('Failed to get index handle');
    }
    await writeLedgersIndex(indexHandle, index);
  }

  /**
   * 加载 active 账本
   */
  private async loadActiveLedger(): Promise<void> {
    console.log('[LedgerManager] Loading active ledger:', this.activeLedgerName);

    if (!this.ledgerDirHandle) {
      throw new Error('Ledger directory not initialized');
    }

    // 获取 active 账本文件句柄
    const handle = await getLedgerFileHandle(
      this.ledgerDirHandle,
      this.activeLedgerName,
      false
    );

    if (!handle) {
      console.error('[LedgerManager] Active ledger file not found:', this.activeLedgerName);
      throw new Error('Active ledger file not found');
    }

    // 读取账本数据，并在加载前执行结构归一化
    const loadedMemory = await readMemoryFile(handle);
    const normalized = this.ledgerService.normalizeLoadedMemory(loadedMemory);
    if (normalized.migrated) {
      console.log('[LedgerManager] Legacy category structure detected, writing migrated memory once...');
      await writeMemoryFile(handle, normalized.memory);
    }

    // 调用 LedgerService 加载数据
    this.ledgerService.loadFromHandle(handle, normalized.memory);
    const atomicRecoveryResult = await this.ledgerService.recoverPendingAtomicReclassify();
    if (atomicRecoveryResult.attempted > 0) {
      console.log('[LedgerManager] Recovered atomic reclassify mutation:', {
        ledger: this.activeLedgerName,
        attempted: atomicRecoveryResult.attempted,
        failed: atomicRecoveryResult.failedDates.length
      });
    }
    const recoveryResult = await classifyTrigger.recoverPending(this.activeLedgerName);
    if (recoveryResult.attempted > 0) {
      console.log('[LedgerManager] Recovered pending classify dates:', {
        ledger: this.activeLedgerName,
        attempted: recoveryResult.attempted,
        failed: recoveryResult.failedDates.length
      });
    }

    console.log('[LedgerManager] Loaded ledger:', this.activeLedgerName);
  }

  /**
   * 获取账本列表（可选同步）
   * @param options 控制是否同步索引与文件系统
   */
  public async listLedgers(options?: { syncWithFiles?: boolean }): Promise<LedgerMeta[]> {
    await this.ensureInitialized();

    if (!this.ledgerDirHandle) {
      console.error('[LedgerManager] Ledger directory not initialized after init attempt');
      return DEFAULT_LEDGER_INDEX.ledgers;
    }

    // 是否需要同步索引与文件系统（默认同步，避免列表与实际文件不一致）
    const shouldSyncWithFiles = options?.syncWithFiles !== false;
    if (shouldSyncWithFiles) {
      // 同步索引可能触发文件系统扫描，属于重操作
      await this.syncIndexWithFiles();
    }

    // 读取索引用于快速返回列表，避免重复扫描
    const index = await this.readIndex();
    return index.ledgers;
  }

  /**
   * 切换账本
   * @param ledgerName 账本名称
   * @returns 是否成功
   */
  public async switchLedger(ledgerName: string): Promise<boolean> {
    console.log('[LedgerManager] Switching to ledger:', ledgerName);
    await this.ensureInitialized();

    if (!this.ledgerDirHandle) {
      console.error('[LedgerManager] Ledger directory not initialized');
      return false;
    }

    try {
      // 1. 读取索引
      const index = await this.readIndex();

      // 2. 验证账本存在
      const ledgerMeta = index.ledgers.find((l: LedgerMeta) => l.name === ledgerName);
      if (!ledgerMeta) {
        console.error('[LedgerManager] Ledger not found:', ledgerName);
        return false;
      }

      // 3. 更新索引中的 lastOpenedAt 和 activeLedger
      const updatedLedgers = index.ledgers.map((l: LedgerMeta) =>
        l.name === ledgerName
          ? { ...l, lastOpenedAt: new Date().toISOString() }
          : l
      );

      await this.writeIndex({
        ...index,
        ledgers: updatedLedgers,
        activeLedger: ledgerName
      });

      // 4. 更新内部状态
      this.activeLedgerName = ledgerName;

      // 5. 获取账本句柄并加载
      const newHandle = await getLedgerFileHandle(
        this.ledgerDirHandle,
        ledgerName,
        false
      );

      if (!newHandle) {
        console.error('[LedgerManager] Ledger file not found:', ledgerName);
        return false;
      }

      const loadedMemory = await readMemoryFile(newHandle);
      const normalized = this.ledgerService.normalizeLoadedMemory(loadedMemory);
      if (normalized.migrated) {
        console.log('[LedgerManager] Legacy category structure detected on switch, writing migrated memory once...');
        await writeMemoryFile(newHandle, normalized.memory);
      }
      this.ledgerService.loadFromHandle(newHandle, normalized.memory);
      const atomicRecoveryResult = await this.ledgerService.recoverPendingAtomicReclassify();
      if (atomicRecoveryResult.attempted > 0) {
        console.log('[LedgerManager] Recovered atomic reclassify mutation on switch:', {
          ledger: ledgerName,
          attempted: atomicRecoveryResult.attempted,
          failed: atomicRecoveryResult.failedDates.length
        });
      }

      /**
       * 切换账本后自动恢复目标账本的补偿入队记录。
       * 确保在上次 App 崩溃或入队失败后遗留的 recovery 文件能在切换时被及时重放，
       * 而不是等到下次 App 冷启动才触发恢复。
       */
      const recoveryResult = await classifyTrigger.recoverPending(ledgerName);
      if (recoveryResult.attempted > 0) {
        console.log('[LedgerManager] Recovered pending classify dates on switch:', {
          ledger: ledgerName,
          attempted: recoveryResult.attempted,
          failed: recoveryResult.failedDates.length
        });
      }

      console.log('[LedgerManager] Switched to ledger:', ledgerName);
      return true;
    } catch (error) {
      console.error('[LedgerManager] Failed to switch ledger:', error);
      return false;
    }
  }

  /**
   * 创建新账本
   * @param name 账本名称
   * @returns 是否成功
   */
  public async createLedger(name: string): Promise<boolean> {
    console.log('[LedgerManager] Creating ledger:', name);
    await this.ensureInitialized();

    if (!this.ledgerDirHandle) {
      console.error('[LedgerManager] Ledger directory not initialized');
      return false;
    }

    // 验证名称
    const sanitizedName = this.sanitizeLedgerName(name);
    if (!sanitizedName) {
      console.error('[LedgerManager] Invalid ledger name:', name);
      return false;
    }

    try {
      // 1. 读取索引
      const index = await this.readIndex();
      if (index.ledgers.some((l: LedgerMeta) => l.name === sanitizedName)) {
        console.warn('[LedgerManager] Ledger name already exists:', sanitizedName);
        return false;
      }

      // 3. 创建账本文件
      const newHandle = await getLedgerFileHandle(
        this.ledgerDirHandle,
        sanitizedName,
        true
      );

      if (!newHandle) {
        console.error('[LedgerManager] Failed to create ledger file');
        return false;
      }

      const newMemory: LedgerMemory = {
        ...DEFAULT_MEMORY,
        last_sync: format(new Date(), 'yyyy-MM-dd HH:mm:ss')
      };
      await writeMemoryFile(newHandle, newMemory);

      // 4. 更新索引
      const newLedger: LedgerMeta = {
        name: sanitizedName,
        fileName: `${sanitizedName}.moni.json`,
        createdAt: new Date().toISOString(),
        lastOpenedAt: new Date().toISOString()
      };

      await this.writeIndex({
        ...index,
        ledgers: [...index.ledgers, newLedger],
        activeLedger: sanitizedName
      });

      // 5. 更新内部状态
      this.activeLedgerName = sanitizedName;

      // 6. 加载新账本
      this.ledgerService.loadFromHandle(newHandle, newMemory);

      // 7. v6 新增：创建空快照（ledger_init 触发）
      await this.initializeLedgerSnapshot(sanitizedName);

      console.log('[LedgerManager] Created ledger:', sanitizedName);
      return true;
    } catch (error) {
      console.error('[LedgerManager] Failed to create ledger:', error);
      return false;
    }
  }

  /**
   * 删除账本
   * @param ledgerName 账本名称
   * @returns 是否成功
   */
  public async deleteLedger(ledgerName: string): Promise<boolean> {
    console.log('[LedgerManager] Deleting ledger:', ledgerName);
    await this.ensureInitialized();

    if (!this.ledgerDirHandle) {
      console.error('[LedgerManager] Ledger directory not initialized');
      return false;
    }

    // 不允许删除默认账本
    if (ledgerName === DEFAULT_LEDGER_NAME) {
      console.error('[LedgerManager] Cannot delete default ledger');
      return false;
    }

    try {
      // 1. 读取索引
      const index = await this.readIndex();

      // 2. 验证账本存在
      const ledgerMeta = index.ledgers.find((l: LedgerMeta) => l.name === ledgerName);
      if (!ledgerMeta) {
        console.error('[LedgerManager] Ledger not found:', ledgerName);
        return false;
      }

      // 3. 删除物理文件及所有关联的 AI 数据文件
      await deleteLedgerFile(this.ledgerDirHandle, ledgerName);
      await classifyQueue.removeByLedger(ledgerName);
      await classifyTrigger.clearRecoveryByLedger(ledgerName);
      await this.deleteLedgerAIFiles(ledgerName);

      // 4. 更新索引
      const updatedLedgers = index.ledgers.filter((l: LedgerMeta) => l.name !== ledgerName);
      const newActiveLedger = index.activeLedger === ledgerName ? DEFAULT_LEDGER_NAME : index.activeLedger;

      await this.writeIndex({
        ...index,
        ledgers: updatedLedgers,
        activeLedger: newActiveLedger
      });

      // 5. 如果删除的是当前账本，切换到默认账本
      if (this.activeLedgerName === ledgerName) {
        this.activeLedgerName = DEFAULT_LEDGER_NAME;
        await this.loadActiveLedger();
      }

      console.log('[LedgerManager] Deleted ledger:', ledgerName);
      return true;
    } catch (error) {
      console.error('[LedgerManager] Failed to delete ledger:', error);
      return false;
    }
  }

  public async renameLedger(oldName: string, newName: string): Promise<boolean> {
    console.log('[LedgerManager] Renaming ledger:', oldName, '->', newName);
    await this.ensureInitialized();

    if (!this.ledgerDirHandle) {
      console.error('[LedgerManager] Ledger directory not initialized');
      return false;
    }

    const sanitizedNewName = this.sanitizeLedgerName(newName);
    if (!sanitizedNewName) {
      console.error('[LedgerManager] Invalid new ledger name:', newName);
      return false;
    }

    if (oldName === sanitizedNewName) {
      return true;
    }

    try {
      const index = await this.readIndex();
      const oldLedger = index.ledgers.find((l: LedgerMeta) => l.name === oldName);
      if (!oldLedger) {
        console.error('[LedgerManager] Ledger not found:', oldName);
        return false;
      }

      if (index.ledgers.some((l: LedgerMeta) => l.name === sanitizedNewName)) {
        console.error('[LedgerManager] Ledger name already exists:', sanitizedNewName);
        return false;
      }

      const oldHandle = await getLedgerFileHandle(this.ledgerDirHandle, oldName, false);
      if (!oldHandle) {
        console.error('[LedgerManager] Old ledger file not found:', oldName);
        return false;
      }

      const memory = await readMemoryFile(oldHandle);
      const newHandle = await getLedgerFileHandle(this.ledgerDirHandle, sanitizedNewName, true);
      if (!newHandle) {
        console.error('[LedgerManager] Failed to create new ledger file:', sanitizedNewName);
        return false;
      }
      await writeMemoryFile(newHandle, memory);

      const verifyHandle = await getLedgerFileHandle(this.ledgerDirHandle, sanitizedNewName, false);
      if (!verifyHandle) {
        throw new Error(`Failed to verify new ledger file: ${sanitizedNewName}`);
      }
      await readMemoryFile(verifyHandle);

      await deleteLedgerFile(this.ledgerDirHandle, oldName);
      await classifyQueue.renameLedger(oldName, sanitizedNewName);
      await classifyTrigger.renameRecoveryLedger(oldName, sanitizedNewName);
      await this.renameLedgerAIFiles(oldName, sanitizedNewName);

      const now = new Date().toISOString();
      const updatedLedgers = index.ledgers.map((l: LedgerMeta) =>
        l.name === oldName
          ? { ...l, name: sanitizedNewName, fileName: `${sanitizedNewName}.moni.json`, lastOpenedAt: now }
          : l
      );
      const newActiveLedger = index.activeLedger === oldName ? sanitizedNewName : index.activeLedger;

      await this.writeIndex({
        ...index,
        ledgers: updatedLedgers,
        activeLedger: newActiveLedger
      });

      if (this.activeLedgerName === oldName) {
        this.activeLedgerName = sanitizedNewName;
        await this.loadActiveLedger();
      }

      console.log('[LedgerManager] Renamed ledger:', oldName, '->', sanitizedNewName);
      return true;
    } catch (error) {
      console.error('[LedgerManager] Failed to rename ledger:', error);
      return false;
    }
  }

  /**
   * 获取当前激活的账本名称
   */
  public getActiveLedgerName(): string {
    return this.activeLedgerName;
  }

  /**
   * 获取 LedgerService 实例
   */
  public getLedgerService(): LedgerService {
    return this.ledgerService;
  }

  /**
   * 探测目标路径是否存在。
   * 统一封装 stat，可以在开发态减少“可选文件/目录不存在”造成的控制台噪音。
   */
  private async pathExists(path: string, directory: AdapterDirectory): Promise<boolean> {
    try {
      await FilesystemService.getInstance().stat({
        path,
        directory
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 安静删除可选文件。
   * 如果文件不存在，直接返回，不让 mock fs 打出 404。
   */
  private async safeDeleteFile(path: string, directory: AdapterDirectory): Promise<void> {
    const fs = FilesystemService.getInstance();
    const exists = await this.pathExists(path, directory);
    if (!exists) {
      return;
    }
    await fs.deleteFile({
      path,
      directory
    });
  }

  /**
   * 递归删除目录。
   * 某些 mock / node 适配层即使传了 recursive，也可能在目录未清空时抛 ENOTEMPTY。
   * 因此这里先手动深度删除子项，再删目录自身，确保浏览器开发态与目标语义一致。
   */
  private async safeRemoveDir(path: string, directory: AdapterDirectory): Promise<void> {
    const fs = FilesystemService.getInstance();
    const exists = await this.pathExists(path, directory);
    if (!exists) {
      return;
    }

    const entries = await fs.readdir({
      path,
      directory
    });

    for (const entry of entries) {
      const childPath = `${path}/${entry.name}`;
      if (entry.type === 'directory') {
        await this.safeRemoveDir(childPath, directory);
        continue;
      }
      await this.safeDeleteFile(childPath, directory);
    }

    await fs.rmdir({
      path,
      directory,
      recursive: true
    });
  }

  /**
   * 删除账本时清理所有关联的 AI 数据文件（v6 语义）
   * - Documents/Moni/classify_memory/{ledger}/ 整个目录（含 index.json 和所有快照文件）
   * - Documents/Moni/self_description/user_profile.md（如果存在）
   * - 沙箱 classify_examples/{ledger}.json
   * - 沙箱 classify_example_changes/{ledger}.json
   *
   * 任一文件不存在时静默忽略，不影响整体删除流程。
   */
  private async deleteLedgerAIFiles(ledgerName: string): Promise<void> {
    const ledgerStorageDir = getLedgerStorageDirectory();
    // 1. 删除快照目录（v6：Moni/classify_memory/{ledger}/）
    const snapshotDir = `Moni/classify_memory/${ledgerName}`;
    try {
      await this.safeRemoveDir(snapshotDir, ledgerStorageDir);
      console.log(`[LedgerManager] Deleted snapshot directory for: ${ledgerName} in ${ledgerStorageDir}`);
    } catch {
      // 目录不存在时静默忽略
    }

    // 2. 删除自述文件
    try {
      await this.safeDeleteFile(`Moni/self_description/user_profile.md`, ledgerStorageDir);
      console.log(`[LedgerManager] Deleted self-description file in ${ledgerStorageDir}`);
    } catch {
      // 文件不存在时静默忽略
    }

    // 3. 删除实例库文件（沙箱）
    try {
      await this.safeDeleteFile(`classify_examples/${ledgerName}.json`, AdapterDirectory.Data);
      console.log(`[LedgerManager] Deleted examples file for: ${ledgerName}`);
    } catch {
      // 文件不存在时静默忽略
    }

    // 4. 删除实例库变更日志文件（沙箱）
    try {
      await this.safeDeleteFile(`classify_example_changes/${ledgerName}.json`, AdapterDirectory.Data);
      console.log(`[LedgerManager] Deleted example change log for: ${ledgerName}`);
    } catch {
      // 文件不存在时静默忽略
    }

    // 5. 删除预算配置文件（沙箱）
    try {
      await BudgetManager.getInstance().deleteBudgetConfig(ledgerName);
      console.log(`[LedgerManager] Deleted budget config for: ${ledgerName}`);
    } catch {
      // 文件不存在时静默忽略
    }

    // 6. 删除账本行为配置文件（沙箱）
    try {
      await LedgerPreferencesManager.getInstance().deleteLedgerPreferences(ledgerName);
      console.log(`[LedgerManager] Deleted ledger preferences for: ${ledgerName}`);
    } catch {
      // 文件不存在时静默忽略
    }
  }

  /**
   * 重命名账本时迁移所有关联的 AI 数据文件（v6 语义）
   * - classify_memory/{old}/ → classify_memory/{new}/（Documents，整个快照目录）
   * - classify_examples/{old}.json → classify_examples/{new}.json（沙箱）
   * - classify_example_changes/{old}.json → classify_example_changes/{new}.json（沙箱）
   * - self_description/user_profile.md 保持不变（全局共享）
   *
   * 任一源文件不存在时静默跳过，不影响整体重命名流程。
   */
  private async renameLedgerAIFiles(oldName: string, newName: string): Promise<void> {
    const ledgerStorageDir = getLedgerStorageDirectory();
    // 1. 迁移快照目录（v6：Moni/classify_memory/{old}/ → {new}/）
    const oldSnapshotDir = `Moni/classify_memory/${oldName}`;
    const newSnapshotDir = `Moni/classify_memory/${newName}`;
    try {
      const fs = FilesystemService.getInstance();
      const exists = await this.pathExists(oldSnapshotDir, ledgerStorageDir);
      if (exists) {
        const result = await fs.readdir({
          path: oldSnapshotDir,
          directory: ledgerStorageDir
        });
        for (const entry of result) {
          const fileName = entry.name;
          try {
            const sourcePath = `${oldSnapshotDir}/${fileName}`;
            const targetPath = `${newSnapshotDir}/${fileName}`;
            if (entry.type === 'directory') {
              await this.copyDirectoryRecursive(sourcePath, targetPath, ledgerStorageDir);
              continue;
            }
            const data = await fs.readFile({
              path: sourcePath,
              directory: ledgerStorageDir,
              encoding: AdapterEncoding.UTF8
            });
            await fs.writeFile({
              path: targetPath,
              data,
              directory: ledgerStorageDir,
              encoding: AdapterEncoding.UTF8,
              recursive: true
            });
          } catch (e) {
            console.warn(`[LedgerManager] Failed to migrate snapshot item ${fileName}:`, e);
          }
        }
        await this.safeRemoveDir(oldSnapshotDir, ledgerStorageDir);
        console.log(`[LedgerManager] Migrated snapshot directory for: ${oldName} -> ${newName} in ${ledgerStorageDir}`);
      }
    } catch {
      // 目录不存在时静默跳过
    }

    // 2. 迁移实例库文件（沙箱）
    try {
      const fs = FilesystemService.getInstance();
      const examplesPath = `classify_examples/${oldName}.json`;
      const exists = await this.pathExists(examplesPath, AdapterDirectory.Data);
      if (exists) {
        const exContent = await fs.readFile({
          path: examplesPath,
          directory: AdapterDirectory.Data,
          encoding: AdapterEncoding.UTF8
        });
        await fs.writeFile({
          path: `classify_examples/${newName}.json`,
          data: exContent,
          directory: AdapterDirectory.Data,
          encoding: AdapterEncoding.UTF8,
          recursive: true
        });
        await this.safeDeleteFile(examplesPath, AdapterDirectory.Data);
        console.log(`[LedgerManager] Migrated examples file: ${oldName} -> ${newName}`);
      }
    } catch {
      // 源文件不存在时静默忽略
    }

    // 3. 迁移实例库变更日志文件（沙箱）
    try {
      const fs = FilesystemService.getInstance();
      const changeLogPath = `classify_example_changes/${oldName}.json`;
      const exists = await this.pathExists(changeLogPath, AdapterDirectory.Data);
      if (exists) {
        const changeLogContent = await fs.readFile({
          path: changeLogPath,
          directory: AdapterDirectory.Data,
          encoding: AdapterEncoding.UTF8
        });
        await fs.writeFile({
          path: `classify_example_changes/${newName}.json`,
          data: changeLogContent,
          directory: AdapterDirectory.Data,
          encoding: AdapterEncoding.UTF8,
          recursive: true
        });
        await this.safeDeleteFile(changeLogPath, AdapterDirectory.Data);
        console.log(`[LedgerManager] Migrated example change log: ${oldName} -> ${newName}`);
      }
    } catch {
      // 源文件不存在时静默忽略
    }

    // 4. 迁移预算配置文件（沙箱）
    try {
      await BudgetManager.getInstance().renameBudgetConfig(oldName, newName);
      console.log(`[LedgerManager] Migrated budget config: ${oldName} -> ${newName}`);
    } catch {
      // 文件不存在时静默忽略
    }

    // 5. 迁移账本行为配置文件（沙箱）
    try {
      await LedgerPreferencesManager.getInstance().renameLedgerPreferences(oldName, newName);
      console.log(`[LedgerManager] Migrated ledger preferences: ${oldName} -> ${newName}`);
    } catch {
      // 文件不存在时静默忽略
    }
  }

  /**
   * 递归复制目录。
   * 目前主要用于账本重命名时迁移 classify_memory 快照目录。
   */
  private async copyDirectoryRecursive(
    sourcePath: string,
    targetPath: string,
    directory: AdapterDirectory
  ): Promise<void> {
    const fs = FilesystemService.getInstance();
    const entries = await fs.readdir({
      path: sourcePath,
      directory
    });

    for (const entry of entries) {
      const sourceChildPath = `${sourcePath}/${entry.name}`;
      const targetChildPath = `${targetPath}/${entry.name}`;
      if (entry.type === 'directory') {
        await this.copyDirectoryRecursive(sourceChildPath, targetChildPath, directory);
        continue;
      }

      const content = await fs.readFile({
        path: sourceChildPath,
        directory,
        encoding: AdapterEncoding.UTF8
      });
      await fs.writeFile({
        path: targetChildPath,
        data: content,
        directory,
        encoding: AdapterEncoding.UTF8,
        recursive: true
      });
    }
  }

  /**
   * 验证并清理账本名称
   * 仅允许中文、字母、数字、下划线
   * 最大长度 50 字符
   */
  private sanitizeLedgerName(name: string): string | null {
    if (!name || name.trim().length === 0) {
      return null;
    }

    const trimmed = name.trim();
    if (trimmed.length > 50) {
      return null;
    }

    // 仅允许中文、字母、数字、下划线
    const validPattern = /^[\u4e00-\u9fa5a-zA-Z0-9_]+$/;
    if (!validPattern.test(trimmed)) {
      return null;
    }

    return trimmed;
  }

  /**
   * 初始化账本快照（v6 新增）
   * 在创建新账本时调用，生成空快照
   *
   * @param ledgerName 账本名称
   */
  private async initializeLedgerSnapshot(ledgerName: string): Promise<void> {
    try {
      // 创建空快照（ledger_init 触发）
      await MemoryManager.save(
        ledgerName,
        [],
        'ledger_init',
        '账本初始化'
      );
      console.log(`[LedgerManager] Initialized snapshot for ledger: ${ledgerName}`);
    } catch (e) {
      console.error(`[LedgerManager] Failed to initialize snapshot for ${ledgerName}:`, e);
      // 不抛出错误，快照初始化失败不影响账本创建
    }
  }
}
