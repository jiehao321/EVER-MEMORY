import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import { createTempDbPath } from './helpers.js';

test('evermemory_explain explains write, retrieval, and rule decisions', () => {
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
  assert.equal(accepted.accepted, true);
  assert.equal(rejected.accepted, false);

  app.evermemoryRecall({
    query: '回滚',
    scope: { userId: 'u-explain-1' },
    limit: 5,
  });

  app.sessionEnd({
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

  const acceptedMemoryId = accepted.memory?.id;
  assert.ok(acceptedMemoryId);
  const writeExplainScoped = app.evermemoryExplain({
    topic: 'write',
    entityId: acceptedMemoryId,
    limit: 10,
  });
  assert.ok(writeExplainScoped.total >= 1);
  assert.ok(writeExplainScoped.items.every((item) => item.entityId === acceptedMemoryId));

  const retrievalExplain = app.evermemoryExplain({
    topic: 'retrieval',
    limit: 5,
  });
  assert.ok(retrievalExplain.total >= 1);
  assert.ok(retrievalExplain.items.every((item) => item.kind === 'retrieval_executed'));

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
