import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSessionEnd } from '../../src/hooks/sessionEnd.js';
function createExperience() {
    return {
        id: 'exp-1',
        sessionId: 'session-end-profile',
        indicators: {
            userCorrection: false,
            repeatMistakeSignal: false,
        },
        createdAt: '2026-03-15T00:00:00.000Z',
    };
}
test('sessionEnd triggers profile recompute after auto capture when userId exists', async () => {
    const calls = [];
    const result = await handleSessionEnd({
        sessionId: 'session-end-profile-1',
        scope: { userId: 'u-session-end-profile' },
    }, { log: () => createExperience() }, {}, {
        promoteFromReflection: () => undefined,
        freezeRulesByDuration: () => [],
        demoteStaleEmergingRules: () => 0,
    }, { store: () => ({ accepted: false, reason: 'noop', memory: null }) }, undefined, undefined, undefined, { recomputeForUser: (userId) => {
            calls.push(userId);
            return null;
        } });
    assert.deepEqual(calls, ['u-session-end-profile']);
    assert.equal(result.profileUpdated, true);
});
test('sessionEnd swallows profile recompute failures and keeps the main flow successful', async () => {
    const result = await handleSessionEnd({
        sessionId: 'session-end-profile-2',
        scope: { userId: 'u-session-end-profile' },
    }, { log: () => createExperience() }, {}, {
        promoteFromReflection: () => undefined,
        freezeRulesByDuration: () => [],
        demoteStaleEmergingRules: () => 0,
    }, { store: () => ({ accepted: false, reason: 'noop', memory: null }) }, { log: () => undefined }, undefined, undefined, { recomputeForUser: () => {
            throw new Error('projection failed');
        } });
    assert.equal(result.experience.id, 'exp-1');
    assert.equal(result.profileUpdated, false);
});
test('sessionEnd does not trigger profile recompute when userId is missing', async () => {
    let calls = 0;
    const result = await handleSessionEnd({
        sessionId: 'session-end-profile-3',
        scope: { project: 'evermemory' },
    }, { log: () => createExperience() }, {}, {
        promoteFromReflection: () => undefined,
        freezeRulesByDuration: () => [],
        demoteStaleEmergingRules: () => 0,
    }, { store: () => ({ accepted: false, reason: 'noop', memory: null }) }, undefined, undefined, undefined, { recomputeForUser: () => {
            calls += 1;
            return null;
        } });
    assert.equal(calls, 0);
    assert.equal(result.profileUpdated, false);
});
test('sessionEnd logs housekeeping timeout as debug telemetry and keeps teardown successful', async () => {
    const timeouts = [];
    const debugEvents = [];
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = ((handler, timeout, ...args) => {
        timeouts.push(Number(timeout));
        return originalSetTimeout(() => {
            if (typeof handler === 'function') {
                handler(...args);
            }
        }, 0);
    });
    try {
        const result = await handleSessionEnd({
            sessionId: 'session-end-profile-4',
            scope: { userId: 'u-session-end-profile', project: 'evermemory' },
        }, { log: () => createExperience() }, {}, {
            promoteFromReflection: () => undefined,
            freezeRulesByDuration: () => [],
            demoteStaleEmergingRules: () => 0,
        }, { store: () => ({ accepted: false, reason: 'noop', memory: null }) }, {
            log: (kind, entityId, payload) => {
                debugEvents.push({ kind, entityId, payload });
            },
        }, undefined, {
            count: () => 51,
            search: () => [{ timestamps: { updatedAt: '2026-03-15T00:00:00.000Z' } }],
        }, undefined, {
            runIfNeeded: () => new Promise(() => undefined),
        });
        assert.equal(result.sessionId, 'session-end-profile-4');
        assert.ok(timeouts.includes(8_000));
        assert.ok(debugEvents.some((event) => event.kind === 'housekeeping_error'
            && event.payload.reason === 'timeout'));
    }
    finally {
        global.setTimeout = originalSetTimeout;
    }
});
