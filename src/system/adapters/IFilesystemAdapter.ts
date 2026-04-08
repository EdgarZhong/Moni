/**
 * IFilesystemAdapter - 文件系统适配器接口
 *
 * 目的：抽象文件系统操作，支持多平台部署
 * - Capacitor (Mobile/Native)
 * - IndexedDB (Pure Web)
 * - Electron (Desktop)
 * - OPFS (Future)
 */

/**
 * 目录类型常量
 */
export const AdapterDirectory = {
  /** 用户文档目录 - 存储账本数据、记忆文件等用户可见数据 */
  Documents: 'DOCUMENTS',
  /** 应用数据目录 - 存储索引、队列、实例库等应用内部数据 */
  Data: 'DATA',
  /** 缓存目录 - 存储临时数据、日志等可清理数据 */
  Cache: 'CACHE'
} as const;

export type AdapterDirectory = typeof AdapterDirectory[keyof typeof AdapterDirectory];

/**
 * 编码类型常量
 */
export const AdapterEncoding = {
  UTF8: 'utf8',
  ASCII: 'ascii',
  UTF16: 'utf16'
} as const;

export type AdapterEncoding = typeof AdapterEncoding[keyof typeof AdapterEncoding];

/**
 * 读取文件选项
 */
export interface ReadFileOptions {
  /** 文件路径（相对于 directory） */
  path: string;
  /** 目录类型 */
  directory?: AdapterDirectory;
  /** 编码类型 */
  encoding?: AdapterEncoding;
}

/**
 * 写入文件选项
 */
export interface WriteFileOptions {
  /** 文件路径（相对于 directory） */
  path: string;
  /** 文件内容 */
  data: string;
  /** 目录类型 */
  directory?: AdapterDirectory;
  /** 编码类型 */
  encoding?: AdapterEncoding;
  /** 是否递归创建父目录 */
  recursive?: boolean;
}

/**
 * 追加文件选项
 */
export interface AppendFileOptions {
  /** 文件路径（相对于 directory） */
  path: string;
  /** 追加内容 */
  data: string;
  /** 目录类型 */
  directory?: AdapterDirectory;
  /** 编码类型 */
  encoding?: AdapterEncoding;
}

/**
 * 删除文件选项
 */
export interface DeleteFileOptions {
  /** 文件路径（相对于 directory） */
  path: string;
  /** 目录类型 */
  directory?: AdapterDirectory;
}

/**
 * 创建目录选项
 */
export interface MkdirOptions {
  /** 目录路径（相对于 directory） */
  path: string;
  /** 目录类型 */
  directory?: AdapterDirectory;
  /** 是否递归创建 */
  recursive?: boolean;
}

/**
 * 删除目录选项
 */
export interface RmdirOptions {
  /** 目录路径（相对于 directory） */
  path: string;
  /** 目录类型 */
  directory?: AdapterDirectory;
  /** 是否递归删除 */
  recursive?: boolean;
}

/**
 * 列出目录选项
 */
export interface ReaddirOptions {
  /** 目录路径（相对于 directory） */
  path: string;
  /** 目录类型 */
  directory?: AdapterDirectory;
}

/**
 * 获取文件信息选项
 */
export interface StatOptions {
  /** 文件/目录路径（相对于 directory） */
  path: string;
  /** 目录类型 */
  directory?: AdapterDirectory;
}

/**
 * 文件/目录信息
 */
export interface FileInfo {
  /** 文件/目录名称 */
  name: string;
  /** 类型 */
  type: 'file' | 'directory';
  /** 文件大小（字节），目录为 0 */
  size: number;
  /** 修改时间（Unix 时间戳，毫秒） */
  mtime: number;
  /** 创建时间（Unix 时间戳，毫秒） */
  ctime: number;
  /** URI（可选，某些平台提供） */
  uri?: string;
}

/**
 * 权限请求结果
 */
export interface PermissionResult {
  /** 公共存储权限状态 */
  publicStorage: 'granted' | 'denied' | 'prompt';
}

/**
 * 文件系统适配器接口
 *
 * 所有适配器必须实现此接口，确保行为一致性
 */
export interface IFilesystemAdapter {
  /**
   * 适配器名称（用于调试和日志）
   */
  readonly name: string;

  /**
   * 初始化适配器（可选）
   * 某些适配器需要异步初始化（如 IndexedDB）
   */
  init?(): Promise<void>;

  // ==================== 文件操作 ====================

  /**
   * 读取文件内容
   * @throws 文件不存在或读取失败时抛出异常
   */
  readFile(options: ReadFileOptions): Promise<string>;

  /**
   * 写入文件内容
   * @throws 写入失败时抛出异常
   */
  writeFile(options: WriteFileOptions): Promise<void>;

  /**
   * 追加文件内容
   * @throws 追加失败时抛出异常
   */
  appendFile(options: AppendFileOptions): Promise<void>;

  /**
   * 删除文件
   * @throws 文件不存在或删除失败时抛出异常
   */
  deleteFile(options: DeleteFileOptions): Promise<void>;

  // ==================== 目录操作 ====================

  /**
   * 创建目录
   * @throws 创建失败时抛出异常
   */
  mkdir(options: MkdirOptions): Promise<void>;

  /**
   * 删除目录
   * @throws 目录不存在或删除失败时抛出异常
   */
  rmdir(options: RmdirOptions): Promise<void>;

  /**
   * 列出目录内容
   * @throws 目录不存在或读取失败时抛出异常
   */
  readdir(options: ReaddirOptions): Promise<FileInfo[]>;

  // ==================== 文件信息 ====================

  /**
   * 获取文件/目录信息
   * @throws 文件/目录不存在时抛出异常
   */
  stat(options: StatOptions): Promise<FileInfo>;

  /**
   * 检查文件/目录是否存在
   * @returns 存在返回 true，不存在返回 false
   */
  exists(options: StatOptions): Promise<boolean>;

  // ==================== 权限管理 ====================

  /**
   * 请求文件系统权限（可选）
   * 某些平台（如 Capacitor）需要显式请求权限
   */
  requestPermissions?(): Promise<PermissionResult>;
}
