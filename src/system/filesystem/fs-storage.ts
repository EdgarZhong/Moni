import { Capacitor } from '@capacitor/core';
import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterDirectory, AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
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

export const MEMORY_FILE_NAME = 'default.moni.json';

/**
 * 默认分类定义
 * 每个分类附带自然语言描述，作为 AI 冷启动锚点和学习基准
 */
const DEFAULT_CATEGORIES: Record<string, string> = {
  meal: '日常正餐支出（早午晚），如快餐、正餐、工作餐',
  snack: '零食、饮品、小吃等非正餐食品',
  transport: '公共交通、打车、加油、停车等出行费用',
  entertainment: '电影、游戏、演出、会员订阅等娱乐消费',
  feast: '聚餐、大餐、宴请、高档餐厅等特殊餐饮',
  health: '医疗、药品、保健品、健身器材等健康支出',
  shopping: '日用品、服装、电子产品、网购等购物消费',
  education: '书籍、课程、培训、考试等教育支出',
  housing: '房租、水电煤、物业、维修等居住费用',
  travel: '旅游、酒店、机票、景点门票等旅行支出'
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
  if (isNativePlatform()) {
    try {
      const fs = FilesystemService.getInstance();
      if (fs.requestPermissions) {
        const status = await fs.requestPermissions();
        if (status.publicStorage !== 'granted') {
          console.warn('Storage permission might be denied:', status);
        }
      }

      // 确保 Moni 目录存在于 Documents
      const pixelBillDir = 'Moni';
      try {
        await fs.mkdir({
          path: pixelBillDir,
          directory: AdapterDirectory.Documents,
          recursive: true
        });
      } catch (e) {
        // 目录已存在时忽略
        console.log('Moni directory might already exist or failed to create:', e);
      }

      return {
        kind: 'directory',
        path: pixelBillDir,
        name: 'Moni'
      };
    } catch (e) {
      console.error('Failed to init auto directory:', e);
      throw e;
    }
  }
  throw new Error('Auto directory handle only supported on Native');
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
  if (isNativePlatform()) {
    const nativeDir = dirHandle as NativeDirHandle;
    // 安全拼接路径
    const filePath = nativeDir.path
      ? `${nativeDir.path}/${MEMORY_FILE_NAME}`
      : MEMORY_FILE_NAME;

    try {
      // 检查文件是否存在
      const fs = FilesystemService.getInstance();
      await fs.stat({
        path: filePath,
        directory: AdapterDirectory.Documents
      });

      return {
        kind: 'file',
        path: filePath,
        name: MEMORY_FILE_NAME
      };
    } catch {
      if (create) {
        // 返回句柄，写入时会创建文件
        return {
          kind: 'file',
          path: filePath,
          name: MEMORY_FILE_NAME
        };
      }
      return null;
    }
  } else {
    try {
      return await (dirHandle as FileSystemDirectoryHandle).getFileHandle(MEMORY_FILE_NAME, { create });
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
        directory: AdapterDirectory.Documents,
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
    await fs.writeFile({
      path: nativeHandle.path,
      data: JSON.stringify(data, null, 2),
      directory: AdapterDirectory.Documents,
      encoding: AdapterEncoding.UTF8
    });
  } else {
    const webHandle = fileHandle as FileSystemFileHandle;
    const writable = await webHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  }
};

// Helper for recursive native scanning
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
            directory: AdapterDirectory.Documents,
            encoding: AdapterEncoding.UTF8
          });

          // 构造 File 对象
          const fileObj = new File([text], file.name, {
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

export const LEDGERS_INDEX_NAME = 'ledgers.json';

/**
 * 账本元数据接口
 */
export interface LedgerMeta {
  name: string;           // 账本显示名称
  fileName: string;       // 实际文件名（{name}.moni.json）
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
      name: 'default',
      fileName: 'default.moni.json',
      createdAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString()
    }
  ],
  activeLedger: 'default'
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
 * @param dirHandle 目录句柄（Moni 目录）
 * @param ledgerName 账本名称
 * @param create 是否创建（默认 false）
 */
export const getLedgerFileHandle = async (
  dirHandle: StorageDirHandle,
  ledgerName: string,
  create: boolean = false
): Promise<StorageHandle | null> => {
  const fileName = `${ledgerName}.moni.json`;

  if (isNativePlatform()) {
    const nativeDir = dirHandle as NativeDirHandle;
    const filePath = nativeDir.path
      ? `${nativeDir.path}/${fileName}`
      : fileName;

    try {
      // 检查是否存在
      const fs = FilesystemService.getInstance();
      await fs.stat({
        path: filePath,
        directory: AdapterDirectory.Documents
      });

      return {
        kind: 'file',
        path: filePath,
        name: fileName
      };
    } catch {
      if (create) {
        return {
          kind: 'file',
          path: filePath,
          name: fileName
        };
      }
      return null;
    }
  } else {
    try {
      return await (dirHandle as FileSystemDirectoryHandle).getFileHandle(fileName, { create });
    } catch (error) {
      if (!create) return null;
      throw error;
    }
  }
};

/**
 * 删除账本文件
 * @param dirHandle 目录句柄（Moni 目录）
 * @param ledgerName 账本名称
 */
export const deleteLedgerFile = async (
  dirHandle: StorageDirHandle,
  ledgerName: string
): Promise<void> => {
  const fileName = `${ledgerName}.moni.json`;

  if (isNativePlatform()) {
    const nativeDir = dirHandle as NativeDirHandle;
    const filePath = nativeDir.path
      ? `${nativeDir.path}/${fileName}`
      : fileName;

    try {
      const fs = FilesystemService.getInstance();
      await fs.deleteFile({
        path: filePath,
        directory: AdapterDirectory.Documents
      });
    } catch (e) {
      console.error('Failed to delete ledger file (Native):', e);
      throw e;
    }
  } else {
    try {
      await (dirHandle as FileSystemDirectoryHandle).removeEntry(fileName);
    } catch (e) {
      console.error('Failed to delete ledger file (Web):', e);
      throw e;
    }
  }
};

/**
 * 扫描目录下所有账本文件（用于重建索引）
 * @param dirHandle 目录句柄（Moni 目录）
 * @returns 账本文件元数据列表
 */
export const scanForLedgerFiles = async (
  dirHandle: StorageDirHandle
): Promise<LedgerMeta[]> => {
  const ledgers: LedgerMeta[] = [];

  if (isNativePlatform()) {
    const nativeDir = dirHandle as NativeDirHandle;
    try {
      const fs = FilesystemService.getInstance();
      const files = await fs.readdir({
        path: nativeDir.path || '',
        directory: AdapterDirectory.Documents
      });

      for (const file of files) {
        if (file.type === 'file' && file.name.endsWith('.moni.json')) {
          const name = file.name.replace('.moni.json', '');
          ledgers.push({
            name,
            fileName: file.name,
            createdAt: new Date(file.ctime || Date.now()).toISOString(),
            lastOpenedAt: name === 'default'
              ? new Date().toISOString()
              : '1970-01-01T00:00:00.000Z'
          });
        }
      }
    } catch (e) {
      console.error('Failed to scan ledger files (Native):', e);
    }
  } else {
    const webDir = dirHandle as FileSystemDirectoryHandle;
    for await (const entry of webDir.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.moni.json')) {
        const file = await (entry as FileSystemFileHandle).getFile();
        const name = file.name.replace('.moni.json', '');
        ledgers.push({
          name,
          fileName: file.name,
          createdAt: new Date(file.lastModified).toISOString(),
          lastOpenedAt: name === 'default'
            ? new Date().toISOString()
            : '1970-01-01T00:00:00.000Z'
        });
      }
    }
  }

  return ledgers;
};
