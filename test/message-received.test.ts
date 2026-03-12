import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import { createTempDbPath } from './helpers.js';

test('messageReceived performs intent-guided recall and updates interaction runtime context', () => {
  const databasePath = createTempDbPath('message-received');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({
    content: '项目计划：先做 Phase 2A，再做 Phase 2B。',
    scope: { userId: 'u-message-1', project: 'evermemory' },
    type: 'project',
  });
  app.evermemoryStore({
    content: '本项目约束：优先稳定性和可解释性。',
    scope: { userId: 'u-message-1', project: 'evermemory' },
    type: 'constraint',
  });

  const result = app.messageReceived({
    sessionId: 'session-message-1',
    messageId: 'msg-1',
    text: '结合之前的项目计划，继续推进下一步。',
    scope: { userId: 'u-message-1', project: 'evermemory' },
  });

  assert.equal(result.intent.intent.type, 'planning');
  assert.ok(result.intent.signals.memoryNeed === 'deep' || result.intent.signals.memoryNeed === 'targeted');
  assert.ok(result.recall.total >= 1);

  const interaction = app.getRuntimeInteractionContext('session-message-1');
  assert.ok(interaction);
  assert.equal(interaction?.messageId, 'msg-1');
  assert.equal(interaction?.intent.id, result.intent.id);
  assert.equal(interaction?.recalledItems.length, result.recall.total);

  const processedEvents = app.debugRepo.listRecent('interaction_processed', 20);
  assert.ok(processedEvents.length >= 1);

  const noneResult = app.messageReceived({
    sessionId: 'session-message-1',
    messageId: 'msg-2',
    text: 'ok',
    scope: { userId: 'u-message-1', project: 'evermemory' },
  });
  assert.equal(noneResult.recall.total, 0);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});
