import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import { createTempDbPath } from './helpers.js';

test('sessionEnd writes experience and can trigger lightweight reflection', () => {
  const databasePath = createTempDbPath('session-end');
  const app = initializeEverMemory({ databasePath });

  const result = app.sessionEnd({
    sessionId: 'session-end-1',
    messageId: 'session-end-msg-1',
    inputText: '更正一下，先确认再执行。',
    actionSummary: '直接执行了高风险动作',
    outcomeSummary: '用户要求先确认',
    evidenceRefs: ['session-end-msg-1'],
  });

  assert.equal(result.sessionId, 'session-end-1');
  assert.ok(result.experience.id.length > 0);
  assert.ok(result.reflection);
  assert.ok((result.promotedRules?.length ?? 0) >= 1);
  assert.equal(result.reflection?.state.promoted, true);

  const reflectTool = app.evermemoryReflect({ sessionId: 'session-end-1', mode: 'light' });
  assert.ok(reflectTool.summary.processedExperiences >= 1);

  const status = app.evermemoryStatus({ sessionId: 'session-end-1' });
  assert.ok((status.experienceCount ?? 0) >= 1);
  assert.ok((status.reflectionCount ?? 0) >= 1);
  assert.ok((status.activeRuleCount ?? 0) >= 1);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});
