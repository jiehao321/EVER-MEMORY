import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import { createTempDbPath } from './helpers.js';

test('evermemory_explain explains write, retrieval, and rule decisions', async () => {
  const databasePath = createTempDbPath('explain-tool');
  const app = initializeEverMemory({ databasePath });

  const accepted = app.evermemoryStore({
    content: '部署前先确认回滚方案。',
    scope: { userId: 'u-explain-1' },
    type: 'constraint',
  });
  const rejected = app.evermemoryStore({
    content: 'ok',
    scope: { userId: 'u-explain-1' },
  });
  app.evermemoryStore({
    content: '一旦监控出现高误报，需要记录前因后果方便回溯。',
    scope: { userId: 'u-explain-1' },
    type: 'decision',
  });
  assert.equal(accepted.accepted, true);
  assert.equal(rejected.accepted, false);

  await app.evermemoryRecall({
    query: '回滚',
    scope: { userId: 'u-explain-1' },
    limit: 5,
  });
  await app.evermemoryRecall({
    query: '监控',
    scope: { userId: 'u-explain-1' },
    limit: 3,
  });

  await app.sessionEnd({
    sessionId: 'session-explain-1',
    scope: { userId: 'u-explain-1' },
    inputText: '更正一下，执行前必须先确认',
    actionSummary: '修正执行顺序',
    outcomeSummary: '用户确认通过',
  });

  const writeExplain = app.evermemoryExplain({
    topic: 'write',
    limit: 10,
  });
  assert.ok(writeExplain.total >= 2);
  assert.ok(writeExplain.items.some((item) => item.kind === 'memory_write_decision'));
  assert.ok(writeExplain.items.some((item) => item.kind === 'memory_write_rejected'));
  assert.ok(writeExplain.items.every((item) => item.meta));

  const acceptedMemoryId = accepted.memory?.id;
  assert.ok(acceptedMemoryId);
  const writeExplainScoped = app.evermemoryExplain({
    topic: 'write',
    entityId: acceptedMemoryId,
    limit: 10,
  });
  assert.ok(writeExplainScoped.total >= 1);
  assert.ok(writeExplainScoped.items.every((item) => item.entityId === acceptedMemoryId));
  assert.ok(writeExplainScoped.items.every((item) => item.meta?.reason));

  const retrievalExplain = app.evermemoryExplain({
    topic: 'retrieval',
    limit: 5,
  });
  assert.ok(retrievalExplain.total >= 1);
  assert.ok(retrievalExplain.items.every((item) => item.kind === 'retrieval_executed'));
  assert.ok(retrievalExplain.items.every((item) => item.meta?.categories?.includes('retrieval')));

  const promotedRuleId = app.evermemoryExplain({ topic: 'rule', limit: 10 }).items.find((item) => item.kind === 'rule_promoted')?.entityId;
  if (promotedRuleId) {
    app.evermemoryRules({
      action: 'freeze',
      ruleId: promotedRuleId,
      reason: '测试冻结链路',
      limit: 5,
      includeFrozen: true,
      includeInactive: true,
    });
  }

  const ruleExplain = app.evermemoryExplain({
    topic: 'rule',
    limit: 10,
  });
  assert.ok(ruleExplain.total >= 1);
  assert.ok(ruleExplain.items.every((item) =>
    item.kind === 'rule_promoted'
    || item.kind === 'rule_rejected'
    || item.kind === 'rule_frozen'
    || item.kind === 'rule_deprecated'
    || item.kind === 'rule_rolled_back'));

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('evermemory_explain covers session and archive topics', async () => {
  const databasePath = createTempDbPath('explain-session-archive');
  const app = initializeEverMemory({ databasePath });

  await app.sessionEnd({
    sessionId: 'session-explain-2',
    scope: { userId: 'u-explain-2' },
    inputText: '项目状态更新：Phoenix 进入测试阶段，后续需要补充回滚方案。',
    actionSummary: '同步项目状态与关键风险',
    outcomeSummary: '团队知悉风险',
  });

  const sessionExplain = app.evermemoryExplain({
    topic: 'session',
    limit: 5,
  });
  assert.ok(sessionExplain.total >= 1);
  const sessionItem = sessionExplain.items.find((item) => item.kind === 'session_end_processed');
  assert.ok(sessionItem);
  const ensuredSessionItem = sessionItem!;
  assert.ok(ensuredSessionItem.meta?.categories?.includes('session'));
  assert.ok(typeof ensuredSessionItem.evidence.autoMemoryGenerated === 'number');

  const archivedId = 'memory-archive-test';
  app.debugRepo.log('memory_archived', archivedId, {
    reason: 'decay_threshold',
    previousLifecycle: 'episodic',
    decayScore: 0.42,
  });
  const requestedIds = ['restore-a', 'restore-b'];
  const restorableIds = ['restore-a'];
  app.debugRepo.log('memory_restore_reviewed', undefined, {
    mode: 'apply',
    approved: true,
    applied: false,
    total: 2,
    restorable: 1,
    rejected: 1,
    targetLifecycle: 'episodic',
    allowSuperseded: false,
    requestedIds,
    restorableIds,
    reason: 'pending_apply',
  });
  app.debugRepo.log('memory_restore_applied', undefined, {
    mode: 'apply',
    approved: true,
    applied: true,
    total: 2,
    restorable: 1,
    restored: 1,
    rejected: 1,
    targetLifecycle: 'episodic',
    allowSuperseded: false,
    requestedIds,
    restorableIds,
    restoredIds: restorableIds,
  });

  const archiveExplain = app.evermemoryExplain({
    topic: 'archive',
    limit: 10,
  });
  assert.ok(archiveExplain.items.some((item) => item.kind === 'memory_archived' && item.meta?.reason === 'decay_threshold'));
  assert.ok(archiveExplain.items.some((item) => item.kind.startsWith('memory_restore') && item.meta?.categories?.includes('restore')));

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});
