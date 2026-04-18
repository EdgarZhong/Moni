import { Capacitor } from '@capacitor/core';
import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterDirectory, AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
import {
  getLedgerFilePath,
  LEDGER_FILE_NAME,
  LEDGERS_INDEX_PATH,
  LEDGERS_ROOT_DIR,
  PERSISTENCE_DIRECTORY,
} from '@system/filesystem/persistence-paths';
import { format } from 'date-fns';
import type { LedgerMemory } from '@shared/types/metadata';

// --- Types ---

// Native Handle definitions
export type NativeFileHandle = {
  kind: 'file';
  path: string; // Absolute path or relative to Documents depending on implementation
  name: string;
};

export type NativeDirHandle = {
  kind: 'directory';
  path: string;
  name: string;
};

export type StorageHandle = FileSystemFileHandle | NativeFileHandle;
export type StorageDirHandle = FileSystemDirectoryHandle | NativeDirHandle;

export const DEFAULT_LEDGER_NAME = '日常开销';
export const MEMORY_FILE_NAME = LEDGER_FILE_NAME;

/**
 * 默认分类定义
 * 每个分类附带自然语言描述，作为 AI 冷启动锚点和学习基准
 */
const DEFAULT_CATEGORIES: Record<string, string> = {
  正餐: '日常正餐支出（早午晚），如快餐、正餐、工作餐',
  零食: '零食、饮品、小吃等非正餐食品',
  交通: '公共交通、打车、加油、停车等出行费用',
  娱乐: '电影、游戏、演出、会员订阅等娱乐消费',
  大餐: '聚餐、大餐、宴请、高档餐厅等特殊餐饮',
  健康: '医疗、药品、保健品、健身器材等健康支出',
  购物: '日用品、服装、电子产品、网购等购物消费',
  教育: '书籍、课程、培训、考试等教育支出',
  居住: '房租、水电煤、物业、维修等居住费用',
  旅行: '旅游、酒店、机票、景点门票等旅行支出'
};

export const DEFAULT_MEMORY: LedgerMemory = {
  version: '1.1', // 版本升级，表示数据结构变化
  last_sync: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
  defined_categories: DEFAULT_CATEGORIES,
  records: {}
};

// --- Platform Check ---

let isNativeOverride: boolean | null = null;

export const isNativePlatform = () => isNativeOverride ?? Capacitor.isNativePlatform();

/**
 * 持久化目录选择策略：
 * - 当前版本所有正式持久化统一写入 Directory.Data
 * - 浏览器开发态 mock 也跟随同一目录，确保夹具结构与目标结构一致
 */
export function getLedgerStorageDirectory(): AdapterDirectory {
  return PERSISTENCE_DIRECTORY;
}

// Test Helpers
export const _setNativePlatform = (val: boolean) => { isNativeOverride = val; };
/** @deprecated 请使用 FilesystemService.setAdapter() 进行测试注入 */
export const _setFilesystemImpl = (_impl: unknown) => {
  console.warn('[fs-storage] _setFilesystemImpl is deprecated. Use FilesystemService.setAdapter() instead.');
};

export const isFileSystemSupported = () => {
  if (isNativePlatform()) return true;
  return 'showDirectoryPicker' in window;
};

// --- Main Functions ---

export const getAutoDirectoryHandle = async (): Promise<StorageDirHandle> => {
  try {
    const fs = FilesystemService.getInstance();
    if (fs.requestPermissions) {
      const status = await fs.requestPermissions();
      if (status.publicStorage !== 'granted') {
        console.warn('Storage permission might be denied:', status);
      }
    }

    // 正式持久化统一收口到 ledgers/ 根目录。
    const ledgerDir = LEDGERS_ROOT_DIR;
    const ledgerDirectory = getLedgerStorageDirectory();
    try {
      await fs.mkdir({
        path: ledgerDir,
        directory: ledgerDirectory,
        recursive: true
      });
    } catch (e) {
      console.log('Moni directory might already exist or failed to create:', e);
    }

    return {
      kind: 'directory',
      path: ledgerDir,
      name: ledgerDir
    };
  } catch (e) {
    console.error('Failed to init auto directory:', e);
    throw e;
  }
};

export const requestDirectoryHandle = async (): Promise<StorageDirHandle> => {
  if (isNativePlatform()) {
    // Android 默认使用 Documents 目录，先请求权限
    try {
      const fs = FilesystemService.getInstance();
      if (fs.requestPermissions) {
        const status = await fs.requestPermissions();
        if (status.publicStorage !== 'granted') {
          console.warn('Storage permission might be denied or limited:', status);
        }
      }

      const rootPath = ''; // Directory.Documents 的根路径

      return {
        kind: 'directory',
        path: rootPath,
        name: 'Documents'
      };
    } catch (e) {
      console.error('Failed to request native directory:', e);
      throw e;
    }
  } else {
    return await window.showDirectoryPicker({
      mode: 'readwrite'
    });
  }
};

export const getMemoryFileHandle = async (
  dirHandle: StorageDirHandle,
  create: boolean = false
): Promise<StorageHandle | null> => {
  const defaultLedgerPath = getLedgerFilePath(DEFAULT_LEDGER_NAME);

  if (isNativePlatform()) {
    try {
      // 检查文件是否存在
      const fs = FilesystemService.getInstance();
      await fs.stat({
        path: defaultLedgerPath,
        directory: getLedgerStorageDirectory()
      });

      return {
        kind: 'file',
        path: defaultLedgerPath,
        name: DEFAULT_LEDGER_NAME
      };
    } catch {
      if (create) {
        // 返回句柄，写入时会创建文件
        return {
          kind: 'file',
          path: defaultLedgerPath,
          name: DEFAULT_LEDGER_NAME
        };
      }
      return null;
    }
  } else {
    try {
      const ledgerRoot = dirHandle as FileSystemDirectoryHandle;
      const ledgerDir = await ledgerRoot.getDirectoryHandle(DEFAULT_LEDGER_NAME, { create });
      return await ledgerDir.getFileHandle(LEDGER_FILE_NAME, { create });
    } catch (error) {
      if (!create) return null;
      throw error;
    }
  }
};

export const readMemoryFile = async (fileHandle: StorageHandle): Promise<LedgerMemory> => {
  if (isNativePlatform()) {
    const nativeHandle = fileHandle as NativeFileHandle;
    try {
      const fs = FilesystemService.getInstance();
      const text = await fs.readFile({
        path: nativeHandle.path,
        directory: getLedgerStorageDirectory(),
        encoding: AdapterEncoding.UTF8
      });
      return JSON.parse(text) as LedgerMemory;
    } catch (e) {
      console.error('Failed to read memory file (Native):', e);
      return DEFAULT_MEMORY;
    }
  } else {
    const webHandle = fileHandle as FileSystemFileHandle;
    const file = await webHandle.getFile();
    const text = await file.text();
    try {
      return JSON.parse(text) as LedgerMemory;
    } catch (e) {
      console.error('Failed to parse memory file:', e);
      return DEFAULT_MEMORY;
    }
  }
};

export const writeMemoryFile = async (
  fileHandle: StorageHandle,
  data: LedgerMemory
): Promise<void> => {
  if (isNativePlatform()) {
    const nativeHandle = fileHandle as NativeFileHandle;
    const fs = FilesystemService.getInstance();
    /**
     * Android/Capacitor 在写入 `ledgers/{账本名}/ledger.json` 这类嵌套路径时，
     * 如果中间目录尚未存在，会直接抛错而不是帮我们补目录。
     * 这里显式开启递归创建，确保“新建账本”第一次落盘时能把账本目录一起建出来。
     */
    await fs.writeFile({
      path: nativeHandle.path,
      data: JSON.stringify(data, null, 2),
      directory: getLedgerStorageDirectory(),
      encoding: AdapterEncoding.UTF8,
      recursive: true
    });
  } else {
    const webHandle = fileHandle as FileSystemFileHandle;
    const writable = await webHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  }
};

// Helper for recursive native scanning
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function decodeNativeFilePayload(content: string): Uint8Array {
  const normalized = content.replace(/\s+/g, '');
  const isLikelyBase64 =
    normalized.length > 0 &&
    normalized.length % 4 === 0 &&
    /^[A-Za-z0-9+/=]+$/.test(normalized);

  if (isLikelyBase64) {
    try {
      return base64ToUint8Array(normalized);
    } catch {
      // Fall through to text encoding path.
    }
  }

  return new TextEncoder().encode(content);
}

async function scanNativeDir(path: string, fileList: File[]): Promise<File[]> {
  try {
    const fs = FilesystemService.getInstance();
    const files = await fs.readdir({
      path: path,
      directory: AdapterDirectory.Documents
    });

    for (const file of files) {
      const fullPath = path ? `${path}/${file.name}` : file.name;

      if (file.type === 'file') {
        if (file.name.toLowerCase().endsWith('.csv')) {
          // 读取文件内容
          const text = await fs.readFile({
            path: fullPath,
            directory: AdapterDirectory.Documents
          });

          // Native 真机通常返回 base64；浏览器 mock 返回明文文本。这里做兼容解码。
          const contentBytes = decodeNativeFilePayload(text);
          const normalizedBytes = new Uint8Array(contentBytes);
          const fileObj = new File([normalizedBytes], file.name, {
            type: 'text/csv',
            lastModified: file.mtime
          });
          fileList.push(fileObj);
        }
      } else if (file.type === 'directory') {
        await scanNativeDir(fullPath, fileList);
      }
    }
  } catch (e) {
    console.error(`Error scanning native dir ${path}:`, e);
  }
  return fileList;
}

export const scanForCSVFiles = async (
  dirHandle: StorageDirHandle,
  fileList: File[] = []
): Promise<File[]> => {
  if (isNativePlatform()) {
    const nativeDir = dirHandle as NativeDirHandle;
    return await scanNativeDir(nativeDir.path, fileList);
  } else {
    const webDir = dirHandle as FileSystemDirectoryHandle;
    for await (const entry of webDir.values()) {
      if (entry.kind === 'file') {
        if (entry.name.toLowerCase().endsWith('.csv')) {
          fileList.push(await (entry as FileSystemFileHandle).getFile());
        }
      } else if (entry.kind === 'directory') {
        await scanForCSVFiles(entry as FileSystemDirectoryHandle, fileList);
      }
    }
    return fileList;
  }
};

// ============================================
// 账本索引管理 - Ledger Index Management
// ============================================

export const LEDGERS_INDEX_NAME = LEDGERS_INDEX_PATH;

/**
 * 账本元数据接口
 */
export interface LedgerMeta {
  name: string;           // 账本显示名称
  fileName: string;       // 账本主数据相对路径（ledgers/{name}/ledger.json）
  createdAt: string;      // ISO 8601 格式创建时间
  lastOpenedAt: string;   // ISO 8601 格式最后打开时间
}

/**
 * 账本索引数据结构
 */
export interface LedgerIndex {
  ledgers: LedgerMeta[];  // 所有账本列表
  activeLedger: string;   // 当前激活的账本名称
}

/**
 * 默认账本索引（首次启动时创建）
 */
export const DEFAULT_LEDGER_INDEX: LedgerIndex = {
  ledgers: [
    {
      name: DEFAULT_LEDGER_NAME,
      fileName: getLedgerFilePath(DEFAULT_LEDGER_NAME),
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString()
    }
  ],
  activeLedger: DEFAULT_LEDGER_NAME
};

/**
 * 获取账本索引文件句柄（ledgers.json 存储在 APP 沙箱目录）
 * @param create 是否创建（默认 true）
 */
export const getLedgersIndexHandle = async (
  create: boolean = true
): Promise<StorageHandle | null> => {
  // native 和 web mock 路径相同，统一走 FilesystemService（Data 目录）
  const indexPath = LEDGERS_INDEX_NAME;
  const fs = FilesystemService.getInstance();

  try {
    await fs.stat({
      path: indexPath,
      directory: AdapterDirectory.Data
    });

    return {
      kind: 'file',
      path: indexPath,
      name: LEDGERS_INDEX_NAME
    };
  } catch {
    if (create) {
      // 返回句柄，写入时会创建文件
      return {
        kind: 'file',
        path: indexPath,
        name: LEDGERS_INDEX_NAME
      };
    }
    return null;
  }
};

/**
 * 读取账本索引
 * @param fileHandle 索引文件句柄
 * @returns 账本索引数据，失败时返回默认索引
 */
export const readLedgersIndex = async (
  fileHandle: StorageHandle
): Promise<LedgerIndex> => {
  if (isNativePlatform()) {
    const nativeHandle = fileHandle as NativeFileHandle;
    try {
      const fs = FilesystemService.getInstance();
      const text = await fs.readFile({
        path: nativeHandle.path,
        directory: AdapterDirectory.Data,
        encoding: AdapterEncoding.UTF8
      });
      return JSON.parse(text) as LedgerIndex;
    } catch (e) {
      console.error('Failed to read ledgers index (Native):', e);
      return DEFAULT_LEDGER_INDEX;
    }
  } else {
    const webHandle = fileHandle as FileSystemFileHandle;
    const file = await webHandle.getFile();
    const text = await file.text();
    try {
      return JSON.parse(text) as LedgerIndex;
    } catch (e) {
      console.error('Failed to parse ledgers index:', e);
      return DEFAULT_LEDGER_INDEX;
    }
  }
};

/**
 * 写入账本索引
 * @param fileHandle 索引文件句柄
 * @param data 账本索引数据
 */
export const writeLedgersIndex = async (
  fileHandle: StorageHandle,
  data: LedgerIndex
): Promise<void> => {
  if (isNativePlatform()) {
    const nativeHandle = fileHandle as NativeFileHandle;
    const fs = FilesystemService.getInstance();
    await fs.writeFile({
      path: nativeHandle.path,
      data: JSON.stringify(data, null, 2),
      directory: AdapterDirectory.Data,
      encoding: AdapterEncoding.UTF8
    });
  } else {
    const webHandle = fileHandle as FileSystemFileHandle;
    const writable = await webHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  }
};

/**
 * 获取指定账本的文件句柄
 * @param dirHandle 目录句柄（ledgers 根目录）
 * @param ledgerName 账本名称
 * @param create 是否创建（默认 false）
 */
export const getLedgerFileHandle = async (
  dirHandle: StorageDirHandle,
  ledgerName: string,
  create: boolean = false
): Promise<StorageHandle | null> => {
  const filePath = getLedgerFilePath(ledgerName);

  if (isNativePlatform()) {
    try {
      // 检查是否存在
      const fs = FilesystemService.getInstance();
      await fs.stat({
        path: filePath,
        directory: getLedgerStorageDirectory()
      });

      return {
        kind: 'file',
        path: filePath,
        name: ledgerName
      };
    } catch {
      if (create) {
        return {
          kind: 'file',
          path: filePath,
          name: ledgerName
        };
      }
      return null;
    }
  } else {
    try {
      const ledgerRoot = dirHandle as FileSystemDirectoryHandle;
      const ledgerDir = await ledgerRoot.getDirectoryHandle(ledgerName, { create });
      return await ledgerDir.getFileHandle(LEDGER_FILE_NAME, { create });
    } catch (error) {
      if (!create) return null;
      throw error;
    }
  }
};

/**
 * 删除账本文件
 * @param dirHandle 目录句柄（ledgers 根目录）
 * @param ledgerName 账本名称
 */
export const deleteLedgerFile = async (
  dirHandle: StorageDirHandle,
  ledgerName: string
): Promise<void> => {
  const filePath = getLedgerFilePath(ledgerName);

  if (isNativePlatform()) {
    try {
      const fs = FilesystemService.getInstance();
      await fs.deleteFile({
        path: filePath,
        directory: getLedgerStorageDirectory()
      });
    } catch (e) {
      console.error('Failed to delete ledger file (Native):', e);
      throw e;
    }
  } else {
    try {
      await (dirHandle as FileSystemDirectoryHandle).removeEntry(ledgerName, { recursive: true });
    } catch (e) {
      console.error('Failed to delete ledger file (Web):', e);
      throw e;
    }
  }
};

/**
 * 扫描目录下所有账本文件（用于重建索引）
 * @param dirHandle 目录句柄（ledgers 根目录）
 * @returns 账本文件元数据列表
 */
export const scanForLedgerFiles = async (
  dirHandle: StorageDirHandle
): Promise<LedgerMeta[]> => {
  const ledgers: LedgerMeta[] = [];

  if (isNativePlatform()) {
    try {
      const fs = FilesystemService.getInstance();
      const ledgerDirs = await fs.readdir({
        path: LEDGERS_ROOT_DIR,
        directory: getLedgerStorageDirectory()
      });

      for (const entry of ledgerDirs) {
        if (entry.type !== 'directory') {
          continue;
        }
        const name = entry.name;
        const ledgerFilePath = getLedgerFilePath(name);
        const stat = await fs.stat({
          path: ledgerFilePath,
          directory: getLedgerStorageDirectory()
        }).catch(() => null);
        if (!stat || stat.type !== 'file') {
          continue;
        }
        ledgers.push({
          name,
          fileName: ledgerFilePath,
          createdAt: new Date(stat.ctime || Date.now()).toISOString(),
          lastOpenedAt: name === DEFAULT_LEDGER_NAME
            ? new Date().toISOString()
            : '1970-01-01T00:00:00.000Z'
        });
      }
    } catch (e) {
      console.error('Failed to scan ledger files (Native):', e);
    }
  } else {
    const webDir = dirHandle as FileSystemDirectoryHandle;
    for await (const entry of webDir.values()) {
      if (entry.kind === 'directory') {
        const ledgerDir = entry as FileSystemDirectoryHandle;
        const name = ledgerDir.name;
        let file: File;
        try {
          file = await (await ledgerDir.getFileHandle(LEDGER_FILE_NAME)).getFile();
        } catch {
          continue;
        }
        ledgers.push({
          name,
          fileName: getLedgerFilePath(name),
          createdAt: new Date(file.lastModified).toISOString(),
          lastOpenedAt: name === DEFAULT_LEDGER_NAME
            ? new Date().toISOString()
            : '1970-01-01T00:00:00.000Z'
        });
      }
    }
  }

  return ledgers;
};
