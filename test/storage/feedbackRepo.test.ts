import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type Database from 'better-sqlite3';
import { FeedbackRepository } from '../../src/storage/feedbackRepo.js';
import type { RetrievalFeedback } from '../../src/types/feedback.js';
import { createInMemoryDb } from './helpers.js';

function makeFeedback(overrides: Partial<RetrievalFeedback> & { id: string }): RetrievalFeedback {
  return {
    id: overrides.id,
    sessionId: overrides.sessionId ?? 'session-1',
    memoryId: overrides.memoryId ?? 'memory-1',
    query: overrides.query ?? 'what did we decide',
    strategy: overrides.strategy ?? 'hybrid',
    recallRank: overrides.recallRank ?? 1,
    score: overrides.score ?? 0.91,
    signal: overrides.signal ?? 'unknown',
    signalSource: overrides.signalSource ?? 'explicit',
    createdAt: overrides.createdAt ?? '2026-03-21T00:00:00.000Z',
  };
}

describe('FeedbackRepository', () => {
  let db: Database.Database;
  let repo: FeedbackRepository;

  beforeEach(() => {
    db = createInMemoryDb();
    repo = new FeedbackRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should insert and retrieve feedback', () => {
    repo.insert(makeFeedback({ id: 'fb-1' }));

    const feedback = repo.findBySession('session-1');
    assert.equal(feedback.length, 1);
    assert.equal(feedback[0]?.id, 'fb-1');
    assert.equal(feedback[0]?.memoryId, 'memory-1');
    assert.equal(feedback[0]?.signal, 'unknown');
  });

  it('should update signal by session+memory', () => {
    repo.insert(makeFeedback({ id: 'fb-1', signal: 'unknown' }));
    repo.insert(makeFeedback({ id: 'fb-2', signal: 'ignored', createdAt: '2026-03-21T00:01:00.000Z' }));

    repo.updateSignalBySessionMemory('session-1', 'memory-1', 'used', 'session_end_implicit');

    const feedback = repo.findBySession('session-1');
    assert.equal(feedback.length, 2);
    assert.equal(feedback.find((item) => item.id === 'fb-1')?.signal, 'used');
    assert.equal(feedback.find((item) => item.id === 'fb-1')?.signalSource, 'session_end_implicit');
    assert.equal(feedback.find((item) => item.id === 'fb-2')?.signal, 'ignored');
  });

  it('should aggregate by strategy', () => {
    repo.insert(makeFeedback({
      id: 'fb-1',
      strategy: 'hybrid',
      signal: 'used',
    }));
    repo.insert(makeFeedback({
      id: 'fb-2',
      strategy: 'hybrid',
      signal: 'ignored',
      memoryId: 'memory-2',
      createdAt: '2026-03-21T00:01:00.000Z',
    }));
    repo.insert(makeFeedback({
      id: 'fb-3',
      strategy: 'keyword',
      signal: 'unknown',
      memoryId: 'memory-3',
      createdAt: '2026-03-21T00:02:00.000Z',
    }));

    const aggregates = repo.aggregateByStrategy(3650);
    assert.deepEqual(aggregates, [
      {
        strategy: 'hybrid',
        totalUsed: 1,
        totalIgnored: 1,
        totalUnknown: 0,
        effectiveness: 0.5,
      },
      {
        strategy: 'keyword',
        totalUsed: 0,
        totalIgnored: 0,
        totalUnknown: 1,
        effectiveness: Number.NaN,
      },
    ]);
  });

  it('should count records', () => {
    repo.insert(makeFeedback({ id: 'fb-1' }));
    repo.insert(makeFeedback({ id: 'fb-2', memoryId: 'memory-2' }));

    assert.equal(repo.count(), 2);
  });
});
