/**
 * CapacitorFilesystemAdapter - Capacitor 文件系统适配器
 *
 * 包装 Capacitor Filesystem API，实现 IFilesystemAdapter 接口
 * 适用于：Android、iOS、Capacitor Web
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import type {
  IFilesystemAdapter,
  ReadFileOptions,
  WriteFileOptions,
  AppendFileOptions,
  DeleteFileOptions,
  MkdirOptions,
  RmdirOptions,
  ReaddirOptions,
  StatOptions,
  FileInfo,
  PermissionResult,
  AdapterDirectory,
  AdapterEncoding
} from './IFilesystemAdapter';

export class CapacitorFilesystemAdapter implements IFilesystemAdapter {
  readonly name = 'CapacitorFilesystem';

  /**
   * 映射适配器目录枚举到 Capacitor Directory 枚举
   */
  private mapDirectory(dir?: AdapterDirectory): Directory {
    /**
     * 当前工程已经统一把正式持久化收口到 Directory.Data。
     * 因此未显式传目录时，默认也落到 Data，避免浏览器 mock 再走回旧的 Documents 口径。
     */
    if (!dir) return Directory.Data;

    switch (dir) {
      case 'DOCUMENTS':
        return Directory.Documents;
      case 'DATA':
        return Directory.Data;
      case 'CACHE':
        return Directory.Cache;
      default:
        return Directory.Data;
    }
  }

  /**
   * 映射适配器编码枚举到 Capacitor Encoding 枚举
   */
  private mapEncoding(enc?: AdapterEncoding): Encoding {
    if (!enc) return Encoding.UTF8;

    switch (enc) {
      case 'utf8':
        return Encoding.UTF8;
      case 'ascii':
        return Encoding.ASCII;
      case 'utf16':
        return Encoding.UTF16;
      default:
        return Encoding.UTF8;
    }
  }

  /**
   * 映射 Capacitor FileInfo 到适配器 FileInfo
   */
  private mapFileInfo(file: {
    name: string;
    type: string;
    size: number;
    mtime: number;
    ctime?: number;
    uri?: string;
  }): FileInfo {
    return {
      name: file.name,
      type: file.type === 'directory' ? 'directory' : 'file',
      size: file.size,
      mtime: file.mtime,
      ctime: file.ctime ?? file.mtime,
      uri: file.uri
    };
  }

  // ==================== 文件操作 ====================

  async readFile(options: ReadFileOptions): Promise<string> {
    try {
      const payload: {
        path: string;
        directory: Directory;
        encoding?: Encoding;
      } = {
        path: options.path,
        directory: this.mapDirectory(options.directory)
      };
      if (options.encoding) {
        payload.encoding = this.mapEncoding(options.encoding);
      }
      const result = await Filesystem.readFile(payload);
      return result.data as string;
    } catch (e) {
      throw new Error(`[${this.name}] Failed to read file ${options.path}: ${e}`);
    }
  }

  async writeFile(options: WriteFileOptions): Promise<void> {
    try {
      await Filesystem.writeFile({
        path: options.path,
        data: options.data,
        directory: this.mapDirectory(options.directory),
        encoding: this.mapEncoding(options.encoding),
        recursive: options.recursive
      });
    } catch (e) {
      throw new Error(`[${this.name}] Failed to write file ${options.path}: ${e}`);
    }
  }

  async appendFile(options: AppendFileOptions): Promise<void> {
    try {
      await Filesystem.appendFile({
        path: options.path,
        data: options.data,
        directory: this.mapDirectory(options.directory),
        encoding: this.mapEncoding(options.encoding)
      });
    } catch (e) {
      throw new Error(`[${this.name}] Failed to append file ${options.path}: ${e}`);
    }
  }

  async deleteFile(options: DeleteFileOptions): Promise<void> {
    try {
      await Filesystem.deleteFile({
        path: options.path,
        directory: this.mapDirectory(options.directory)
      });
    } catch (e) {
      throw new Error(`[${this.name}] Failed to delete file ${options.path}: ${e}`);
    }
  }

  // ==================== 目录操作 ====================

  async mkdir(options: MkdirOptions): Promise<void> {
    try {
      await Filesystem.mkdir({
        path: options.path,
        directory: this.mapDirectory(options.directory),
        recursive: options.recursive
      });
    } catch (e) {
      // Capacitor 在目录已存在时会抛出异常，这里忽略
      if (e && typeof e === 'object' && 'message' in e) {
        const message = (e as { message: string }).message;
        if (message.includes('exists') || message.includes('already')) {
          return; // 目录已存在，忽略错误
        }
      }
      throw new Error(`[${this.name}] Failed to create directory ${options.path}: ${e}`);
    }
  }

  async rmdir(options: RmdirOptions): Promise<void> {
    try {
      await Filesystem.rmdir({
        path: options.path,
        directory: this.mapDirectory(options.directory),
        recursive: options.recursive
      });
    } catch (e) {
      throw new Error(`[${this.name}] Failed to remove directory ${options.path}: ${e}`);
    }
  }

  async readdir(options: ReaddirOptions): Promise<FileInfo[]> {
    try {
      const result = await Filesystem.readdir({
        path: options.path,
        directory: this.mapDirectory(options.directory)
      });
      return result.files.map(f => this.mapFileInfo(f));
    } catch (e) {
      throw new Error(`[${this.name}] Failed to read directory ${options.path}: ${e}`);
    }
  }

  // ==================== 文件信息 ====================

  async stat(options: StatOptions): Promise<FileInfo> {
    try {
      const result = await Filesystem.stat({
        path: options.path,
        directory: this.mapDirectory(options.directory)
      });
      return this.mapFileInfo(result);
    } catch (e) {
      throw new Error(`[${this.name}] Failed to stat ${options.path}: ${e}`);
    }
  }

  async exists(options: StatOptions): Promise<boolean> {
    try {
      await Filesystem.stat({
        path: options.path,
        directory: this.mapDirectory(options.directory)
      });
      return true;
    } catch {
      return false;
    }
  }

  // ==================== 权限管理 ====================

  async requestPermissions(): Promise<PermissionResult> {
    try {
      const result = await Filesystem.requestPermissions();
      return {
        publicStorage: result.publicStorage as 'granted' | 'denied' | 'prompt'
      };
    } catch (e) {
      console.warn(`[${this.name}] Failed to request permissions:`, e);
      return { publicStorage: 'denied' };
    }
  }
}
