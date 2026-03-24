import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type Database from 'better-sqlite3';
import type {
  ButlerPersistentState,
  NewButlerTask,
  WorkingMemoryEntry,
} from '../../src/core/butler/types.js';
import type { CognitiveEngine } from '../../src/core/butler/cognition.js';
import { ButlerAgent } from '../../src/core/butler/agent.js';
import { ButlerStateManager } from '../../src/core/butler/state.js';
import { TaskQueueService } from '../../src/core/butler/taskQueue.js';
import { openDatabase, closeDatabase, type DatabaseHandle } from '../../src/storage/db.js';
import { runMigrations } from '../../src/storage/migrations.js';
import { ButlerInsightRepository } from '../../src/storage/butlerInsightRepo.js';
import { ButlerStateRepository } from '../../src/storage/butlerStateRepo.js';
import { ButlerTaskRepository } from '../../src/storage/butlerTaskRepo.js';

function createLogger() {
  return {
    info: (..._args: unknown[]) => undefined,
    warn: (..._args: unknown[]) => undefined,
    error: (..._args: unknown[]) => undefined,
    debug: (..._args: unknown[]) => undefined,
  };
}

function createState(overrides: Partial<ButlerPersistentState> = {}): ButlerPersistentState {
  return {
    currentStrategyFrame: overrides.currentStrategyFrame ?? {
      currentMode: 'planning',
      likelyUserGoal: 'ship step 3',
      topPriorities: ['state', 'queue', 'agent'],
      constraints: ['strict esm'],
      lastUpdatedAt: '2026-03-23T00:00:00.000Z',
    },
    selfModel: overrides.selfModel ?? {
      overlayAcceptanceRate: 0.7,
      insightPrecision: 0.8,
      avgCycleLatencyMs: 100,
      totalCycles: 2,
      lastEvaluatedAt: '2026-03-23T00:00:00.000Z',
    },
    workingMemory: overrides.workingMemory ?? [],
    mode: overrides.mode ?? 'reduced',
    lastCycleAt: overrides.lastCycleAt ?? '2026-03-23T00:00:00.000Z',
    lastCycleVersion: overrides.lastCycleVersion ?? 1,
  };
}

function createMemoryEntry(
  key: string,
  value: unknown,
  overrides: Partial<WorkingMemoryEntry> = {},
): WorkingMemoryEntry {
  return {
    key,
    value,
    createdAt: overrides.createdAt ?? '2026-03-23T00:00:00.000Z',
    expiresAt: overrides.expiresAt,
  };
}

function createDbContext(): {
  path: string;
  handle: DatabaseHandle;
  db: Database.Database;
  cleanup: () => void;
} {
  const path = join(os.tmpdir(), `evermemory-butler-${randomUUID()}.sqlite`);
  const handle = openDatabase(path);
  runMigrations(handle.connection, path);
  return {
    path,
    handle,
    db: handle.connection,
    cleanup: () => {
      closeDatabase(handle);
      rmSync(path, { force: true });
    },
  };
}

function createCognitiveStub(canAfford = false): CognitiveEngine {
  return {
    canAfford: () => canAfford,
    runTask: async () => ({
      output: {},
      confidence: 0,
      evidenceIds: [],
      fallbackUsed: true,
    }),
  } as unknown as CognitiveEngine;
}

test('ButlerStateManager load creates default when empty', () => {
  const ctx = createDbContext();
  try {
    const manager = new ButlerStateManager({
      stateRepo: new ButlerStateRepository(ctx.db),
      logger: createLogger(),
    });

    const state = manager.load();

    assert.equal(state.mode, 'reduced');
    assert.deepEqual(state.workingMemory, []);
    assert.equal(manager.getMode(), 'reduced');
  } finally {
    ctx.cleanup();
  }
});

test('ButlerStateManager save and reload preserves state', () => {
  const ctx = createDbContext();
  try {
    const repo = new ButlerStateRepository(ctx.db);
    const firstManager = new ButlerStateManager({ stateRepo: repo, logger: createLogger() });
    const secondManager = new ButlerStateManager({ stateRepo: repo, logger: createLogger() });
    const state = createState({
      mode: 'reduced',
      workingMemory: [createMemoryEntry('note', { ok: true })],
      lastCycleVersion: 9,
    });

    firstManager.save(state);

    const reloaded = secondManager.load();
    assert.equal(reloaded.mode, 'reduced');
    assert.equal(reloaded.lastCycleVersion, 9);
    assert.deepEqual(reloaded.workingMemory[0]?.value, { ok: true });
  } finally {
    ctx.cleanup();
  }
});

test('ButlerStateManager addWorkingMemoryEntry immutably adds entry', () => {
  const manager = new ButlerStateManager({
    stateRepo: {} as ButlerStateRepository,
    logger: createLogger(),
  });
  const state = createState({
    workingMemory: [createMemoryEntry('existing', 'value')],
  });

  const next = manager.addWorkingMemoryEntry(state, 'new-key', { payload: true }, 1000);

  assert.equal(state.workingMemory.length, 1);
  assert.equal(next.workingMemory.length, 2);
  assert.equal(next.workingMemory[1]?.key, 'new-key');
  assert.notEqual(next, state);
  assert.notEqual(next.workingMemory, state.workingMemory);
});

test('ButlerStateManager pruneExpiredWorkingMemory removes expired', () => {
  const manager = new ButlerStateManager({
    stateRepo: {} as ButlerStateRepository,
    logger: createLogger(),
  });
  const state = createState({
    workingMemory: [
      createMemoryEntry('expired', true, { expiresAt: '2000-01-01T00:00:00.000Z' }),
      createMemoryEntry('alive', true, { expiresAt: '2099-01-01T00:00:00.000Z' }),
      createMemoryEntry('forever', true),
    ],
  });

  const next = manager.pruneExpiredWorkingMemory(state);

  assert.equal(next.workingMemory.length, 2);
  assert.deepEqual(
    next.workingMemory.map((entry: WorkingMemoryEntry) => entry.key),
    ['alive', 'forever'],
  );
  assert.equal(state.workingMemory.length, 3);
});

test('ButlerStateManager working memory capped at 20', () => {
  const manager = new ButlerStateManager({
    stateRepo: {} as ButlerStateRepository,
    logger: createLogger(),
  });
  let state = createState();

  for (let index = 0; index < 22; index += 1) {
    state = manager.addWorkingMemoryEntry(state, `key-${index}`, index);
  }

  assert.equal(state.workingMemory.length, 20);
  assert.equal(state.workingMemory[0]?.key, 'key-2');
  assert.equal(state.workingMemory[19]?.key, 'key-21');
});

test('TaskQueueService enqueue and drain basic flow', () => {
  const ctx = createDbContext();
  try {
    const service = new TaskQueueService({
      taskRepo: new ButlerTaskRepository(ctx.db),
      logger: createLogger(),
    });

    const taskId = service.enqueue({ type: 'sync', priority: 2, payload: { step: 3 } });
    const drained = service.drain({ maxTasks: 2, maxTimeMs: 1000, priorityFilter: 'all' });

    assert.equal(drained.length, 1);
    assert.equal(drained[0]?.id, taskId);
    assert.equal(drained[0]?.status, 'running');

    service.complete(taskId, { ok: true });
    assert.equal(service.getPendingCount(), 0);
  } finally {
    ctx.cleanup();
  }
});

test('TaskQueueService drain respects priority filter', () => {
  const ctx = createDbContext();
  try {
    const service = new TaskQueueService({
      taskRepo: new ButlerTaskRepository(ctx.db),
      logger: createLogger(),
    });

    service.enqueue({ type: 'high', priority: 2 });
    service.enqueue({ type: 'medium', priority: 5 });
    service.enqueue({ type: 'low', priority: 8 });

    const highOnly = service.drain({ maxTasks: 10, maxTimeMs: 1000, priorityFilter: 'high_only' });
    assert.deepEqual(highOnly.map((task: { type: string }) => task.type), ['high']);

    const highAndMedium = service.drain({
      maxTasks: 10,
      maxTimeMs: 1000,
      priorityFilter: 'high_and_medium',
    });
    assert.deepEqual(highAndMedium.map((task: { type: string }) => task.type), ['medium']);
  } finally {
    ctx.cleanup();
  }
});

test('TaskQueueService idempotency check deduplicates', () => {
  const ctx = createDbContext();
  try {
    const service = new TaskQueueService({
      taskRepo: new ButlerTaskRepository(ctx.db),
      logger: createLogger(),
    });
    const task: NewButlerTask = {
      type: 'dedupe-me',
      idempotencyKey: 'same-key',
      payload: { value: 1 },
    };

    const first = service.enqueue(task);
    const second = service.enqueue(task);
    const drained = service.drain({ maxTasks: 5, maxTimeMs: 1000, priorityFilter: 'all' });

    assert.equal(first, second);
    assert.equal(drained.length, 1);
  } finally {
    ctx.cleanup();
  }
});

test('ButlerAgent runCycle produces cycle trace for session_started', async () => {
  const ctx = createDbContext();
  try {
    const stateManager = new ButlerStateManager({
      stateRepo: new ButlerStateRepository(ctx.db),
      logger: createLogger(),
    });
    const taskQueue = new TaskQueueService({
      taskRepo: new ButlerTaskRepository(ctx.db),
      logger: createLogger(),
    });
    const insightRepo = new ButlerInsightRepository(ctx.db);
    taskQueue.enqueue({ type: 'resume-briefing', priority: 2 });
    insightRepo.insert({
      kind: 'continuity',
      title: 'Carry context forward',
      summary: 'Pending work exists for this session.',
      freshUntil: '2099-01-01T00:00:00.000Z',
    });
    const agent = new ButlerAgent({
      stateManager,
      taskQueue,
      cognitiveEngine: createCognitiveStub(false),
      insightRepo,
      logger: createLogger(),
    });

    const trace = await agent.runCycle({
      type: 'session_started',
      sessionId: 'session-1',
      scope: { project: 'evermemory' },
    });

    assert.equal(trace.hook, 'session_started');
    assert.equal(trace.llmInvoked, false);
    assert.match(trace.observationSummary, /pending/i);
    assert.match(trace.actionsJson, /resume-briefing/);
    assert.equal(taskQueue.getPendingCount(), 0);
    assert.equal(agent.getState()?.lastCycleVersion, 1);
  } finally {
    ctx.cleanup();
  }
});

test('ButlerAgent runCycle for session_ended only enqueues', async () => {
  const ctx = createDbContext();
  try {
    const stateManager = new ButlerStateManager({
      stateRepo: new ButlerStateRepository(ctx.db),
      logger: createLogger(),
    });
    const taskQueue = new TaskQueueService({
      taskRepo: new ButlerTaskRepository(ctx.db),
      logger: createLogger(),
    });
    const agent = new ButlerAgent({
      stateManager,
      taskQueue,
      cognitiveEngine: createCognitiveStub(false),
      insightRepo: new ButlerInsightRepository(ctx.db),
      logger: createLogger(),
    });

    const trace = await agent.runCycle({
      type: 'session_ended',
      sessionId: 'session-2',
      scope: { project: 'evermemory' },
    });

    assert.equal(trace.hook, 'session_ended');
    assert.equal(taskQueue.getPendingCount(), 3);
    assert.match(trace.actionsJson, /goal_derivation/);
    assert.doesNotMatch(trace.actionsJson, /completed/i);
  } finally {
    ctx.cleanup();
  }
});

test('ButlerAgent runCycle in reduced mode skips orientation', async () => {
  const ctx = createDbContext();
  try {
    const stateManager = new ButlerStateManager({
      stateRepo: new ButlerStateRepository(ctx.db),
      logger: createLogger(),
    });
    stateManager.save(createState({ mode: 'reduced' }));
    const agent = new ButlerAgent({
      stateManager,
      taskQueue: new TaskQueueService({
        taskRepo: new ButlerTaskRepository(ctx.db),
        logger: createLogger(),
      }),
      cognitiveEngine: createCognitiveStub(true),
      insightRepo: new ButlerInsightRepository(ctx.db),
      logger: createLogger(),
    });

    const trace = await agent.runCycle({
      type: 'message_received',
      sessionId: 'session-3',
      payload: { text: 'hello' },
    });

    assert.equal(agent.isReduced(), true);
    assert.equal(trace.llmInvoked, false);
    assert.match(trace.decisionsJson, /reduced/i);
  } finally {
    ctx.cleanup();
  }
});

test('ButlerAgent state persisted across cycles', async () => {
  const ctx = createDbContext();
  try {
    const stateManager = new ButlerStateManager({
      stateRepo: new ButlerStateRepository(ctx.db),
      logger: createLogger(),
    });
    const agent = new ButlerAgent({
      stateManager,
      taskQueue: new TaskQueueService({
        taskRepo: new ButlerTaskRepository(ctx.db),
        logger: createLogger(),
      }),
      cognitiveEngine: createCognitiveStub(false),
      insightRepo: new ButlerInsightRepository(ctx.db),
      logger: createLogger(),
    });

    await agent.runCycle({
      type: 'message_received',
      sessionId: 'session-4',
      payload: { text: 'first message' },
    });
    await agent.runCycle({
      type: 'agent_ended',
      sessionId: 'session-4',
      payload: { agentId: 'worker-1' },
    });

    const reloaded = new ButlerStateManager({
      stateRepo: new ButlerStateRepository(ctx.db),
      logger: createLogger(),
    }).load();

    assert.equal(reloaded.lastCycleVersion, 2);
    assert.equal(reloaded.workingMemory.length, 2);
    assert.match(JSON.stringify(reloaded.workingMemory), /worker-1/);
  } finally {
    ctx.cleanup();
  }
});
