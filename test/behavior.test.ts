import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { initializeEverMemory } from '../src/index.js';
import type { BehaviorRule, ReflectionRecord } from '../src/types.js';
import { createTempDbPath } from './helpers.js';

function nowIso(): string {
  return new Date().toISOString();
}

function makeRule(input: Partial<BehaviorRule> & Pick<BehaviorRule, 'statement' | 'category' | 'priority'>): BehaviorRule {
  const timestamp = input.createdAt ?? nowIso();
  return {
    id: input.id ?? randomUUID(),
    statement: input.statement,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
    appliesTo: {
      userId: input.appliesTo?.userId,
      channel: input.appliesTo?.channel,
      intentTypes: input.appliesTo?.intentTypes ?? [],
      contexts: input.appliesTo?.contexts ?? [],
    },
    category: input.category,
    priority: input.priority,
    evidence: {
      reflectionIds: input.evidence?.reflectionIds ?? ['reflection-seed'],
      memoryIds: input.evidence?.memoryIds ?? [],
      confidence: input.evidence?.confidence ?? 0.9,
      recurrenceCount: input.evidence?.recurrenceCount ?? 2,
    },
    lifecycle: {
      level: input.lifecycle?.level ?? 'baseline',
      maturity: input.lifecycle?.maturity ?? 'emerging',
      applyCount: input.lifecycle?.applyCount ?? 0,
      contradictionCount: input.lifecycle?.contradictionCount ?? 0,
      lastAppliedAt: input.lifecycle?.lastAppliedAt,
      lastContradictedAt: input.lifecycle?.lastContradictedAt,
      lastReviewedAt: input.lifecycle?.lastReviewedAt,
      stale: input.lifecycle?.stale ?? false,
      staleness: input.lifecycle?.staleness ?? 'fresh',
      decayScore: input.lifecycle?.decayScore ?? 0,
      frozenAt: input.lifecycle?.frozenAt,
      freezeReason: input.lifecycle?.freezeReason,
      expiresAt: input.lifecycle?.expiresAt,
    },
    state: {
      active: input.state?.active ?? true,
      deprecated: input.state?.deprecated ?? false,
      frozen: input.state?.frozen ?? false,
      supersededBy: input.state?.supersededBy,
      statusReason: input.state?.statusReason,
      statusSourceReflectionId: input.state?.statusSourceReflectionId,
      statusChangedAt: input.state?.statusChangedAt,
    },
    trace: input.trace,
  };
}

test('behavior promotion writes lifecycle governance metadata and rejects duplicates', () => {
  const databasePath = createTempDbPath('behavior-promotion');
  const app = initializeEverMemory({ databasePath });

  const exp1 = app.experienceService.log({
    sessionId: 'session-behavior-1',
    inputText: '更正一下，执行前先确认。',
    actionSummary: '生产部署操作',
    outcomeSummary: '用户确认通过',
    evidenceRefs: ['msg-behavior-1'],
  });
  const exp2 = app.experienceService.log({
    sessionId: 'session-behavior-1',
    inputText: '再次更正，先确认再执行。',
    actionSummary: '高风险外部动作',
    outcomeSummary: '用户认可',
    evidenceRefs: ['msg-behavior-2'],
  });

  const reflection = app.reflectionService.reflect({
    triggerKind: 'manual-review',
    sessionId: 'session-behavior-1',
    experienceIds: [exp1.id, exp2.id],
    mode: 'light',
  }).reflection;

  assert.ok(reflection);

  const first = app.behaviorService.promoteFromReflection({
    reflectionId: reflection!.id,
    appliesTo: {
      userId: 'user-behavior-1',
      intentTypes: ['planning'],
    },
  });
  assert.ok(first.promotedRules.length >= 1);
  assert.equal(first.reflectionId, reflection!.id);
  assert.ok(first.promotedRules[0]?.lifecycle.level);
  assert.ok(first.promotedRules[0]?.lifecycle.maturity);

  const second = app.behaviorService.promoteFromReflection({
    reflectionId: reflection!.id,
    appliesTo: {
      userId: 'user-behavior-1',
      intentTypes: ['planning'],
    },
  });
  assert.equal(second.promotedRules.length, 0);
  assert.ok(second.rejected.some((item) => item.reason === 'duplicate_rule'));

  const promotedEvents = app.debugRepo.listRecent('rule_promoted', 20);
  const rejectedEvents = app.debugRepo.listRecent('rule_rejected', 20);
  assert.ok(promotedEvents.length >= 1);
  assert.ok(rejectedEvents.length >= 1);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('sessionStart/messageReceived inject matching behavior rules and increment apply counters', async () => {
  const databasePath = createTempDbPath('behavior-runtime');
  const app = initializeEverMemory({ databasePath });

  const globalRule = makeRule({
    statement: '涉及关键动作时先确认目标再执行。',
    category: 'confirmation',
    priority: 70,
  });
  const userRule = makeRule({
    statement: '该用户会话中保持简洁执行风格。',
    category: 'style',
    priority: 82,
    appliesTo: {
      userId: 'user-runtime-1',
      intentTypes: [],
      contexts: [],
    },
  });
  const planningRule = makeRule({
    statement: '推进计划类请求时先输出分阶段方案。',
    category: 'planning',
    priority: 91,
    appliesTo: {
      userId: 'user-runtime-1',
      intentTypes: ['planning'],
      contexts: [],
    },
  });

  app.behaviorRepo.insert(globalRule);
  app.behaviorRepo.insert(userRule);
  app.behaviorRepo.insert(planningRule);

  const start = app.sessionStart({
    sessionId: 'session-runtime-1',
    userId: 'user-runtime-1',
    chatId: 'chat-runtime-1',
  });
  assert.ok((start.behaviorRules?.length ?? 0) >= 2);

  const runtime = app.getRuntimeSessionContext('session-runtime-1');
  assert.ok(runtime?.activeBehaviorRules);

  const messageResult = await app.messageReceived({
    sessionId: 'session-runtime-1',
    messageId: 'msg-runtime-1',
    text: '请给我下一阶段计划，继续推进。',
    scope: { userId: 'user-runtime-1', project: 'evermemory' },
  });
  assert.ok((messageResult.behaviorRules?.length ?? 0) >= 2);
  assert.equal(messageResult.behaviorRules?.[0]?.id, planningRule.id);
  assert.ok((messageResult.behaviorRules?.[0]?.lifecycle.applyCount ?? 0) >= 1);

  const interaction = app.getRuntimeInteractionContext('session-runtime-1');
  assert.ok(interaction?.appliedBehaviorRules);
  assert.equal(interaction?.appliedBehaviorRules?.[0]?.id, planningRule.id);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('behavior lifecycle decays stale rules and freezes contradicted/conflicting rules', () => {
  const databasePath = createTempDbPath('behavior-governance');
  const app = initializeEverMemory({ databasePath });
  const oldIso = new Date(Date.now() - 75 * 24 * 60 * 60 * 1000).toISOString();

  const staleRule = makeRule({
    statement: '老旧规则长期未命中时应被降权。',
    category: 'planning',
    priority: 88,
    createdAt: oldIso,
    updatedAt: oldIso,
    lifecycle: {
      level: 'baseline',
      maturity: 'validated',
      applyCount: 0,
      contradictionCount: 0,
      lastAppliedAt: oldIso,
      lastReviewedAt: oldIso,
      stale: false,
      staleness: 'fresh',
      decayScore: 0,
    },
  });
  app.behaviorRepo.insert(staleRule);

  const refreshed = app.behaviorRepo.findById(staleRule.id);
  assert.ok(refreshed);
  assert.equal(refreshed!.lifecycle.stale, true);
  assert.equal(refreshed!.lifecycle.staleness, 'expired');
  assert.ok(refreshed!.priority < staleRule.priority);

  const replacementForStaleRule = makeRule({
    statement: '高风险老旧规则被回滚时，必须由新规则显式接替。',
    category: 'safety',
    priority: 94,
  });
  app.behaviorRepo.insert(replacementForStaleRule);

  const contradicted = app.behaviorService.mutateRule({
    action: 'rollback',
    ruleId: refreshed!.id,
    reason: '用户明确纠正旧规则',
    reflectionId: 'reflection-rollback-1',
    replacementRuleId: replacementForStaleRule.id,
  });
  assert.equal(contradicted.changed, true);
  assert.ok((contradicted.rule?.lifecycle.contradictionCount ?? 0) >= 1);
  assert.equal(contradicted.rule?.state.frozen, true);
  assert.equal(contradicted.rule?.state.supersededBy, replacementForStaleRule.id);

  const existingRule = makeRule({
    statement: '高风险动作无需确认，直接执行。',
    category: 'execution',
    priority: 70,
    appliesTo: {
      userId: 'user-conflict-1',
      intentTypes: ['instruction'],
      contexts: [],
    },
  });
  app.behaviorRepo.insert(existingRule);

  const reflection: ReflectionRecord = {
    id: randomUUID(),
    createdAt: nowIso(),
    trigger: {
      kind: 'manual-review',
      experienceIds: [],
    },
    analysis: {
      category: 'risk-control',
      summary: 'Need stricter confirmation before risky actions.',
      nextTimeRecommendation: '先确认再执行。',
    },
    evidence: {
      refs: ['msg-conflict-1'],
      confidence: 0.9,
      recurrenceCount: 2,
    },
    candidateRules: ['高风险动作先确认后执行。'],
    state: {
      promoted: false,
      rejected: false,
    },
  };
  app.reflectionRepo.insert(reflection);

  const result = app.behaviorService.promoteFromReflection({
    reflectionId: reflection.id,
    appliesTo: {
      userId: 'user-conflict-1',
      intentTypes: ['instruction'],
    },
  });

  assert.equal(result.promotedRules.length, 0);
  assert.ok(result.rejected.some((item) => item.reason === 'conflicts_with_existing_rule'));
  const conflictedRule = app.behaviorRepo.findById(existingRule.id);
  assert.equal(conflictedRule?.state.frozen, true);
  assert.equal(conflictedRule?.lifecycle.freezeReason, 'conflict');

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});
