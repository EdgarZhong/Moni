
import { LedgerService } from '@logic/application/services/LedgerService';
import { LedgerManager } from '@logic/application/services/LedgerManager';
import { AIEnginePlugin } from '@logic/application/plugins/AIEnginePlugin';
import { _setNativePlatform } from '@system/filesystem/fs-storage';
import { ConfigManager } from '@system/config/ConfigManager';

/**
 * Browser-side End-to-End Test Runner
 * 
 * Usage from DevTools Console:
 * await import('/src/debug/e2e_runner.ts').then(m => m.runE2ETest())
 */
export async function runE2ETest() {
    console.clear();
    console.log('%c🚀 Starting E2E AI Analysis Test (Browser Runtime)', 'color: #00ff00; font-size: 14px; font-weight: bold;');
    
    try {
        // 1. Force Native Platform Mode
        // This ensures LedgerService uses getAutoDirectoryHandle() which maps to DOCUMENTS
        _setNativePlatform(true);
        console.log('[Test] Forced Native Platform Mode');

        // 2. Initialize Config
        const configManager = ConfigManager.getInstance();
        await configManager.init();
        const llmConfig = await configManager.getActiveModelConfig();
        if (!llmConfig.apiKey) {
            throw new Error('API Key missing in secure_config.bin');
        }
        console.log(`[Test] Config Loaded. Model: ${llmConfig.model}`);

        // 3. Initialize Ledger Service (Real Boot)
        console.log('[Test] Initializing LedgerService...');
        const ledgerService = LedgerService.getInstance();
        
        await LedgerManager.getInstance().init();

        const state = ledgerService.getState();
        console.log(`[Test] Ledger Initialized. Transactions: ${state.rawTransactions.length}`);
        
        if (state.rawTransactions.length === 0) {
            console.warn('[Test] ⚠️ Warning: No transactions loaded. Is default.moni.json present in virtual_android_filesys/Documents_path/Moni/?');
        }

        // 4. Trigger AI Engine
        console.log('[Test] Starting AI Analysis (Batch Mode)...');
        const aiPlugin = new AIEnginePlugin();
        
        // Hook into progress to stop after 1 day
        const unsubscribe = aiPlugin.subscribeToProgress((status, progress) => {
            if (status === 'ANALYZING') {
                console.log(`[AI Progress] ${progress.current}/${progress.total} days processed`);
                
                // Stop after the first day is done (current > 0)
                // Actually, progress.current increments AFTER processing a day.
                // So when current becomes 1, one day is done.
                if (progress.current >= 1) {
                    console.log('[Test] 🛑 Stopping after 1 day as requested.');
                    // We need to access the processor singleton to stop it
                    // But AIEnginePlugin doesn't expose stop().
                    // We can just let it finish the current day (it checks shouldStop before next day).
                    // However, we need to import BatchProcessor to call stop()
                    import('@logic/application/ai/BatchProcessor').then(({ BatchProcessor }) => {
                        BatchProcessor.getInstance().stop();
                    });
                }
            }
        });

        const result = await aiPlugin.runBatchAnalysis();
        unsubscribe();

        console.log('[Test] Analysis Complete.');
        console.log('📊 Result:', result);

        // 5. Verify Persistence
        // Since we are in browser, we can't "read disk" synchronously to verify.
        // But we can check the LedgerService state, which should have updated.
        const newState = ledgerService.getState();
        const updatedCount = newState.computedTransactions.filter(t => t.ai_category).length;
        console.log(`[Test] In-Memory Verification: ${updatedCount} transactions have AI category.`);
        
        console.log('%c✅ Test Execution Finished. Check virtual_android_filesys for file updates.', 'color: #00ff00; font-weight: bold;');

    } catch (e) {
        console.error('❌ Test Failed:', e);
    }
}
