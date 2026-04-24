import { type TransactionBase, type TransactionMeta } from './metadata';
export * from './metadata';
export * from './application';
export * from './budget';
export * from './bill-import';
export * from './ledger-preferences';

// 运行时交易数据结构
// 继承自 TransactionBase (JSON结构)，并添加运行时特有的 originalDate
// 同时包含可选的元数据字段，以便 UI 层直接使用 (Merge 后的结果)
export interface Transaction extends TransactionBase, Partial<TransactionMeta> {
  readonly originalDate: Date;   // [Runtime Only] 原始时间对象，用于UI组件和日期计算
}

export interface DayActivity {
  date: string; // YYYY-MM-DD
  totalExpense: number;
  count: number;
}
