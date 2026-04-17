export type AIStatus = 'IDLE' | 'ANALYZING' | 'ERROR';

export interface AIProgress {
  total: number;
  current: number;
  /**
   * 当前批次里排在最前面的日期。
   * 这个字段继续保留，兼容现有调用方和日志口径。
   */
  currentDate: string;
  /**
   * 当前 AI 引擎正在处理的完整日期批次。
   * 之所以单独补这个字段，是因为消费端已经从“单天”扩成“最多 3 天一批”，
   * 显示层不能再只依赖 currentDate 猜测当前高亮范围。
   */
  currentDates: string[];
}

export interface ProcessingResult {
  success: boolean;
  processedCount: number;
  errors: string[];
}
