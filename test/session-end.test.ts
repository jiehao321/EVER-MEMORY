import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import { createTempDbPath } from './helpers.js';

test('sessionEnd writes experience and can trigger lightweight reflection', () => {
  const databasePath = createTempDbPath('session-end');
  const app = initializeEverMemory({ databasePath });

  app.messageReceived({
    sessionId: 'session-end-1',
    messageId: 'session-end-msg-0',
    text: '项目推进计划：先做质量门禁，再推进下一阶段。',
    scope: { userId: 'u-session-end-1', project: 'evermemory' },
  });

  const result = app.sessionEnd({
    sessionId: 'session-end-1',
    messageId: 'session-end-msg-1',
    scope: { userId: 'u-session-end-1', project: 'evermemory' },
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
  assert.ok((result.autoMemory?.generated ?? 0) >= 1);
  assert.ok((result.autoMemory?.accepted ?? 0) >= 1);

  const autoMemories = app.memoryRepo.search({
    scope: { userId: 'u-session-end-1', project: 'evermemory' },
    types: ['project', 'constraint', 'decision'],
    archived: false,
    activeOnly: true,
    limit: 20,
  });
  assert.ok(autoMemories.length >= 1);
  assert.ok(autoMemories.some((item) => item.source.kind === 'summary'));

  const followup = app.sessionStart({
    sessionId: 'session-end-2',
    userId: 'u-session-end-1',
    project: 'evermemory',
  });
  assert.ok(followup.briefing.sections.recentContinuity.length >= 1);

  const reflectTool = app.evermemoryReflect({ sessionId: 'session-end-1', mode: 'light' });
  assert.ok(reflectTool.summary.processedExperiences >= 1);

  const status = app.evermemoryStatus({ userId: 'u-session-end-1', sessionId: 'session-end-1' });
  assert.ok((status.experienceCount ?? 0) >= 1);
  assert.ok((status.reflectionCount ?? 0) >= 1);
  assert.ok((status.activeRuleCount ?? 0) >= 1);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('sessionEnd auto memory extraction prefers intent raw text and skips operator policy noise', () => {
  const databasePath = createTempDbPath('session-end-noise');
  const app = initializeEverMemory({ databasePath });

  app.messageReceived({
    sessionId: 'session-end-noise-1',
    messageId: 'session-end-noise-msg-0',
    text: '[Fri 2026-03-13 10:44 GMT+8] 项目代号CLEANMEM-1，先修复记忆保存，再做记忆衰减。',
    scope: { userId: 'u-session-end-noise', project: 'evermemory' },
  });

  const result = app.sessionEnd({
    sessionId: 'session-end-noise-1',
    messageId: 'session-end-noise-msg-1',
    scope: { userId: 'u-session-end-noise', project: 'evermemory' },
    inputText: 'Skills store policy (operator configured): Do not claim exclusivity.',
    actionSummary: '[[reply_to_current]] 确认：项目代号CLEANMEM-1，顺序先保存后衰减。',
    outcomeSummary: 'run_success',
    evidenceRefs: ['session-end-noise-msg-1'],
  });

  assert.ok((result.autoMemory?.accepted ?? 0) >= 1);

  const autoMemories = app.memoryRepo.search({
    scope: { userId: 'u-session-end-noise', project: 'evermemory' },
    archived: false,
    activeOnly: true,
    limit: 20,
  });
  assert.ok(autoMemories.length >= 1);
  assert.ok(autoMemories.some((item) => item.content.includes('CLEANMEM-1')));
  assert.ok(autoMemories.every((item) => !item.content.includes('Skills store policy')));

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});
