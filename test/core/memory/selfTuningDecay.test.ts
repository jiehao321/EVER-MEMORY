import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type Database from 'better-sqlite3';
import { SelfTuningDecayService } from '../../../src/core/memory/selfTuningDecay.js';
import { FeedbackRepository } from '../../../src/storage/feedbackRepo.js';
import type { RetrievalFeedback } from '../../../src/types/feedback.js';
import { createInMemoryDb, nowIso } from '../../storage/helpers.js';

function buildFeedback(overrides: Partial<RetrievalFeedback> & { id: string }): RetrievalFeedback {
  return {
    id: overrides.id,
    sessionId: overrides.sessionId ?? 'session-1',
    memoryId: overrides.memoryId ?? 'memory-1',
    query: overrides.query ?? 'what should I remember',
    strategy: overrides.strategy ?? 'keyword',
    recallRank: overrides.recallRank ?? 1,
    score: overrides.score ?? 0.9,
    signal: overrides.signal ?? 'unknown',
    signalSource: overrides.signalSource ?? 'explicit',
    createdAt: overrides.createdAt ?? nowIso(),
  };
}

describe('SelfTuningDecayService', () => {
  let db: Database.Database;
  let feedbackRepo: FeedbackRepository;
  let service: SelfTuningDecayService;

  beforeEach(() => {
    db = createInMemoryDb();
    feedbackRepo = new FeedbackRepository(db);
    service = new SelfTuningDecayService(feedbackRepo);
  });

  afterEach(() => {
    db.close();
  });

  it('defaults to a multiplier of 1.0 with no feedback', () => {
    const result = service.recompute();

    assert.equal(result.totalSamples, 0);
    assert.equal(result.adjustmentsApplied, 0);
    assert.deepEqual(result.overrides, []);
    assert.equal(service.getDecayMultiplier('keyword'), 1.0);
  });

  it('recomputes every tenth session check', () => {
    for (let index = 0; index < 9; index += 1) {
      assert.equal(service.shouldRecompute(), false);
    }

    assert.equal(service.shouldRecompute(), true);
    assert.equal(service.shouldRecompute(), true);
  });

  it('returns overrides after aggregating enough feedback samples', () => {
    for (let index = 0; index < 5; index += 1) {
      feedbackRepo.insert(buildFeedback({
        id: `used-${index}`,
        strategy: 'keyword',
        signal: 'used',
        memoryId: `memory-used-${index}`,
      }));
    }
    feedbackRepo.insert(buildFeedback({
      id: 'ignored-1',
      strategy: 'keyword',
      signal: 'ignored',
      memoryId: 'memory-ignored-1',
    }));

    const result = service.recompute();

    assert.equal(result.totalSamples, 6);
    assert.equal(result.adjustmentsApplied, 1);
    assert.equal(result.overrides.length, 1);
    assert.equal(result.overrides[0]?.typeGradeKey, 'keyword');
    assert.ok((result.overrides[0]?.decayMultiplier ?? 0) > 1.0);
    assert.equal(service.getDecayMultiplier('keyword'), result.overrides[0]?.decayMultiplier);
  });
});
