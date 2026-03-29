import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { openDatabase, closeDatabase } from '../src/storage/db.js';
import { runMigrations } from '../src/storage/migrations.js';
import { FeedbackRepository } from '../src/storage/feedbackRepo.js';
import type { RetrievalFeedback } from '../src/types/feedback.js';
import { createTempDbPath } from './helpers.js';

function buildFeedback(overrides: Partial<RetrievalFeedback> = {}): RetrievalFeedback {
  return {
    id: overrides.id ?? 'fb-1',
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

test('feedback repository stores, updates, and aggregates retrieval feedback', () => {
  const databasePath = createTempDbPath('feedback-repo');
  const db = openDatabase(databasePath);
  runMigrations(db.connection);

  const repo = new FeedbackRepository(db.connection);
  repo.insert(buildFeedback());
  repo.insert(buildFeedback({
    id: 'fb-2',
    memoryId: 'memory-2',
    strategy: 'keyword',
    recallRank: 2,
    score: 0.55,
    createdAt: '2026-03-20T00:00:00.000Z',
  }));

  repo.updateSignal('fb-1', 'used', 'explicit');
  repo.updateSignalBySessionMemory('session-1', 'memory-2', 'ignored', 'session_end_implicit');

  const bySession = repo.findBySession('session-1');
  const byMemory = repo.findByMemory('memory-2');
  const aggregates = repo.aggregateByStrategy(3650);

  assert.equal(repo.count(), 2);
  assert.equal(bySession.length, 2);
  assert.equal(bySession[0]?.id, 'fb-1');
  assert.equal(bySession[0]?.signal, 'used');
  assert.equal(byMemory.length, 1);
  assert.equal(byMemory[0]?.signal, 'ignored');

  assert.deepEqual(aggregates, [
    {
      strategy: 'hybrid',
      totalUsed: 1,
      totalIgnored: 0,
      totalUnknown: 0,
      effectiveness: 1,
    },
    {
      strategy: 'keyword',
      totalUsed: 0,
      totalIgnored: 1,
      totalUnknown: 0,
      effectiveness: 0,
    },
  ]);

  closeDatabase(db);
  rmSync(databasePath, { force: true });
});
