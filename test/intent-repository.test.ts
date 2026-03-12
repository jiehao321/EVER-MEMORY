import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { openDatabase, closeDatabase } from '../src/storage/db.js';
import { runMigrations } from '../src/storage/migrations.js';
import { IntentRepository } from '../src/storage/intentRepo.js';
import type { IntentRecord } from '../src/types.js';
import { createTempDbPath } from './helpers.js';

function buildIntent(id: string, rawText: string, sessionId: string): IntentRecord {
  return {
    id,
    sessionId,
    createdAt: new Date().toISOString(),
    rawText,
    intent: {
      type: 'planning',
      confidence: 0.9,
    },
    signals: {
      urgency: 'low',
      emotionalTone: 'neutral',
      actionNeed: 'analysis',
      memoryNeed: 'targeted',
      preferenceRelevance: 0.2,
      correctionSignal: 0.1,
    },
    entities: [],
    retrievalHints: {
      preferredTypes: ['project', 'task'],
      preferredScopes: ['session', 'user'],
      preferredTimeBias: 'balanced',
    },
  };
}

test('intent repository can insert/find/list by session', () => {
  const databasePath = createTempDbPath('intent-repo');
  const db = openDatabase(databasePath);
  runMigrations(db.connection);
  const repo = new IntentRepository(db.connection);

  const first = buildIntent(randomUUID(), '先做 Phase 2A。', 'sess-1');
  const second = buildIntent(randomUUID(), '再做 Phase 2B。', 'sess-1');
  const third = buildIntent(randomUUID(), '别的会话。', 'sess-2');

  repo.insert(first);
  repo.insert(second);
  repo.insert(third);

  const found = repo.findById(first.id);
  assert.ok(found);
  assert.equal(found?.id, first.id);
  assert.equal(found?.intent.type, 'planning');

  const recent = repo.listRecentBySession('sess-1', 10);
  assert.equal(recent.length, 2);
  assert.ok(recent.every((item) => item.sessionId === 'sess-1'));

  closeDatabase(db);
  rmSync(databasePath, { force: true });
});
