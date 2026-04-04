import assert from 'node:assert/strict';
import test from 'node:test';
import type { CognitiveEngine } from '../../src/core/butler/cognition.js';
import { ButlerAgent } from '../../src/core/butler/agent.js';
import { InsightProducerRegistry } from '../../src/core/butler/producers/registry.js';
import { ButlerStateManager } from '../../src/core/butler/state.js';
import { TaskQueueService } from '../../src/core/butler/taskQueue.js';
import { ButlerInsightRepository } from '../../src/storage/butlerInsightRepo.js';
import { ButlerStateRepository } from '../../src/storage/butlerStateRepo.js';
import { ButlerTaskRepository } from '../../src/storage/butlerTaskRepo.js';
import { createInMemoryDb } from '../storage/helpers.js';

function createLogger() {
  const infoLogs: Array<{ message: string; meta?: Record<string, unknown> }> = [];
  return {
    infoLogs,
    logger: {
      info(message: string, meta?: Record<string, unknown>) {
        infoLogs.push({ message, meta });
      },
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    },
  };
}

function createContext() {
  const db = createInMemoryDb();
  return {
    db,
    stateManager: new ButlerStateManager({
      stateRepo: new ButlerStateRepository(db),
      logger: createLogger().logger,
    }),
    taskQueue: new TaskQueueService({
      taskRepo: new ButlerTaskRepository(db),
      logger: createLogger().logger,
    }),
    insightRepo: new ButlerInsightRepository(db),
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

test('ButlerAgent runs producer registry at session start and logs produced count', async () => {
  const ctx = createContext();
  const { infoLogs, logger } = createLogger();
  const registry = new InsightProducerRegistry(ctx.insightRepo, logger);
  registry.register({
    kind: 'theme',
    produce: () => [{
      kind: 'theme',
      title: 'Recurring theme: project (5 memories)',
      summary: 'Project work is recurring.',
      confidence: 0.7,
      importance: 0.6,
      freshUntil: '2099-01-01T00:00:00.000Z',
    }],
  });
  const agent = new ButlerAgent({
    stateManager: ctx.stateManager,
    taskQueue: ctx.taskQueue,
    cognitiveEngine: createCognitiveStub(false),
    insightRepo: ctx.insightRepo,
    producerRegistry: registry,
    logger,
  });

  await agent.runCycle({ type: 'session_started', sessionId: 'session-producer-1' });

  assert.equal(ctx.insightRepo.findByKind('theme', 10).length, 1);
  assert.equal(
    infoLogs.some((entry) => entry.message === 'ButlerAgent produced insights' && entry.meta?.count === 1),
    true,
  );
});

test('ButlerAgent queues knowledge_gap_scan on session end', async () => {
  const ctx = createContext();
  const agent = new ButlerAgent({
    stateManager: ctx.stateManager,
    taskQueue: ctx.taskQueue,
    cognitiveEngine: createCognitiveStub(false),
    insightRepo: ctx.insightRepo,
    logger: createLogger().logger,
  });

  const trace = await agent.runCycle({
    type: 'session_ended',
    sessionId: 'session-gap-1',
    scope: { project: 'evermemory' },
  });
  const actions = JSON.parse(trace.actionsJson) as { queuedTaskTypes?: string[] };
  const drained = ctx.taskQueue.drain({ maxTasks: 10, maxTimeMs: 1000, priorityFilter: 'all' });

  assert.deepEqual(actions.queuedTaskTypes, [
    'narrative_update',
    'commitment_scan',
    'insight_refresh',
    'goal_derivation',
    'knowledge_gap_scan',
  ]);
  assert.deepEqual(drained.map((task) => task.type), [
    'narrative_update',
    'commitment_scan',
    'insight_refresh',
    'goal_derivation',
    'knowledge_gap_scan',
  ]);
});

test('ButlerAgent acknowledges knowledge_gap_scan deferred tasks', async () => {
  const ctx = createContext();
  const { infoLogs, logger } = createLogger();
  const agent = new ButlerAgent({
    stateManager: ctx.stateManager,
    taskQueue: ctx.taskQueue,
    cognitiveEngine: createCognitiveStub(false),
    insightRepo: ctx.insightRepo,
    logger,
  });
  ctx.taskQueue.enqueue({ type: 'knowledge_gap_scan', priority: 6 });

  const trace = await agent.runCycle({ type: 'session_started', sessionId: 'session-gap-ack' });
  const actions = JSON.parse(trace.actionsJson) as { drainedTaskTypes?: string[] };

  assert.deepEqual(actions.drainedTaskTypes, ['knowledge_gap_scan']);
  assert.equal(
    infoLogs.some((entry) => entry.message === 'ButlerAgent: knowledge_gap_scan task acknowledged'),
    true,
  );
});
