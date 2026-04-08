import type { TransactionBase } from '@shared/types/metadata';
import type { ICategoryPlugin, Proposal, ProposalSource } from './types';

/**
 * 分类插件抽象基类
 * 所有具体的分类插件（正则、AI等）都应继承此类
 */
export abstract class CategoryPlugin implements ICategoryPlugin {
  abstract name: string;
  abstract version: string;

  /**
   * 必须由子类实现的核心分析逻辑
   */
  abstract analyze(transaction: TransactionBase): Promise<Proposal | null>;

  /**
   * 辅助方法：快速构建标准化的 Proposal 对象
   * @param source 来源
   * @param category 建议分类
   * @param reasoning 理由
   */
  protected createProposal(
    source: ProposalSource,
    category: string,
    reasoning?: string
  ): Proposal {
    return {
      source,
      category,
      reasoning: reasoning || '',
      timestamp: Date.now(),
    };
  }
}
