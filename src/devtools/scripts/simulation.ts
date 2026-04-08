import { Arbiter } from '@logic/domain/arbiter/Arbiter';
import { UserMetaPlugin } from '@logic/domain/plugin/UserMetaPlugin';
import { LocalAIMetaPlugin } from '@logic/domain/plugin/LocalAIMetaPlugin';
import type { Transaction } from '@shared/types';

// Mock Data
const MOCK_TX: Transaction = {
    id: 'test_tx_001',
    amount: 100,
    sourceType: 'wechat',
    counterparty: 'McDonalds',
    time: '2023-10-01 12:00:00',
    originalDate: new Date('2023-10-01T12:00:00'),
    direction: 'out',
    category: 'others',
    remark: 'Lunch',
    rawClass: 'General',
    product: 'Big Mac',
    paymentMethod: 'Wallet',
    transactionStatus: 'SUCCESS'
};

async function runSimulation() {
    console.log('--- Starting Consistency Simulation ---');

    // 1. Init System
    const arbiter = new Arbiter();
    arbiter.registerPlugin(new UserMetaPlugin());
    arbiter.registerPlugin(new LocalAIMetaPlugin());
    console.log('[Init] Arbiter initialized with User & LocalAI plugins.');

    // 2. Hydrate (Cold Start)
    // Simulate existing file state: "uncategorized"
    arbiter.hydrate(MOCK_TX.id, {
        user_category: "",
        user_note: "",
        ai_category: "",
        ai_reasoning: "",
        is_verified: false,
        updated_at: ""
    });
    console.log('[Step 1] Hydrated with empty state.');

    // 3. AI Injection (Low Priority)
    console.log('[Step 2] Injecting AI Proposal: "Food"');
    arbiter.ingest(MOCK_TX.id, {
        source: 'AI_AGENT',
        category: 'Food',
        reasoning: 'Merchant is McDonalds',
        timestamp: Date.now(),
        txId: MOCK_TX.id
    });

    // DEBUG STATE
    const debugCache = (arbiter as unknown as { proposalCache: Record<string, unknown> }).proposalCache;
    console.log('[DEBUG State]', JSON.stringify(debugCache[MOCK_TX.id], null, 2));

    let decision = arbiter.decide(MOCK_TX.id);
    console.log(`[Result 2] Category: '${decision.category}' (Expected: 'Food')`);

    if (decision.category !== 'Food') {
         console.error('❌ Step 2 Failed');
    }

    // 4. User Injection (High Priority)
    console.log('[Step 3] Injecting User Proposal: "Health" (Override)');
    arbiter.ingest(MOCK_TX.id, {
        source: 'USER',
        category: 'Health',
        reasoning: 'Salad only',
        timestamp: Date.now() + 100,
        txId: MOCK_TX.id
    });

    decision = arbiter.decide(MOCK_TX.id);
    console.log(`[Result 3] Category: '${decision.category}' (Expected: 'Health')`);

    if (decision.category !== 'Health') {
        console.error('❌ Step 3 Failed');
    }

    // 5. AI Update (Should be ignored if User present? Or depends on logic)
    // Current Logic: User > AI. So AI update shouldn't override User.
    console.log('[Step 4] Injecting Newer AI Proposal: "Entertainment"');
    arbiter.ingest(MOCK_TX.id, {
        source: 'AI_AGENT',
        category: 'Entertainment',
        reasoning: 'Mistake',
        timestamp: Date.now() + 200,
        txId: MOCK_TX.id
    });

    decision = arbiter.decide(MOCK_TX.id);
    console.log(`[Result 4] Category: '${decision.category}' (Expected: 'Health')`);
    
    if (decision.category === 'Health') {
        console.log('✅ TEST PASSED: User priority maintained.');
    } else {
        console.error('❌ TEST FAILED: User priority violated. Got: ' + decision.category);
    }
}

runSimulation().catch(console.error);
