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
    service = new SelfTuningDecayService(feedbackRepo, db);
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

  it('triggers on the first session after construction, then every tenth session after recompute', () => {
    assert.equal(service.shouldRecompute(), true);
    assert.equal(service.shouldRecompute(), true);

    service.recompute();

    for (let index = 0; index < 9; index += 1) {
      assert.equal(service.shouldRecompute(), false);
    }

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

  it('persists overrides to SQLite and reloads them on construction', () => {
    for (let index = 0; index < 5; index += 1) {
      feedbackRepo.insert(buildFeedback({
        id: `used-persist-${index}`,
        strategy: 'semantic',
        signal: 'used',
        memoryId: `memory-used-persist-${index}`,
      }));
    }
    feedbackRepo.insert(buildFeedback({
      id: 'ignored-persist-1',
      strategy: 'semantic',
      signal: 'ignored',
      memoryId: 'memory-ignored-persist-1',
    }));

    const result = service.recompute();
    const row = db.prepare(`
      SELECT type_grade_key, decay_multiplier, sample_count, last_updated
      FROM tuning_overrides
      WHERE type_grade_key = ?
    `).get('semantic') as {
      type_grade_key: string;
      decay_multiplier: number;
      sample_count: number;
      last_updated: string;
    } | undefined;

    assert.deepEqual(row, {
      type_grade_key: 'semantic',
      decay_multiplier: result.overrides[0]?.decayMultiplier,
      sample_count: 6,
      last_updated: result.overrides[0]?.lastUpdated,
    });

    const reloaded = new SelfTuningDecayService(feedbackRepo, db);
    assert.equal(reloaded.getDecayMultiplier('semantic'), result.overrides[0]?.decayMultiplier);
    assert.equal(reloaded.getOverrides()[0]?.sampleCount, 6);
  });
});
