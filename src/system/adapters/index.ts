/**
 * Adapter Module Exports
 *
 * 统一导出所有适配器相关的接口、类型和服务
 */

// ==================== 接口定义 ====================
export type {
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
  PermissionResult
} from './IFilesystemAdapter';

export {
  AdapterDirectory,
  AdapterEncoding
} from './IFilesystemAdapter';

export type {
  IHapticsAdapter
} from './IHapticsAdapter';

export {
  HapticImpactStyle,
  HapticNotificationType
} from './IHapticsAdapter';

// ==================== Capacitor 适配器 ====================
export { CapacitorFilesystemAdapter } from './CapacitorFilesystemAdapter';
export { CapacitorHapticsAdapter } from './CapacitorHapticsAdapter';

// ==================== 服务工厂 ====================
export { FilesystemService } from './FilesystemService';
export { HapticsService } from './HapticsService';
