import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import { createTempDbPath } from './helpers.js';

test('sessionStart builds briefing and stores runtime context', () => {
  const databasePath = createTempDbPath('session-start');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({
    content: '叫我 Alex',
    scope: { userId: 'user-1' },
  });

  const result = app.sessionStart({
    sessionId: 'session-1',
    userId: 'user-1',
    chatId: 'chat-1',
  });

  assert.equal(result.sessionId, 'session-1');
  assert.ok(Array.isArray(result.briefing.sections.identity));

  const runtime = app.getRuntimeSessionContext('session-1');
  assert.ok(runtime);
  assert.equal(runtime?.sessionId, 'session-1');
  assert.ok(runtime?.bootBriefing);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});
