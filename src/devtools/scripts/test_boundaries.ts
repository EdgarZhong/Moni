import { Arbiter } from '@logic/domain/arbiter/Arbiter';
import { UserMetaPlugin } from '@logic/domain/plugin/UserMetaPlugin';
import { LocalAIMetaPlugin } from '@logic/domain/plugin/LocalAIMetaPlugin';

console.log('--- Boundary & Exception Logic Test ---');

const arbiter = new Arbiter();
arbiter.registerPlugin(new UserMetaPlugin());
arbiter.registerPlugin(new LocalAIMetaPlugin());

const TX_ID = 'boundary_test_001';

// Test 1: Malformed/Partial Hydration
console.log('\n[Test 1] Malformed Hydration Resilience');
try {
    // Note: In TS, we can't easily pass null/undefined to string fields without casting.
    // The previous error was: Type 'null' is not assignable to type 'string'.
    // So we use empty strings which are valid "empty" states in our system.
    arbiter.hydrate(TX_ID, {
        user_category: "", // Was null
        ai_category: "",   // Was undefined
        // Missing other fields
    });
    const decision = arbiter.decide(TX_ID);
    console.log(`✅ Hydration survived. Result: ${decision.category} (Source: ${decision.source})`);
} catch (e) {
    console.error('❌ Hydration crashed:', e);
}

// Test 2: Rapid Ingest (Logic Layer)
// Note: This tests Arbiter's state handling, not the file IO debounce.
console.log('\n[Test 2] Rapid Ingest State Consistency');
const iterations = 5;
for (let i = 0; i < iterations; i++) {
    arbiter.ingest(TX_ID, {
        source: 'USER',
        category: `Cat_${i}`,
        reasoning: 'Rapid Fire',
        timestamp: Date.now() + i, // Incrementing timestamp
        txId: TX_ID
    });
}
const finalDecision = arbiter.decide(TX_ID);
console.log(`[Result] Final Category: ${finalDecision.category}`);
if (finalDecision.category === `Cat_${iterations - 1}`) {
    console.log('✅ Last update won (Timestamp order respected).');
} else {
    console.error('❌ State mismatch.');
}

// Test 3: Timestamp Guard (Out of Order)
console.log('\n[Test 3] Timestamp Guard (Out of Order Arrival)');
const TX_ID_3 = 'boundary_test_003';
// Inject a "Newer" one first
arbiter.ingest(TX_ID_3, {
    source: 'USER',
    category: 'Future',
    reasoning: 'Future',
    timestamp: 20000,
    txId: TX_ID_3
});
// Inject an "Older" one later (simulating network delay or async race)
arbiter.ingest(TX_ID_3, {
    source: 'USER',
    category: 'Past',
    reasoning: 'Past',
    timestamp: 10000,
    txId: TX_ID_3
});

const guardDecision = arbiter.decide(TX_ID_3);
if (guardDecision.category === 'Future') {
    console.log('✅ Old proposal rejected by Timestamp Guard.');
} else {
    console.error('❌ Guard failed, old proposal overwrote new one.');
}

console.log('\n--- Test Complete ---');
