import assert from 'node:assert/strict';
import test from 'node:test';
import type { CognitiveEngine } from '../../src/core/butler/cognition.js';
import { ButlerAgent } from '../../src/core/butler/agent.js';
import { ButlerInsightRepository } from '../../src/storage/butlerInsightRepo.js';
import type { ButlerGoalService } from '../../src/core/butler/goals/service.js';
import type { WorkerTask } from '../../src/core/butler/worker/pool.js';
import { WorkerThreadPool } from '../../src/core/butler/worker/pool.js';

type WorkerMessageHandler = (message: unknown) => void;

class MockWorker {
  private readonly handlers = new Map<string, Set<WorkerMessageHandler>>();
  private readonly behavior: (task: WorkerTask, worker: MockWorker) => void;
  terminated = false;

  constructor(_script: string, behavior: (task: WorkerTask, worker: MockWorker) => void) {
    this.behavior = behavior;
  }

  on(event: 'message' | 'error' | 'exit', handler: WorkerMessageHandler): this {
    const handlers = this.handlers.get(event) ?? new Set<WorkerMessageHandler>();
    handlers.add(handler);
    this.handlers.set(event, handlers);
    return this;
  }

  once(event: 'message' | 'error' | 'exit', handler: WorkerMessageHandler): this {
    const wrapper: WorkerMessageHandler = (message) => {
      this.off(event, wrapper);
      handler(message);
    };
    return this.on(event, wrapper);
  }

  off(event: 'message' | 'error' | 'exit', handler: WorkerMessageHandler): this {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  postMessage(message: unknown): void {
    this.behavior(message as WorkerTask, this);
  }

  emitMessage(message: unknown): void {
    for (const handler of this.handlers.get('message') ?? []) {
      handler(message);
    }
  }

  emitError(error: unknown): void {
    for (const handler of this.handlers.get('error') ?? []) {
      handler(error);
    }
  }

  emitExit(code = 0): void {
    for (const handler of this.handlers.get('exit') ?? []) {
      handler(code);
    }
  }

  async terminate(): Promise<number> {
    this.terminated = true;
    this.emitExit(0);
    return 0;
  }
}

function createLogger(warnings: string[] = []) {
  return {
    info: (..._args: unknown[]) => undefined,
    warn: (...args: unknown[]) => warnings.push(args.map((item) => String(item)).join(' ')),
    error: (..._args: unknown[]) => undefined,
    debug: (..._args: unknown[]) => undefined,
  };
}

function createAgent(workerPool?: { dispatch(task: WorkerTask): Promise<unknown> }) {
  const cognitiveEngine = {
    canAfford: () => false,
    runTask: async () => ({ output: {}, confidence: 0, evidenceIds: [], fallbackUsed: true }),
  } as unknown as CognitiveEngine;
  return new ButlerAgent({
    stateManager: {
      load: () => {
        throw new Error('unused');
      },
      save: () => undefined,
      pruneExpiredWorkingMemory: () => {
        throw new Error('unused');
      },
      addWorkingMemoryEntry: () => {
        throw new Error('unused');
      },
    } as any,
    taskQueue: {
      drain: () => [],
      complete: () => undefined,
      fail: () => undefined,
      enqueue: () => 'task-id',
      getPendingCount: () => 0,
    } as any,
    cognitiveEngine,
    insightRepo: {} as ButlerInsightRepository,
    goalService: undefined as ButlerGoalService | undefined,
    workerPool: workerPool as any,
    logger: createLogger(),
  });
}

test('WorkerThreadPool creates workers lazily', () => {
  const created: MockWorker[] = [];
  WorkerThreadPool.setWorkerFactoryForTests((script: string) => {
    const worker = new MockWorker(script, () => undefined);
    created.push(worker);
    return worker as never;
  });

  const pool = new WorkerThreadPool('/mock/runner.js');

  assert.equal(created.length, 0);
  assert.equal(pool.getWorkerCountForTests(), 0);

  WorkerThreadPool.resetWorkerFactoryForTests();
});

test('WorkerThreadPool dispatch resolves with result', async () => {
  WorkerThreadPool.setWorkerFactoryForTests((script: string) => new MockWorker(script, (task, worker) => {
    worker.emitMessage({ id: task.id, result: 'ok' });
  }) as never);
  const pool = new WorkerThreadPool('/mock/runner.js');

  await assert.doesNotReject(async () => {
    const result = await pool.dispatch<string>({ id: 'task-1', type: 'cognitive_task', payload: { ok: true } });
    assert.equal(result, 'ok');
  });

  await pool.terminate();
  WorkerThreadPool.resetWorkerFactoryForTests();
});

test('WorkerThreadPool dispatch times out and rejects', async () => {
  WorkerThreadPool.setWorkerFactoryForTests((script: string) => new MockWorker(script, () => undefined) as never);
  const pool = new WorkerThreadPool('/mock/runner.js', { taskTimeoutMs: 10 });

  await assert.rejects(
    pool.dispatch({ id: 'task-timeout', type: 'cognitive_task', payload: undefined }),
    /timed out/i,
  );

  await pool.terminate();
  WorkerThreadPool.resetWorkerFactoryForTests();
});

test('WorkerThreadPool queue full rejects immediately', async () => {
  WorkerThreadPool.setWorkerFactoryForTests((script: string) => new MockWorker(script, () => undefined) as never);
  const pool = new WorkerThreadPool('/mock/runner.js', {
    maxWorkers: 1,
    maxQueueSize: 1,
    taskTimeoutMs: 1000,
  });

  const first = pool.dispatch({ id: 'task-1', type: 'cognitive_task', payload: 1 });
  const second = pool.dispatch({ id: 'task-2', type: 'cognitive_task', payload: 2 });

  await assert.rejects(
    pool.dispatch({ id: 'task-3', type: 'cognitive_task', payload: 3 }),
    /queue full/i,
  );

  await pool.terminate();
  await assert.rejects(first, /terminated/i);
  await assert.rejects(second, /terminated/i);
  WorkerThreadPool.resetWorkerFactoryForTests();
});

test('WorkerThreadPool terminate rejects all pending', async () => {
  WorkerThreadPool.setWorkerFactoryForTests((script: string) => new MockWorker(script, () => undefined) as never);
  const pool = new WorkerThreadPool('/mock/runner.js', { maxWorkers: 1, maxQueueSize: 2 });

  const active = pool.dispatch({ id: 'task-1', type: 'cognitive_task', payload: 1 });
  const queued = pool.dispatch({ id: 'task-2', type: 'cognitive_task', payload: 2 });

  await pool.terminate();

  await assert.rejects(active, /terminated/i);
  await assert.rejects(queued, /terminated/i);
  WorkerThreadPool.resetWorkerFactoryForTests();
});

test('WorkerThreadPool drain resolves when idle', async () => {
  WorkerThreadPool.setWorkerFactoryForTests((script: string) => new MockWorker(script, () => undefined) as never);
  const pool = new WorkerThreadPool('/mock/runner.js');

  await assert.doesNotReject(async () => {
    await pool.drain();
  });

  await pool.terminate();
  WorkerThreadPool.resetWorkerFactoryForTests();
});

test('ButlerAgent runDeferredTask calls narrativeService.updateOrCreateForSession for narrative_update', () => {
  const calls: Array<Record<string, unknown>> = [];
  const agent = new ButlerAgent({
    stateManager: {
      load: () => { throw new Error('unused'); },
      save: () => undefined,
      pruneExpiredWorkingMemory: () => { throw new Error('unused'); },
      addWorkingMemoryEntry: () => { throw new Error('unused'); },
    } as any,
    taskQueue: {
      drain: () => [],
      complete: () => undefined,
      fail: () => undefined,
      enqueue: () => 'task-id',
      getPendingCount: () => 0,
    } as any,
    cognitiveEngine: {
      canAfford: () => false,
      runTask: async () => ({ output: {}, confidence: 0, evidenceIds: [], fallbackUsed: true }),
    } as unknown as CognitiveEngine,
    insightRepo: {} as ButlerInsightRepository,
    narrativeService: {
      updateOrCreateForSession: (payload: Record<string, unknown>) => {
        calls.push(payload);
      },
    } as any,
    logger: createLogger(),
  });

  (agent as unknown as { runDeferredTask(task: unknown): void }).runDeferredTask({
    id: 'task-1',
    type: 'narrative_update',
    payloadJson: JSON.stringify({ scope: 'project' }),
  });

  assert.deepEqual(calls, [{ scope: 'project' }]);
});

test('ButlerAgent runDeferredTask fallback when no pool', () => {
  const warnings: string[] = [];
  const agent = new ButlerAgent({
    stateManager: {
      load: () => {
        throw new Error('unused');
      },
      save: () => undefined,
      pruneExpiredWorkingMemory: () => {
        throw new Error('unused');
      },
      addWorkingMemoryEntry: () => {
        throw new Error('unused');
      },
    } as any,
    taskQueue: {
      drain: () => [],
      complete: () => undefined,
      fail: () => undefined,
      enqueue: () => 'task-id',
      getPendingCount: () => 0,
    } as any,
    cognitiveEngine: {
      canAfford: () => false,
      runTask: async () => ({ output: {}, confidence: 0, evidenceIds: [], fallbackUsed: true }),
    } as unknown as CognitiveEngine,
    insightRepo: {} as ButlerInsightRepository,
    logger: createLogger(warnings),
  });

  assert.doesNotThrow(() => {
    (agent as unknown as { runDeferredTask(task: unknown): void }).runDeferredTask({
      id: 'task-2',
      type: 'narrative_update',
      payloadJson: JSON.stringify({ scope: 'project' }),
    });
  });
  assert.deepEqual(warnings, []);
});
