import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import { createTempDbPath } from './helpers.js';

test('intent service writes deterministic intent records and debug events', () => {
  const databasePath = createTempDbPath('intent-service');
  const app = initializeEverMemory({ databasePath });

  const correction = app.analyzeIntent({
    text: '更正一下，不是 A 方案，改成 B 方案。',
    sessionId: 'session-1',
    messageId: 'message-1',
    scope: { userId: 'user-1' },
  });

  assert.equal(correction.intent.type, 'correction');
  assert.equal(correction.signals.memoryNeed, 'targeted');
  assert.ok(correction.intent.confidence >= 0.9);

  const planning = app.analyzeIntent({
    text: '请给我一个 Phase 2 的落地计划。',
    sessionId: 'session-1',
    scope: { userId: 'user-1', project: 'evermemory' },
  });

  assert.equal(planning.intent.type, 'planning');
  assert.equal(planning.signals.actionNeed, 'analysis');
  assert.ok(planning.retrievalHints.preferredTypes.includes('project'));
  assert.ok(planning.retrievalHints.preferredScopes.includes('project'));

  const persisted = app.intentRepo.findById(correction.id);
  assert.ok(persisted);
  assert.equal(persisted?.intent.type, 'correction');

  const debugEvents = app.debugRepo.listRecent('intent_generated', 20);
  assert.ok(debugEvents.length >= 2);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});
