import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { CognitiveEngine } from '../../src/core/butler/cognition.js';
import type { CognitiveTask } from '../../src/core/butler/types.js';
import { NarrativeThreadService } from '../../src/core/butler/narrative/service.js';
import { NarrativeRepository } from '../../src/storage/narrativeRepo.js';
import { createInMemoryDb } from '../storage/helpers.js';

function createLogger() {
  return {
    info: (_message: string, _meta?: Record<string, unknown>) => undefined,
    warn: (_message: string, _meta?: Record<string, unknown>) => undefined,
    error: (_message: string, _meta?: Record<string, unknown>) => undefined,
    debug: (_message: string, _meta?: Record<string, unknown>) => undefined,
  };
}

function createCognitiveStub(options: {
  canAfford?: boolean;
  output?: Record<string, unknown>;
  onRunTask?: (task: CognitiveTask<Record<string, unknown>>) => void;
} = {}): CognitiveEngine {
  return {
    canAfford: () => options.canAfford ?? false,
    runTask: async (task: CognitiveTask<Record<string, unknown>>) => {
      options.onRunTask?.(task);
      return {
        output: options.output ?? {},
        confidence: 0.7,
        evidenceIds: ['ev-1'],
        fallbackUsed: false,
      };
    },
  } as unknown as CognitiveEngine;
}

describe('NarrativeThreadService', () => {
  it('creates a new thread', async () => {
    const service = new NarrativeThreadService({
      narrativeRepo: new NarrativeRepository(createInMemoryDb()),
      cognitiveEngine: createCognitiveStub(),
      logger: createLogger(),
    });

    const thread = await service.createThread({
      theme: 'Butler testing',
      objective: 'Track module test rollout',
      scope: { project: 'evermemory' },
    });

    assert.equal(thread.theme, 'Butler testing');
    assert.equal(thread.currentPhase, 'exploring');
    assert.equal(thread.momentum, 'steady');
    assert.equal(thread.scopeJson, JSON.stringify({ project: 'evermemory' }));
  });

  it('continues a thread by updating its narrative state', async () => {
    let capturedTask: CognitiveTask<Record<string, unknown>> | undefined;
    const repo = new NarrativeRepository(createInMemoryDb());
    const service = new NarrativeThreadService({
      narrativeRepo: repo,
      cognitiveEngine: createCognitiveStub({
        canAfford: true,
        output: {
          phase: 'converging',
          momentum: 'accelerating',
          likelyNextTurn: 'Run the compiled Butler tests',
        },
        onRunTask: (task) => {
          capturedTask = task;
        },
      }),
      logger: createLogger(),
    });
    const thread = await service.createThread({
      theme: 'Butler testing',
      objective: 'Track module test rollout',
    });

    const updated = await service.updateThread(thread.id, 'compiled tests added', { project: 'evermemory' });

    assert.equal(updated?.currentPhase, 'converging');
    assert.equal(updated?.momentum, 'accelerating');
    assert.equal(updated?.likelyNextTurn, 'Run the compiled Butler tests');
    assert.deepEqual(capturedTask?.evidence, {
      thread,
      event: 'compiled tests added',
      scope: { project: 'evermemory' },
    });
  });

  it('lists only active threads and can continue an existing session narrative', async () => {
    const repo = new NarrativeRepository(createInMemoryDb());
    const service = new NarrativeThreadService({
      narrativeRepo: repo,
      cognitiveEngine: createCognitiveStub(),
      logger: createLogger(),
    });
    const openThread = await service.createThread({
      theme: 'Open thread',
      objective: 'Still active',
      scope: { project: 'evermemory' },
    });
    const closedThread = await service.createThread({
      theme: 'Closed thread',
      objective: 'Done',
      scope: { project: 'evermemory' },
    });

    service.closeThread(closedThread.id);
    service.updateOrCreateForSession({ scope: { project: 'evermemory' }, sessionId: 'session-1' });

    const threads = service.getActiveThreads({ project: 'evermemory' });

    assert.equal(threads.some((thread) => thread.id === closedThread.id), false);
    assert.equal(threads.some((thread) => thread.id === openThread.id), true);
    assert.ok(threads.find((thread) => thread.id === openThread.id)?.recentEvents.length);
  });
});
