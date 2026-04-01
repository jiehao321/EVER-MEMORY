import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TaskQueueService } from '../../src/core/butler/taskQueue.js';
import { ButlerTaskRepository } from '../../src/storage/butlerTaskRepo.js';
import { createInMemoryDb } from '../storage/helpers.js';

function createLogger() {
  return {
    info: (_message: string, _meta?: Record<string, unknown>) => undefined,
    warn: (_message: string, _meta?: Record<string, unknown>) => undefined,
    error: (_message: string, _meta?: Record<string, unknown>) => undefined,
    debug: (_message: string, _meta?: Record<string, unknown>) => undefined,
  };
}

describe('TaskQueueService', () => {
  let service: TaskQueueService;

  beforeEach(() => {
    const db = createInMemoryDb();
    service = new TaskQueueService({
      taskRepo: new ButlerTaskRepository(db),
      logger: createLogger(),
    });
  });

  it('enqueue adds a task that can be drained', () => {
    const taskId = service.enqueue({
      type: 'sync',
      priority: 3,
      payload: { source: 'test' },
    });

    const drained = service.drain({ maxTasks: 1, maxTimeMs: 1_000, priorityFilter: 'all' });

    assert.equal(drained.length, 1);
    assert.equal(drained[0]?.id, taskId);
    assert.equal(drained[0]?.status, 'running');
  });

  it('drain respects the max task budget', () => {
    service.enqueue({ type: 'first', priority: 2 });
    service.enqueue({ type: 'second', priority: 3 });
    service.enqueue({ type: 'third', priority: 4 });

    const drained = service.drain({ maxTasks: 2, maxTimeMs: 1_000, priorityFilter: 'all' });

    assert.equal(drained.length, 2);
    assert.deepEqual(drained.map((task) => task.type), ['first', 'second']);
  });

  it('returns the existing task when enqueue sees the same idempotency key', () => {
    const firstId = service.enqueue({
      type: 'narrative_update',
      priority: 4,
      idempotencyKey: 'session-ended:narrative:session-1',
    });

    const secondId = service.enqueue({
      type: 'narrative_update',
      priority: 4,
      idempotencyKey: 'session-ended:narrative:session-1',
    });

    const drained = service.drain({ maxTasks: 5, maxTimeMs: 1_000, priorityFilter: 'all' });

    assert.equal(firstId, secondId);
    assert.deepEqual(drained.map((task) => task.id), [firstId]);
  });

  it('returns an empty array when the queue is empty', () => {
    const drained = service.drain({ maxTasks: 3, maxTimeMs: 1_000, priorityFilter: 'all' });

    assert.deepEqual(drained, []);
  });

  it('drains tasks in priority order and applies the priority filter', () => {
    service.enqueue({ type: 'low', priority: 7 });
    service.enqueue({ type: 'medium', priority: 5 });
    service.enqueue({ type: 'high', priority: 2 });

    const highOnly = service.drain({ maxTasks: 5, maxTimeMs: 1_000, priorityFilter: 'high_only' });

    assert.deepEqual(highOnly.map((task) => task.type), ['high']);
  });

  it('includes medium priority tasks when using the high_and_medium filter', () => {
    service.enqueue({ type: 'low', priority: 8 });
    service.enqueue({ type: 'medium', priority: 6 });
    service.enqueue({ type: 'high', priority: 1 });

    const drained = service.drain({
      maxTasks: 5,
      maxTimeMs: 1_000,
      priorityFilter: 'high_and_medium',
    });

    assert.deepEqual(drained.map((task) => task.type), ['high', 'medium']);
  });

  it('completed tasks are not drained again', () => {
    const taskId = service.enqueue({ type: 'refresh', priority: 2 });
    const [leased] = service.drain({ maxTasks: 1, maxTimeMs: 1_000, priorityFilter: 'all' });

    assert.equal(leased?.id, taskId);
    service.complete(taskId, { ok: true });

    const drainedAgain = service.drain({ maxTasks: 5, maxTimeMs: 1_000, priorityFilter: 'all' });

    assert.deepEqual(drainedAgain, []);
    assert.equal(service.getPendingCount(), 0);
  });
});
