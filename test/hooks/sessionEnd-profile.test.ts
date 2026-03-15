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
  const calls: string[] = [];

  const result = await handleSessionEnd(
    {
      sessionId: 'session-end-profile-1',
      scope: { userId: 'u-session-end-profile' },
    },
    { log: () => createExperience() } as never,
    {} as never,
    {} as never,
    { store: () => ({ accepted: false, reason: 'noop', memory: null }) } as never,
    undefined,
    undefined,
    undefined,
    { recomputeForUser: (userId: string) => {
      calls.push(userId);
      return null;
    } } as never,
  );

  assert.deepEqual(calls, ['u-session-end-profile']);
  assert.equal(result.profileUpdated, true);
});

test('sessionEnd swallows profile recompute failures and keeps the main flow successful', async () => {
  const result = await handleSessionEnd(
    {
      sessionId: 'session-end-profile-2',
      scope: { userId: 'u-session-end-profile' },
    },
    { log: () => createExperience() } as never,
    {} as never,
    {} as never,
    { store: () => ({ accepted: false, reason: 'noop', memory: null }) } as never,
    { log: () => undefined } as never,
    undefined,
    undefined,
    { recomputeForUser: () => {
      throw new Error('projection failed');
    } } as never,
  );

  assert.equal(result.experience.id, 'exp-1');
  assert.equal(result.profileUpdated, false);
});

test('sessionEnd does not trigger profile recompute when userId is missing', async () => {
  let calls = 0;

  const result = await handleSessionEnd(
    {
      sessionId: 'session-end-profile-3',
      scope: { project: 'evermemory' },
    },
    { log: () => createExperience() } as never,
    {} as never,
    {} as never,
    { store: () => ({ accepted: false, reason: 'noop', memory: null }) } as never,
    undefined,
    undefined,
    undefined,
    { recomputeForUser: () => {
      calls += 1;
      return null;
    } } as never,
  );

  assert.equal(calls, 0);
  assert.equal(result.profileUpdated, false);
});
