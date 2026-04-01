import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSessionEnd } from '../../src/hooks/sessionEnd.js';
import type { ProjectedProfile } from '../../src/types.js';

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

function createProjectedProfile(value: string): ProjectedProfile {
  return {
    userId: 'u-session-end-profile',
    updatedAt: '2026-03-15T00:00:00.000Z',
    stable: {
      explicitPreferences: {
        tone: {
          value,
          source: 'stable_explicit',
          canonical: true,
          evidenceRefs: ['m-1'],
        },
      },
      explicitConstraints: [],
    },
    derived: {
      likelyInterests: [],
      workPatterns: [],
    },
    behaviorHints: [],
  };
}

test('sessionEnd triggers profile recompute after auto capture when userId exists', async () => {
  const calls: string[] = [];

  const result = await handleSessionEnd(
    {
      sessionId: 'session-end-profile-1',
      scope: { userId: 'u-session-end-profile' },
    },
    {
      experienceService: { log: () => createExperience() } as never,
      reflectionService: {} as never,
      behaviorService: {
        promoteFromReflection: () => undefined,
        freezeRulesByDuration: () => [],
        demoteStaleEmergingRules: () => 0,
      } as never,
      memoryService: { store: () => ({ accepted: false, reason: 'noop', memory: null }) } as never,
      profileProjection: { recomputeForUser: (userId: string) => {
        calls.push(userId);
        return null;
      } } as never,
    },
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
    {
      experienceService: { log: () => createExperience() } as never,
      reflectionService: {} as never,
      behaviorService: {
        promoteFromReflection: () => undefined,
        freezeRulesByDuration: () => [],
        demoteStaleEmergingRules: () => 0,
      } as never,
      memoryService: { store: () => ({ accepted: false, reason: 'noop', memory: null }) } as never,
      debugRepo: { log: () => undefined } as never,
      profileProjection: { recomputeForUser: () => {
        throw new Error('projection failed');
      } } as never,
    },
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
    {
      experienceService: { log: () => createExperience() } as never,
      reflectionService: {} as never,
      behaviorService: {
        promoteFromReflection: () => undefined,
        freezeRulesByDuration: () => [],
        demoteStaleEmergingRules: () => 0,
      } as never,
      memoryService: { store: () => ({ accepted: false, reason: 'noop', memory: null }) } as never,
      profileProjection: { recomputeForUser: () => {
        calls += 1;
        return null;
      } } as never,
    },
  );

  assert.equal(calls, 0);
  assert.equal(result.profileUpdated, false);
});

test('sessionEnd times out forceReflect reflection and logs fallback telemetry', async () => {
  const debugEvents: Array<{ kind: string; entityId?: string; payload: Record<string, unknown> }> = [];
  const timeouts: number[] = [];
  const originalSetTimeout = global.setTimeout;

  global.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    timeouts.push(Number(timeout));
    return originalSetTimeout(() => {
      if (typeof handler === 'function') {
        handler(...args);
      }
    }, 0);
  }) as unknown as typeof setTimeout;

  try {
    const result = await handleSessionEnd(
      {
        sessionId: 'session-end-profile-reflection-timeout',
        forceReflect: true,
        scope: { userId: 'u-session-end-profile' },
      },
      {
        experienceService: { log: () => createExperience() } as never,
        reflectionService: {
          reflect: () => new Promise(() => undefined),
        } as never,
        behaviorService: {
          listPendingReflections: () => [],
          promoteFromReflection: () => undefined,
          freezeRulesByDuration: () => [],
          demoteStaleEmergingRules: () => 0,
        } as never,
        memoryService: { store: () => ({ accepted: false, reason: 'noop', memory: null }) } as never,
        debugRepo: {
          log: (kind: string, entityId: string | undefined, payload: Record<string, unknown>) => {
            debugEvents.push({ kind, entityId, payload });
          },
        } as never,
      },
    );

    assert.equal(result.reflection, undefined);
    assert.ok(timeouts.includes(10_000));
    assert.ok(
      debugEvents.some((event) =>
        event.kind === 'reflection_timeout'
        && event.entityId === 'session-end-profile-reflection-timeout'
        && String(event.payload.error).includes('reflection timed out')
      ),
    );
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});

test('sessionEnd skips non-critical work when total budget is exhausted', async () => {
  const debugEvents: Array<{ kind: string; entityId?: string; payload: Record<string, unknown> }> = [];
  const calls: string[] = [];
  const originalDateNow = Date.now;
  let firstCall = true;

  Date.now = () => {
    if (firstCall) {
      firstCall = false;
      return 0;
    }
    return 59_500;
  };

  try {
    const result = await handleSessionEnd(
      {
        sessionId: 'session-end-profile-budget-skip',
        scope: { userId: 'u-session-end-profile', project: 'evermemory' },
      },
      {
        experienceService: { log: () => createExperience() } as never,
        reflectionService: {} as never,
        behaviorService: {
          listPendingReflections: () => [],
          promoteFromReflection: () => undefined,
          freezeRulesByDuration: () => [],
          demoteStaleEmergingRules: () => 0,
        } as never,
        memoryService: { store: () => ({ accepted: false, reason: 'noop', memory: null }) } as never,
        debugRepo: {
          log: (kind: string, entityId: string | undefined, payload: Record<string, unknown>) => {
            debugEvents.push({ kind, entityId, payload });
          },
        } as never,
        memoryRepo: {
          count: () => 51,
          search: () => [{ id: 'm-1', timestamps: { updatedAt: '2026-03-15T00:00:00.000Z' } }],
        } as never,
        profileProjection: {
          recomputeForUser: () => {
            calls.push('profileProjection');
            return null;
          },
        } as never,
        housekeepingService: {
          runIfNeeded: async () => {
            calls.push('housekeeping');
          },
        } as never,
        relationDetectionService: {
          detectRelations: async () => {
            calls.push('relationDiscovery');
            return { detected: 1, inferred: 0, skipped: false };
          },
        } as never,
      },
    );

    assert.deepEqual(calls, []);
    assert.equal(result.profileUpdated, false);
    assert.equal(result.learningInsights, 0);
    assert.equal(result.autoMemory?.generated, 0);
    assert.deepEqual(
      debugEvents
        .filter((event) => event.kind === 'session_end_budget_skip')
        .map((event) => event.payload.skipped),
      [
        'processAutoCapture',
        'extractLearningInsights',
        'storeInsights',
        'profileProjection',
        'housekeeping',
        'relationDiscovery',
      ],
    );
  } finally {
    Date.now = originalDateNow;
  }
});

test('sessionEnd logs housekeeping timeout as debug telemetry and keeps teardown successful', async () => {
  const timeouts: number[] = [];
  const debugEvents: Array<{ kind: string; entityId?: string; payload: Record<string, unknown> }> = [];
  const originalSetTimeout = global.setTimeout;

  global.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    timeouts.push(Number(timeout));
    return originalSetTimeout(() => {
      if (typeof handler === 'function') {
        handler(...args);
      }
    }, 0);
  }) as unknown as typeof setTimeout;

  try {
    const result = await handleSessionEnd(
      {
        sessionId: 'session-end-profile-4',
        scope: { userId: 'u-session-end-profile', project: 'evermemory' },
      },
      {
        experienceService: { log: () => createExperience() } as never,
        reflectionService: {} as never,
        behaviorService: {
          promoteFromReflection: () => undefined,
          freezeRulesByDuration: () => [],
          demoteStaleEmergingRules: () => 0,
        } as never,
        memoryService: { store: () => ({ accepted: false, reason: 'noop', memory: null }) } as never,
        debugRepo: {
          log: (kind: string, entityId: string | undefined, payload: Record<string, unknown>) => {
            debugEvents.push({ kind, entityId, payload });
          },
        } as never,
        memoryRepo: {
          count: () => 51,
          search: () => [{ timestamps: { updatedAt: '2026-03-15T00:00:00.000Z' } }],
        } as never,
        housekeepingService: {
          runIfNeeded: () => new Promise(() => undefined),
        } as never,
      },
    );

    assert.equal(result.sessionId, 'session-end-profile-4');
    assert.ok(timeouts.includes(8_000));
    assert.ok(
      debugEvents.some((event) =>
        event.kind === 'housekeeping_error'
        && event.payload.reason === 'timeout'
      )
    );
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});

test('sessionEnd runs drift detection after a successful profile recompute', async () => {
  const driftCalls: Array<{ previous: ProjectedProfile | null; next: ProjectedProfile; userId: string }> = [];
  const previousProfile = createProjectedProfile('concise');
  const nextProfile = createProjectedProfile('verbose');

  const result = await handleSessionEnd(
    {
      sessionId: 'session-end-profile-5',
      scope: { userId: 'u-session-end-profile' },
    },
    {
      experienceService: { log: () => createExperience() } as never,
      reflectionService: {} as never,
      behaviorService: {
        promoteFromReflection: () => undefined,
        freezeRulesByDuration: () => [],
        demoteStaleEmergingRules: () => 0,
      } as never,
      memoryService: { store: () => ({ accepted: false, reason: 'noop', memory: null }) } as never,
      profileProjection: { recomputeForUser: () => nextProfile } as never,
      profileRepo: { getByUserId: () => previousProfile } as never,
      driftDetectionService: {
        detectDrift: (previous: ProjectedProfile | null, next: ProjectedProfile, userId: string) => {
          driftCalls.push({ previous, next, userId });
          return { drifts: [], totalChanges: 0, reversals: 0 };
        },
      } as never,
    },
  );

  assert.equal(result.profileUpdated, true);
  assert.deepEqual(driftCalls, [{
    previous: previousProfile,
    next: nextProfile,
    userId: 'u-session-end-profile',
  }]);
});

test('sessionEnd performs end-of-session maintenance hooks as best effort', async () => {
  const calls: string[] = [];

  const result = await handleSessionEnd(
    {
      sessionId: 'session-end-profile-6',
      scope: { userId: 'u-session-end-profile', project: 'evermemory' },
    },
    {
      experienceService: { log: () => createExperience() } as never,
      reflectionService: {} as never,
      behaviorService: {
        promoteFromReflection: () => undefined,
        freezeRulesByDuration: () => [],
        demoteStaleEmergingRules: () => 0,
      } as never,
      memoryService: { store: () => ({ accepted: false, reason: 'noop', memory: null }) } as never,
      memoryRepo: {
        count: () => 0,
      } as never,
      selfTuningDecayService: {
        shouldRecompute: () => true,
        recompute: () => {
          calls.push('recompute');
          return { overrides: [], totalSamples: 0, adjustmentsApplied: 0 };
        },
      } as never,
      progressiveConsolidationService: {
        resetSession: (sessionId: string) => {
          calls.push(`reset:${sessionId}`);
        },
      } as never,
      predictiveContextService: {
        clearCache: (sessionId: string) => {
          calls.push(`clear:${sessionId}`);
        },
      } as never,
      contradictionMonitor: {
        clearSession: (sessionId: string) => {
          calls.push(`contradictions:${sessionId}`);
        },
      } as never,
    },
  );

  assert.equal(result.sessionId, 'session-end-profile-6');
  assert.deepEqual(calls, [
    'recompute',
    'reset:session-end-profile-6',
    'clear:session-end-profile-6',
    'contradictions:session-end-profile-6',
  ]);
});

test('sessionEnd swallows maintenance hook failures', async () => {
  const result = await handleSessionEnd(
    {
      sessionId: 'session-end-profile-7',
      scope: { userId: 'u-session-end-profile' },
    },
    {
      experienceService: { log: () => createExperience() } as never,
      reflectionService: {} as never,
      behaviorService: {
        promoteFromReflection: () => undefined,
        freezeRulesByDuration: () => [],
        demoteStaleEmergingRules: () => 0,
      } as never,
      memoryService: { store: () => ({ accepted: false, reason: 'noop', memory: null }) } as never,
      memoryRepo: {
        count: () => 0,
      } as never,
      profileProjection: { recomputeForUser: () => createProjectedProfile('verbose') } as never,
      profileRepo: { getByUserId: () => createProjectedProfile('concise') } as never,
      selfTuningDecayService: {
        shouldRecompute: () => true,
        recompute: () => {
          throw new Error('recompute failed');
        },
      } as never,
      driftDetectionService: {
        detectDrift: () => {
          throw new Error('drift failed');
        },
      } as never,
      progressiveConsolidationService: {
        resetSession: () => {
          throw new Error('reset failed');
        },
      } as never,
      predictiveContextService: {
        clearCache: () => {
          throw new Error('clear cache failed');
        },
      } as never,
      contradictionMonitor: {
        clearSession: () => {
          throw new Error('clear contradictions failed');
        },
      } as never,
    },
  );

  assert.equal(result.sessionId, 'session-end-profile-7');
  assert.equal(result.profileUpdated, true);
});

test('sessionEnd scans recent active memories for offline relation discovery', async () => {
  const debugEvents: Array<{ kind: string; entityId?: string; payload: Record<string, unknown> }> = [];
  const detectCalls: string[] = [];
  const recentMemories = [
    {
      id: 'm-3',
      content: 'third memory',
      timestamps: { updatedAt: '2026-03-20T00:00:00.000Z' },
      state: { active: true, archived: false },
    },
    {
      id: 'm-2',
      content: 'second memory',
      timestamps: { updatedAt: '2026-03-19T00:00:00.000Z' },
      state: { active: true, archived: false },
    },
    {
      id: 'm-1',
      content: 'first memory',
      timestamps: { updatedAt: '2026-03-18T00:00:00.000Z' },
      state: { active: true, archived: false },
    },
  ];

  await handleSessionEnd(
    {
      sessionId: 'session-end-profile-8',
      scope: { userId: 'u-session-end-profile', project: 'evermemory' },
    },
    {
      experienceService: { log: () => createExperience() } as never,
      reflectionService: {} as never,
      behaviorService: {
        promoteFromReflection: () => undefined,
        freezeRulesByDuration: () => [],
        demoteStaleEmergingRules: () => 0,
      } as never,
      memoryService: { store: () => ({ accepted: false, reason: 'noop', memory: null }) } as never,
      debugRepo: {
        log: (kind: string, entityId: string | undefined, payload: Record<string, unknown>) => {
          debugEvents.push({ kind, entityId, payload });
        },
      } as never,
      memoryRepo: {
        count: () => 3,
        search: () => recentMemories,
      } as never,
      relationDetectionService: {
        detectRelations: async (memory: { id: string }) => {
          detectCalls.push(memory.id);
          return { detected: 1, inferred: 0, skipped: false };
        },
      } as never,
    },
  );

  assert.deepEqual(detectCalls, ['m-3', 'm-2', 'm-1']);
  assert.ok(
    debugEvents.some((event) =>
      event.kind === 'offline_relation_discovery'
      && event.entityId === 'session-end-profile-8'
      && event.payload.memoriesScanned === 3
      && event.payload.relationsDiscovered === 3
    ),
  );
});
