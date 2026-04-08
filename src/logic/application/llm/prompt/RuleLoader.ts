import { FilesystemService } from '@system/adapters/FilesystemService';
import { AdapterDirectory, AdapterEncoding } from '@system/adapters/IFilesystemAdapter';
import { DEFAULT_LEDGER_NAME } from '@system/filesystem/fs-storage';

export class RuleLoader {
  private static readonly BASE_PATH = 'Moni/classify_rules';

  /**
   * 加载指定账本的分类规则
   * @param ledgerName 账本名称
   * @returns Markdown 格式的规则字符串
   */
  public static async load(ledgerName: string = DEFAULT_LEDGER_NAME): Promise<string> {
    const fileName = `${ledgerName}.md`;
    const fullPath = `${this.BASE_PATH}/${fileName}`;

    try {
      // 尝试读取规则文件
      const fs = FilesystemService.getInstance();
      return await fs.readFile({
        path: fullPath,
        directory: AdapterDirectory.Documents,
        encoding: AdapterEncoding.UTF8
      });
    } catch {
      console.warn(`[RuleLoader] Rules not found for ${ledgerName}, using empty rules.`);
      // 如果文件不存在，返回空字符串，或者可以返回默认的内置规则
      return '';
    }
  }

  /**
   * 保存/更新分类规则
   */
  public static async save(ledgerName: string, content: string): Promise<void> {
    const fileName = `${ledgerName}.md`;
    const fullPath = `${this.BASE_PATH}/${fileName}`;

    try {
      const fs = FilesystemService.getInstance();
      await fs.writeFile({
        path: fullPath,
        data: content,
        directory: AdapterDirectory.Documents,
        encoding: AdapterEncoding.UTF8,
        recursive: true // 确保目录存在
      });
    } catch (e) {
      console.error(`[RuleLoader] Failed to save rules for ${ledgerName}:`, e);
      throw e;
    }
  }
}
