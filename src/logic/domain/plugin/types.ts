import type { TransactionBase } from '@shared/types/metadata';

export type ProposalSource = 'USER' | 'RULE_ENGINE' | 'AI_AGENT';

export interface Proposal {
  /**
   * 提案来源：
   * - USER: 用户手动指定（最高优先级）
   * - RULE_ENGINE: 规则引擎匹配（中等优先级）
   * - AI_AGENT: LLM 模型推理（最低优先级）
   */
  source: ProposalSource;
  
  /**
   * 建议的分类名称
   */
  category: string;
  
  /**
   * 推理理由（用于 AI 解释或 User Note）
   * - 必填，无内容则为空字符串
   */
  reasoning: string;
  
  /**
   * 关联的交易ID (用于反向索引)
   */
  txId?: string;

  /**
   * 提案生成时间戳
   */
  timestamp: number;
}

export interface ICategoryPlugin {
  /**
   * 插件唯一标识名
   */
  name: string;
  
  /**
   * 插件版本
   */
  version: string;
  
  /**
   * 核心分析函数
   * @param transaction 原始交易数据
   * @returns 分类提案或 null (如果无法分类)
   */
  analyze(transaction: TransactionBase): Promise<Proposal | null>;
}
