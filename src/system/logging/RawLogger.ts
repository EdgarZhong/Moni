import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterDirectory, AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
import { format } from 'date-fns';

export interface LogEntry {
  timestamp: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: any;
  duration_ms: number;
  status: 'SUCCESS' | 'ERROR';
  error?: string;
}

const LOG_DIR = 'llm_logs';
const MAX_LOG_FILES = 300;

export class RawLogger {
  /**
   * 适配 LLMClient 的实例方法
   */
  public async logInteraction(
    messages: unknown[],
    response: unknown,
    duration: number,
    model: string
  ) {
    const batchId = `LLM_${Date.now()}`;
    await RawLogger.log(batchId, {
      request: { model, messages },
      response,
      duration_ms: duration,
      status: 'SUCCESS'
    });
  }

  /**
   * 记录一次完整的 LLM 交互
   * @param batchId 批次ID (通常是 hash 或 uuid)
   * @param entry 日志内容
   */
  public static async log(batchId: string, entry: Omit<LogEntry, 'timestamp'>) {
    const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
    const fileName = `${timestamp}_${batchId}.json`;
    const fullEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      ...entry
    };

    const content = JSON.stringify(fullEntry, null, 2);

    try {
      const fs = FilesystemService.getInstance();
      // 确保目录存在
      try {
        await fs.mkdir({
          path: LOG_DIR,
          directory: AdapterDirectory.Data,
          recursive: true
        });
      } catch {
        // 目录已存在时忽略
      }

      await fs.writeFile({
        path: `${LOG_DIR}/${fileName}`,
        data: content,
        directory: AdapterDirectory.Data,
        encoding: AdapterEncoding.UTF8
      });

      // 触发轮替清理 (Fire and Forget)
      this.rotateLogs().catch(e => console.error('[RawLogger] Rotate failed:', e));

    } catch (e) {
      console.error('[RawLogger] Failed to write log:', e);
    }
  }

  /**
   * 日志轮替：保留最新的 N 个文件
   */
  private static async rotateLogs() {
    try {
      const fs = FilesystemService.getInstance();
      const files = await fs.readdir({
        path: LOG_DIR,
        directory: AdapterDirectory.Data
      });

      if (files.length <= MAX_LOG_FILES) return;

      // 按文件名升序排列（文件名包含时间戳，升序即时间从旧到新）
      // 格式：yyyyMMdd_HHmmss_BATCHID.json
      files.sort((a, b) => a.name.localeCompare(b.name));

      const deleteCount = files.length - MAX_LOG_FILES;
      const toDelete = files.slice(0, deleteCount);

      console.log(`[RawLogger] Rotating logs: deleting ${deleteCount} old files.`);

      for (const file of toDelete) {
        await fs.deleteFile({
          path: `${LOG_DIR}/${file.name}`,
          directory: AdapterDirectory.Data
        });
      }

    } catch (e) {
      console.error('[RawLogger] Rotation error:', e);
    }
  }
}
