export type AIStatus = 'IDLE' | 'ANALYZING' | 'ERROR';

export interface AIProgress {
  total: number;
  current: number;
  currentDate: string;
}

export interface ProcessingResult {
  success: boolean;
  processedCount: number;
  errors: string[];
}
