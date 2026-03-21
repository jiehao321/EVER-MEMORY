import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type Database from 'better-sqlite3';
import { PredictiveContextService } from '../../../src/core/memory/predictiveContext.js';
import { IntentRepository } from '../../../src/storage/intentRepo.js';
import { MemoryRepository } from '../../../src/storage/memoryRepo.js';
import type { IntentRecord } from '../../../src/types/intent.js';
import { buildMemory, createInMemoryDb, nowIso } from '../../storage/helpers.js';

function buildIntent(overrides: Partial<IntentRecord> & { id: string }): IntentRecord {
  return {
    id: overrides.id,
    sessionId: overrides.sessionId ?? 'session-1',
    messageId: overrides.messageId,
    createdAt: overrides.createdAt ?? nowIso(),
    rawText: overrides.rawText ?? 'remember my formatting preference',
    intent: {
      type: overrides.intent?.type ?? 'instruction',
      subtype: overrides.intent?.subtype,
      confidence: overrides.intent?.confidence ?? 0.9,
    },
    signals: {
      urgency: overrides.signals?.urgency ?? 'low',
      emotionalTone: overrides.signals?.emotionalTone ?? 'neutral',
      actionNeed: overrides.signals?.actionNeed ?? 'none',
      memoryNeed: overrides.signals?.memoryNeed ?? 'targeted',
      preferenceRelevance: overrides.signals?.preferenceRelevance ?? 0.8,
      correctionSignal: overrides.signals?.correctionSignal ?? 0,
    },
    entities: overrides.entities ?? [],
    retrievalHints: overrides.retrievalHints ?? {
      preferredTypes: [],
      preferredScopes: [],
      preferredTimeBias: 'balanced',
    },
  };
}

describe('PredictiveContextService', () => {
  let db: Database.Database;
  let memoryRepo: MemoryRepository;
  let intentRepo: IntentRepository;
  let service: PredictiveContextService;

  beforeEach(() => {
    db = createInMemoryDb();
    memoryRepo = new MemoryRepository(db);
    intentRepo = new IntentRepository(db);
    service = new PredictiveContextService(intentRepo, memoryRepo);
  });

  afterEach(() => {
    db.close();
  });

  it('returns empty predictions with no recent intent history', () => {
    const result = service.buildPredictiveCache('s1');

    assert.deepEqual(result, {
      predictions: [],
      total: 0,
      patternsAnalyzed: 0,
    });
    assert.deepEqual(service.getCachedPredictions('s1'), []);
  });

  it('builds and caches predictions from repeated recent intents', () => {
    memoryRepo.insert(buildMemory({
      id: 'pref-1',
      type: 'preference',
      content: 'user prefers concise answers',
      scope: { userId: 'user-1', global: false },
      scores: { confidence: 0.8, importance: 0.9, explicitness: 1 },
    }));
    memoryRepo.insert(buildMemory({
      id: 'constraint-1',
      type: 'constraint',
      content: 'never expose secrets',
      scope: { userId: 'user-1', global: false },
      scores: { confidence: 0.8, importance: 0.7, explicitness: 1 },
    }));

    const listRecent = () => [
      buildIntent({ id: 'i1', intent: { type: 'instruction', confidence: 0.95 }, signals: { memoryNeed: 'deep' } as IntentRecord['signals'] }),
      buildIntent({ id: 'i2', intent: { type: 'instruction', confidence: 0.9 }, signals: { memoryNeed: 'targeted' } as IntentRecord['signals'] }),
      buildIntent({ id: 'i3', intent: { type: 'question', confidence: 0.8 }, signals: { memoryNeed: 'light' } as IntentRecord['signals'] }),
    ];
    Object.assign(intentRepo as object, { listRecent });

    const result = service.buildPredictiveCache('s1', { userId: 'user-1' });
    const cached = service.getCachedPredictions('s1');

    assert.equal(result.total, 2);
    assert.equal(result.patternsAnalyzed, 3);
    assert.equal(cached.length, 2);
    assert.deepEqual(cached.map((item) => item.memory.id), ['pref-1', 'constraint-1']);
    assert.ok(cached.every((item) => item.reason === 'pattern:instruction'));
  });

  it('clears cached predictions for a session', () => {
    Object.assign(intentRepo as object, {
      listRecent: () => [buildIntent({ id: 'i1' }), buildIntent({ id: 'i2' })],
    });
    memoryRepo.insert(buildMemory({ id: 'pref-1', type: 'preference', scope: { userId: 'user-1', global: false } }));

    service.buildPredictiveCache('s1', { userId: 'user-1' });
    service.clearCache('s1');

    assert.deepEqual(service.getCachedPredictions('s1'), []);
  });
});
