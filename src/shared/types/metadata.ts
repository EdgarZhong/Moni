export type CategoryType = 'meal' | 'others' | string;

export type SourceType = 'wechat' | 'alipay';

export const TransactionStatus = {
  SUCCESS: 'SUCCESS', // 支付成功, 交易成功, 对方已收钱
  REFUND: 'REFUND',   // 已全额退款, 已退款, 退款成功
  CLOSED: 'CLOSED',   // 交易关闭, 已取消
  PROCESSING: 'PROCESSING', // 处理中, 待确认
  OTHER: 'OTHER'      // 其他
} as const;

export type TransactionStatus = typeof TransactionStatus[keyof typeof TransactionStatus];

export const CategoryDict: Record<string, string> = {
  meal: 'MEAL',
  others: 'OTHERS',
};

// 基础交易数据结构 (JSON 友好，存储用)
export interface TransactionBase {
  readonly id: string;           // 唯一标识 (SHA-256)
  readonly originalId?: string;  // 原始交易单号 (微信/支付宝)
  readonly time: string;         // 交易时间 (YYYY-MM-DD HH:mm:ss)
  readonly sourceType: SourceType; // 来源
  readonly category: CategoryType; // 统一后的分类
  readonly rawClass: string;     // 原始CSV中的分类字符串
  readonly counterparty: string; // 交易对方
  readonly product: string;      // 商品名称
  readonly amount: number;       // 金额 (绝对值)
  readonly direction: 'in' | 'out'; // 收支方向
  readonly paymentMethod: string; // 支付方式
  readonly transactionStatus: TransactionStatus; // 交易状态
  readonly remark: string;       // 备注/商品说明
}

export interface TransactionMeta {
  // --- 智能层 (AI Layer) ---
  ai_category: CategoryType; // AI 建议分类 (为空则存为 "")
  ai_reasoning: string;      // AI 推理理由 (为空则存为 "")
  
  // --- 人工层 (User Layer - 优先级最高) ---
  user_category: CategoryType; // 用户手动分类 (为空则存为 "")
  user_note: string;         // 用户备注 (为空则存为 "")
  
  // --- 系统层 (System Layer) ---
  is_verified: boolean;       // 是否已确认 (确认后 AI 不再覆盖)
  updated_at: string;         // 最后更新时间 (YYYY-MM-DD HH:mm:ss)
}

// 完整的记录结构 = 基础数据 + 元数据
export interface FullTransactionRecord extends TransactionBase, TransactionMeta {}

import type { ProposalSource } from '@logic/domain/plugin/types';

export interface ArbitrationConfig {
  /**
   * 仲裁优先级列表，越靠前优先级越高
   * 默认: ['USER', 'RULE_ENGINE', 'AI_AGENT']
   */
  priority: ProposalSource[];
}

export interface LedgerMemory {
  version: string;            // e.g. "1.0"
  last_sync: string;          // Timestamp string
  /**
   * 支持的分类列表，格式为 { 标签名: 描述 }
   * 每个标签必须附带一句自然语言描述
   * 示例: { meal: "日常正餐支出", others: "所有非正餐支出" }
   */
  defined_categories: Record<string, string>;
  arbitration_config?: ArbitrationConfig; // 仲裁配置
  records: Record<string, FullTransactionRecord>; // ID -> Full Record
}
