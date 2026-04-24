/**
 * 账单导入来源平台。
 * 当前只支持微信与支付宝两条解析链路。
 */
export type BillImportSource = 'wechat' | 'alipay';

/**
 * 用户实际选择文件后，后端识别出来的输入形态。
 * - `csv`：可直接按文本账单解析
 * - `excel`：需要先转成 CSV 再解析
 * - `archive`：压缩包，可能需要密码
 * - `unknown`：当前无法识别
 */
export type BillImportInputKind = 'csv' | 'excel' | 'archive' | 'unknown';

/**
 * 文件探测阶段的总状态。
 * - `ready`：已经确认可直接进入导入
 * - `password_required`：文件可识别，但需要补充或修正密码
 * - `unsupported`：当前无法识别或无法解析
 */
export type BillImportProbeStatus = 'ready' | 'password_required' | 'unsupported';

/**
 * 当探测结果要求密码时，继续区分是“没填密码”还是“密码错误”。
 * 这样表现层就能决定展示普通密码输入还是错误提示。
 */
export type BillImportPasswordState = 'missing' | 'invalid';

/**
 * 单个文件在探测阶段的结构化摘要。
 * 这部分数据会回传给表现层和调试工具，用于解释“为什么能导入 / 为什么要密码 / 为什么不支持”。
 */
export interface BillImportFileSummary {
  readonly originalName: string;
  readonly detectedKind: BillImportInputKind;
  readonly normalizedName?: string;
  readonly requiresPassword?: boolean;
  readonly extractedEntries?: string[];
}

/**
 * 表现层传给后端的账单导入选项。
 * 当前只收口两件事：
 * - `expectedSource`：用户在 UI 中明确选择的平台
 * - `password`：若文件探测结果要求密码，由表现层再补回
 */
export interface BillImportOptions {
  readonly expectedSource?: BillImportSource;
  readonly password?: string;
}

/**
 * “先探测，后决定 UI 行为”阶段返回给表现层的结果。
 * 重点不是直接导入，而是回答三个问题：
 * 1. 现在能不能导入
 * 2. 是否需要密码
 * 3. 后端已经识别到哪些可用文件
 */
export interface BillImportProbeResult {
  readonly status: BillImportProbeStatus;
  readonly message: string;
  readonly files: BillImportFileSummary[];
  readonly expectedSource?: BillImportSource;
  readonly passwordState?: BillImportPasswordState;
  readonly transactionCount?: number;
  readonly sourceBreakdown?: Record<BillImportSource, number>;
}

/**
 * 真正执行导入后返回的结果。
 * 这部分数据供表现层做成功提示、供调试工具做自动断言。
 */
export interface BillImportExecutionResult {
  readonly ledgerName: string | null;
  readonly importedCount: number;
  readonly transactionIds: string[];
  readonly files: BillImportFileSummary[];
  readonly sourceBreakdown: Record<BillImportSource, number>;
}
