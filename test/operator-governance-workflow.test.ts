import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import { createTempDbPath } from './helpers.js';

test('operator workflow A: review → explain → restore → recall', async () => {
  const databasePath = createTempDbPath('operator-workflow-a');
  const app = initializeEverMemory({ databasePath });

  try {
    const scope = { userId: 'operator-workflow-user-a', project: 'governance-lab' };
    const project = app.evermemoryStore({
      content: 'Operator workflow项目：验证完整治理链路。',
      type: 'project',
      scope,
    });
    const decision = app.evermemoryStore({
      content: 'Operator workflow决策：归档后允许人工恢复。',
      type: 'decision',
      scope,
    });
    const constraint = app.evermemoryStore({
      content: 'Operator workflow约束：恢复前先运行 explain + review。',
      type: 'constraint',
      scope,
    });
    assert.equal(project.accepted, true);
    assert.equal(decision.accepted, true);
    assert.equal(constraint.accepted, true);

    const archivedId = decision.memory?.id ?? '';
    assert.ok(archivedId.length > 0);
    const archivedMemory = app.memoryRepo.findById(archivedId);
    assert.ok(archivedMemory);
    const archivedTimestamp = new Date().toISOString();
    app.memoryRepo.update({
      ...archivedMemory!,
      timestamps: {
        ...archivedMemory!.timestamps,
        updatedAt: archivedTimestamp,
      },
      state: {
        ...archivedMemory!.state,
        active: false,
        archived: true,
      },
    });
    app.debugRepo.log('memory_archived', archivedId, {
      reason: 'operator_workflow_manual',
      previousLifecycle: archivedMemory?.lifecycle,
      scope,
    });

    const review = app.evermemoryReview({ scope, limit: 5 });
    assert.equal(review.total, 1);
    assert.equal(review.candidates[0]?.id, archivedId);
    assert.equal(review.candidates[0]?.restoreEligible, true);

    const archiveExplain = app.evermemoryExplain({ topic: 'archive', limit: 10 });
    assert.ok(archiveExplain.items.some((item) =>
      item.kind === 'memory_archived'
      && item.entityId === archivedId
      && item.meta?.reason === 'operator_workflow_manual'));

    const restore = app.evermemoryRestore({
      ids: [archivedId],
      mode: 'apply',
      approved: true,
      targetLifecycle: 'semantic',
    });
    assert.equal(restore.applied, true);
    assert.ok(restore.appliedAt);
    assert.ok(!Number.isNaN(Date.parse(restore.appliedAt ?? '')));
    assert.ok(restore.userImpact);
    assert.ok(restore.userImpact?.affectedUserIds.includes(scope.userId));
    assert.equal(restore.userImpact?.restoredByType.decision, 1);
    assert.ok(restore.restored >= 1);

    const recall = await app.evermemoryRecall({
      query: '允许人工恢复',
      scope,
      limit: 5,
    });
    assert.ok(recall.total >= 1);
    assert.ok(recall.items.some((item) => item.id === archivedId));
  } finally {
    app.database.connection.close();
    rmSync(databasePath, { force: true });
  }
});

test('operator workflow B: sessionEnd rule promotion → explain → deprecate loop', async () => {
  const databasePath = createTempDbPath('operator-workflow-b');
  const app = initializeEverMemory({ databasePath });

  try {
    const scope = { userId: 'operator-workflow-user-b', project: 'governance-lab' };

    await app.messageReceived({
      sessionId: 'ops-session-b-1',
      messageId: 'ops-msg-b-0',
      text: '项目推进计划：先做质量门禁，再推进下一阶段。',
      scope,
    });

    const sessionResult = app.sessionEnd({
      sessionId: 'ops-session-b-1',
      messageId: 'ops-msg-b-1',
      scope,
      inputText: '更正一下，先确认再执行。',
      actionSummary: '直接执行了高风险动作',
      outcomeSummary: '用户要求先确认',
      evidenceRefs: ['ops-msg-b-1'],
    });
    const promotedRule = sessionResult.promotedRules?.[0];
    assert.ok(promotedRule);
    const ruleId = promotedRule!.id;

    const activeRules = app.evermemoryRules({
      scope: { userId: scope.userId },
      intentType: 'instruction',
      limit: 8,
    });
    assert.ok(activeRules.rules.some((rule) => rule.id === ruleId));

    const explainBefore = app.evermemoryExplain({ topic: 'rule', limit: 10 });
    assert.ok(explainBefore.items.some((item) => item.entityId === ruleId && item.kind === 'rule_promoted'));

    const deprecate = app.evermemoryRules({
      action: 'deprecate',
      ruleId,
      reason: 'Operator确认新的人工流程替代该规则。',
      includeInactive: true,
      includeDeprecated: true,
      includeFrozen: true,
    });
    assert.equal(deprecate.mutation?.changed, true);
    assert.equal(deprecate.mutation?.rule?.state.deprecated, true);

    const explainAfter = app.evermemoryExplain({ topic: 'rule', limit: 10 });
    assert.ok(explainAfter.items.some((item) => item.entityId === ruleId && item.kind === 'rule_deprecated'));

    const afterRules = app.evermemoryRules({
      scope: { userId: scope.userId },
      intentType: 'instruction',
      limit: 8,
    });
    assert.equal(afterRules.rules.some((rule) => rule.id === ruleId), false);
  } finally {
    app.database.connection.close();
    rmSync(databasePath, { force: true });
  }
});
