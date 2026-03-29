import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type Database from 'better-sqlite3';
import { FeedbackRepository } from '../../src/storage/feedbackRepo.js';
import type { RetrievalFactorAggregation, RetrievalFeedback } from '../../src/types/feedback.js';
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
    topFactors: overrides.topFactors ?? [],
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
    repo.insert(makeFeedback({
      id: 'fb-1',
      topFactors: [
        { name: 'keyword', value: 0.8 },
        { name: 'base', value: 0.2 },
      ],
    }));

    const feedback = repo.findBySession('session-1');
    assert.equal(feedback.length, 1);
    assert.equal(feedback[0]?.id, 'fb-1');
    assert.equal(feedback[0]?.memoryId, 'memory-1');
    assert.equal(feedback[0]?.signal, 'unknown');
    assert.deepEqual(feedback[0]?.topFactors, [
      { name: 'keyword', value: 0.8 },
      { name: 'base', value: 0.2 },
    ]);
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

  it('should aggregate factor effectiveness by factor name', () => {
    repo.insert(makeFeedback({
      id: 'fb-used-1',
      signal: 'used',
      topFactors: [
        { name: 'keyword', value: 0.9 },
        { name: 'base', value: 0.3 },
      ],
    }));
    repo.insert(makeFeedback({
      id: 'fb-used-2',
      signal: 'used',
      memoryId: 'memory-2',
      createdAt: '2026-03-21T00:01:00.000Z',
      topFactors: [
        { name: 'keyword', value: 0.5 },
        { name: 'semantic', value: 0.4 },
      ],
    }));
    repo.insert(makeFeedback({
      id: 'fb-ignored-1',
      signal: 'ignored',
      memoryId: 'memory-3',
      createdAt: '2026-03-21T00:02:00.000Z',
      topFactors: [
        { name: 'keyword', value: 0.3 },
        { name: 'semantic', value: 0.7 },
      ],
    }));
    repo.insert(makeFeedback({
      id: 'fb-unknown-1',
      signal: 'unknown',
      memoryId: 'memory-4',
      createdAt: '2026-03-21T00:03:00.000Z',
      topFactors: [
        { name: 'keyword', value: 1 },
      ],
    }));

    const aggregates = repo.aggregateFactorEffectiveness(3650);
    assert.deepEqual<RetrievalFactorAggregation[]>(aggregates, [
      {
        factor: 'base',
        usedAverage: 0.3,
        ignoredAverage: Number.NaN,
        usedCount: 1,
        ignoredCount: 0,
      },
      {
        factor: 'keyword',
        usedAverage: 0.7,
        ignoredAverage: 0.3,
        usedCount: 2,
        ignoredCount: 1,
      },
      {
        factor: 'semantic',
        usedAverage: 0.4,
        ignoredAverage: 0.7,
        usedCount: 1,
        ignoredCount: 1,
      },
    ]);
  });
});
