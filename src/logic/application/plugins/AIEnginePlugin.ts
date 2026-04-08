import { CategoryPlugin } from '@logic/domain/plugin/CategoryPlugin';
import { BatchProcessor } from '../ai/BatchProcessor';
import { globalArbiter } from '@logic/domain/arbiter/Arbiter';
import type { Proposal } from '@logic/domain/plugin/types';
import type { TransactionBase } from '@shared/types/metadata';
import type { AIProgress, AIStatus } from '../ai/types';

/**
 * AI Engine Plugin
 * Serves as the bridge between the BatchProcessor (Engine) and the Arbiter (System).
 * - Initializes the engine
 * - Routes engine results (Proposals) to Arbiter.ingest()
 */
export class AIEnginePlugin extends CategoryPlugin {
  name = 'AIEnginePlugin';
  version = '1.0.0';

  constructor() {
    super();
    this.initializeEngine();
  }

  private initializeEngine() {
    const processor = BatchProcessor.getInstance();
    // Register the handler to capture results from the engine
    processor.setProposalHandler((txId, proposal) => {
      // Feed into the Arbitration System
      globalArbiter.ingest(txId, proposal);
    });
  }

  /**
   * Public method to trigger the batch analysis process.
   * Can be called from the UI or a Scheduler.
   */
  public async runBatchAnalysis() {
    const processor = BatchProcessor.getInstance();
    return await processor.run();
  }

  /**
   * Subscribe to progress updates
   */
  public subscribeToProgress(callback: (status: AIStatus, progress: AIProgress) => void) {
    const processor = BatchProcessor.getInstance();
    return processor.subscribe(callback);
  }

  /**
   * Implementation of CategoryPlugin.analyze
   * Currently returns null as this plugin operates primarily in Batch mode via `runBatchAnalysis`.
   * Real-time single-transaction analysis can be implemented here later.
   */
  async analyze(_transaction: TransactionBase): Promise<Proposal | null> {
    void _transaction;
    return null;
  }
}
