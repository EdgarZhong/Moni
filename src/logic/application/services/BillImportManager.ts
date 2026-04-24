import { LedgerManager } from './LedgerManager';
import { LedgerService } from './LedgerService';
import { parseFiles, probeImportFiles } from '@shared/utils/parser';
import type {
  BillImportExecutionResult,
  BillImportOptions,
  BillImportProbeResult,
  BillImportSource,
  Transaction,
} from '@shared/types';

/**
 * BillImportManager
 *
 * 职责：
 * 1. 向表现层暴露“先探测，后导入”的稳定后端接口
 * 2. 统一协调解析器与当前激活账本的写入链路
 * 3. 返回结构化导入结果，避免表现层自行统计来源、数量和目标账本
 */
export class BillImportManager {
  private static instance: BillImportManager;

  private readonly ledgerManager = LedgerManager.getInstance();
  private readonly ledgerService = LedgerService.getInstance();

  public static getInstance(): BillImportManager {
    if (!BillImportManager.instance) {
      BillImportManager.instance = new BillImportManager();
    }
    return BillImportManager.instance;
  }

  /**
   * 仅探测文件，不做任何账本写入。
   * 表现层应优先调用它，根据返回值决定是否继续弹密码输入、是否允许点击“开始导入”。
   */
  public async probeFiles(files: File[], options: BillImportOptions = {}): Promise<BillImportProbeResult> {
    return await probeImportFiles(files, options);
  }

  /**
   * 真正执行导入。
   * 这里默认写入当前激活账本，不允许表现层绕开账本上下文直接指定任意目标。
   */
  public async importFiles(
    files: File[],
    options: BillImportOptions = {},
  ): Promise<BillImportExecutionResult> {
    const parsedTransactions = await parseFiles(files, options);
    if (parsedTransactions.length === 0) {
      throw new Error('未识别到有效的账单记录，请检查文件内容');
    }

    await this.ledgerService.ingestRawData(parsedTransactions);

    return {
      ledgerName: this.ledgerManager.getActiveLedgerName(),
      importedCount: parsedTransactions.length,
      transactionIds: parsedTransactions.map((transaction) => transaction.id),
      files: (await probeImportFiles(files, options)).files,
      sourceBreakdown: this.buildSourceBreakdown(parsedTransactions),
    };
  }

  /**
   * 导入完成后统一统计来源分布，供调试报告和表现层成功提示直接复用。
   */
  private buildSourceBreakdown(transactions: Transaction[]): Record<BillImportSource, number> {
    const breakdown: Record<BillImportSource, number> = {
      wechat: 0,
      alipay: 0,
    };

    for (const transaction of transactions) {
      if (transaction.sourceType === 'wechat' || transaction.sourceType === 'alipay') {
        breakdown[transaction.sourceType] += 1;
      }
    }

    return breakdown;
  }
}
