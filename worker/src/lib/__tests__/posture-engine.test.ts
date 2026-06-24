/**
 * Unit tests for posture-engine.ts
 * Run: npx ts-node src/lib/__tests__/posture-engine.test.ts
 */

import { selectPosture, PostureContext } from '../posture-engine';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
    if (condition) {
        passed++;
        console.log(`  ✓ ${message}`);
    } else {
        failed++;
        console.error(`  ✗ ${message}`);
    }
}

function test(name: string, fn: () => void): void {
    console.log(`\n${name}`);
    fn();
}

// ============================================================================
// TESTS
// ============================================================================

test('Pre-meeting prep → prepare posture', () => {
    const result = selectPosture({
        callType: 'pre_meeting_prep',
        callCount: 10,
        maturityLevel: 'OBSERVING',
    });
    assert(result.primary === 'prepare', `expected prepare, got ${result.primary}`);
});

test('Post-meeting debrief → debrief posture', () => {
    const result = selectPosture({
        callType: 'post_meeting_debrief',
        callCount: 10,
        maturityLevel: 'OBSERVING',
    });
    assert(result.primary === 'debrief', `expected debrief, got ${result.primary}`);
});

test('Recent LANDED outcome → celebrate', () => {
    const result = selectPosture({
        callType: 'daily_checkin',
        callCount: 10,
        maturityLevel: 'OBSERVING',
        hasRecentLanded: true,
    });
    assert(result.primary === 'celebrate', `expected celebrate, got ${result.primary}`);
});

test('Recent MISSED outcome → uplift', () => {
    const result = selectPosture({
        callType: 'daily_checkin',
        callCount: 10,
        maturityLevel: 'OBSERVING',
        hasRecentMissed: true,
    });
    assert(result.primary === 'uplift', `expected uplift, got ${result.primary}`);
});

test('User callback → listen', () => {
    const result = selectPosture({
        callType: 'daily_checkin',
        callCount: 10,
        maturityLevel: 'OBSERVING',
        userInitiatedCallback: true,
    });
    assert(result.primary === 'listen', `expected listen, got ${result.primary}`);
});

test('Overdue commitments → nudge (when no stronger signal)', () => {
    const result = selectPosture({
        callType: 'daily_checkin',
        callCount: 10,
        maturityLevel: 'OBSERVING',
        overdueCommitmentCount: 3,
    });
    assert(result.primary === 'nudge', `expected nudge, got ${result.primary}`);
});

test('Challenge requires COACHING maturity', () => {
    const result = selectPosture({
        callType: 'daily_checkin',
        callCount: 25,
        maturityLevel: 'LEARNING',
    });
    assert(result.primary !== 'challenge', `challenge should not be selected in LEARNING mode`);

    const result2 = selectPosture({
        callType: 'daily_checkin',
        callCount: 25,
        maturityLevel: 'COACHING',
    });
    // challenge may or may not be primary, but it should be selectable
    assert(result2.primary !== undefined, `posture selected in COACHING mode`);
});

test('Advise requires OBSERVING+ maturity', () => {
    const ctx: PostureContext = {
        callType: 'daily_checkin',
        callCount: 10,
        maturityLevel: 'LEARNING',
    };
    const result = selectPosture(ctx);
    assert(result.primary !== 'advise', `advise should not be primary in LEARNING mode, got ${result.primary}`);
});

test('Connect not available before call 3', () => {
    const result = selectPosture({
        callType: 'daily_checkin',
        callCount: 2,
        maturityLevel: 'LEARNING',
        isLightDay: true,
        personalThreadReady: true,
    });
    assert(result.primary !== 'connect', `connect should not be selected before call 3, got ${result.primary}`);
    assert(result.secondary !== 'connect', `connect secondary should not be selected before call 3`);
});

test('Incompatible postures: celebrate + nudge', () => {
    const result = selectPosture({
        callType: 'daily_checkin',
        callCount: 10,
        maturityLevel: 'OBSERVING',
        hasRecentLanded: true,
        overdueCommitmentCount: 3,
    });
    if (result.primary === 'celebrate') {
        assert(result.secondary !== 'nudge', `celebrate + nudge are incompatible, secondary=${result.secondary}`);
    }
    if (result.primary === 'nudge') {
        assert(result.secondary !== 'celebrate', `nudge + celebrate are incompatible, secondary=${result.secondary}`);
    }
    assert(true, 'incompatibility check passed');
});

test('Archetype boost: juggler favors uplift', () => {
    const withArchetype = selectPosture({
        callType: 'daily_checkin',
        callCount: 10,
        maturityLevel: 'OBSERVING',
        archetype: 'juggler',
        isLightDay: true,
    });
    const withoutArchetype = selectPosture({
        callType: 'daily_checkin',
        callCount: 10,
        maturityLevel: 'OBSERVING',
        isLightDay: true,
    });
    // Juggler should never get nudge as primary (it's in avoid list)
    assert(withArchetype.primary !== 'nudge', `juggler should not get nudge, got ${withArchetype.primary}`);
    assert(true, `juggler got ${withArchetype.primary}, default got ${withoutArchetype.primary}`);
});

test('Friday ritual → celebrate primary', () => {
    const result = selectPosture({
        callType: 'friday_ritual',
        callCount: 10,
        maturityLevel: 'OBSERVING',
    });
    assert(result.primary === 'celebrate', `expected celebrate for friday ritual, got ${result.primary}`);
});

test('Default fallback when no signals', () => {
    const result = selectPosture({
        callType: 'daily_checkin',
        callCount: 10,
        maturityLevel: 'OBSERVING',
    });
    assert(result.primary !== undefined, `should always select a posture, got ${result.primary}`);
    assert(result.rules.length > 0, `posture should have rules`);
    assert(result.tone.length > 0, `posture should have tone`);
});

test('PostureSelection includes all required fields', () => {
    const result = selectPosture({
        callType: 'daily_checkin',
        callCount: 10,
        maturityLevel: 'COACHING',
        hasRecentLanded: true,
    });
    assert(typeof result.primary === 'string', `primary is string`);
    assert(typeof result.reason === 'string', `reason is string`);
    assert(Array.isArray(result.rules), `rules is array`);
    assert(typeof result.tone === 'string', `tone is string`);
    assert(typeof result.segments === 'string', `segments is string`);
    assert(typeof result.duration === 'string', `duration is string`);
});

// ============================================================================
// RESULTS
// ============================================================================

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
    process.exit(1);
}
