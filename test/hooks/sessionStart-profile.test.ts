import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSessionStart } from '../../src/hooks/sessionStart.js';
import { clearSessionContext, getSessionContext } from '../../src/runtime/context.js';
import type { ProjectedProfile } from '../../src/types.js';

function createBriefing() {
  return {
    id: 'briefing-1',
    sections: {
      identity: [],
      constraints: [],
      recentContinuity: [],
      activeProjects: [],
    },
    tokenTarget: 1200,
    actualApproxTokens: 0,
  };
}

function createProfile(): ProjectedProfile {
  return {
    userId: 'u-session-start-profile',
    updatedAt: '2026-03-15T00:00:00.000Z',
    stable: {
      displayName: {
        value: 'Alex',
        source: 'stable_explicit',
        canonical: true,
        evidenceRefs: ['m-1'],
      },
      explicitPreferences: {
        language: {
          value: 'zh',
          source: 'stable_explicit',
          canonical: true,
          evidenceRefs: ['m-2'],
        },
        timezone: {
          value: 'UTC+08:00',
          source: 'stable_explicit',
          canonical: true,
          evidenceRefs: ['m-3'],
        },
      },
      explicitConstraints: [],
    },
    derived: {
      communicationStyle: {
        tendency: 'concise_direct',
        confidence: 0.8,
        evidenceRefs: ['m-4'],
        source: 'derived_inference',
        guardrail: 'weak_hint',
        canonical: false,
      },
      likelyInterests: [
        {
          value: 'typescript',
          confidence: 0.9,
          evidenceRefs: ['m-5'],
          source: 'derived_inference',
          guardrail: 'weak_hint',
          canonical: false,
        },
      ],
      workPatterns: [
        {
          value: 'stepwise_planning',
          confidence: 0.7,
          evidenceRefs: ['m-6'],
          source: 'derived_inference',
          guardrail: 'weak_hint',
          canonical: false,
        },
      ],
    },
    behaviorHints: [],
  };
}

test('sessionStart injects userProfile into result and runtime context when profileRepo is available', () => {
  const result = handleSessionStart(
    {
      sessionId: 'session-start-profile-1',
      userId: 'u-session-start-profile',
    },
    { build: () => createBriefing() } as never,
    { getActiveRules: () => [] } as never,
    undefined,
    { getByUserId: () => createProfile() } as never,
  );

  assert.deepEqual(result.userProfile, {
    communicationStyle: 'concise_direct',
    likelyInterests: ['typescript'],
    workPatterns: ['stepwise_planning'],
    explicitPreferences: {
      language: 'zh',
      timezone: 'UTC+08:00',
    },
    displayName: 'Alex',
  });
  assert.deepEqual(getSessionContext('session-start-profile-1')?.userProfile, result.userProfile);

  clearSessionContext('session-start-profile-1');
});

test('sessionStart remains backward compatible when profileRepo is omitted', () => {
  const result = handleSessionStart(
    {
      sessionId: 'session-start-profile-2',
      userId: 'u-session-start-profile',
    },
    { build: () => createBriefing() } as never,
    { getActiveRules: () => [] } as never,
  );

  assert.equal(result.userProfile, undefined);
  assert.equal(getSessionContext('session-start-profile-2')?.userProfile, undefined);

  clearSessionContext('session-start-profile-2');
});

test('sessionStart leaves userProfile undefined when profileRepo returns null', () => {
  const result = handleSessionStart(
    {
      sessionId: 'session-start-profile-3',
      userId: 'u-session-start-profile',
    },
    { build: () => createBriefing() } as never,
    { getActiveRules: () => [] } as never,
    undefined,
    { getByUserId: () => null } as never,
  );

  assert.equal(result.userProfile, undefined);
  assert.equal(getSessionContext('session-start-profile-3')?.userProfile, undefined);

  clearSessionContext('session-start-profile-3');
});

test('sessionStart forwards normalized communicationStyle to briefing build options', () => {
  let receivedOptions: { sessionId?: string; communicationStyle?: string } | undefined;

  handleSessionStart(
    {
      sessionId: 'session-start-profile-4',
      userId: 'u-session-start-profile',
    },
    {
      build: (_scope: unknown, options?: { sessionId?: string; communicationStyle?: string }) => {
        receivedOptions = options;
        return createBriefing();
      },
    } as never,
    { getActiveRules: () => [] } as never,
    undefined,
    { getByUserId: () => createProfile() } as never,
  );

  assert.deepEqual(receivedOptions, {
    sessionId: 'session-start-profile-4',
    communicationStyle: 'concise',
  });

  clearSessionContext('session-start-profile-4');
});
