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

function makeReflection(id: string, candidateRules: string[]): ReflectionRecord {
  return {
    id,
    createdAt: nowIso(),
    trigger: {
      kind: 'manual-review',
      experienceIds: ['exp-governance'],
    },
    analysis: {
      category: 'governance',
      summary: '规则压测覆盖冻结、废弃与回滚路径。',
      nextTimeRecommendation: '保持规则可观测。',
    },
    evidence: {
      refs: ['msg-governance-1'],
      confidence: 0.91,
      recurrenceCount: 3,
    },
    candidateRules,
    state: {
      promoted: false,
      rejected: false,
    },
  };
}

function makeRule(input: Partial<BehaviorRule> & Pick<BehaviorRule, 'statement' | 'category' | 'priority'>): BehaviorRule {
  const timestamp = nowIso();
  return {
    id: input.id ?? randomUUID(),
    statement: input.statement,
    createdAt: input.createdAt ?? timestamp,
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
      reflectionIds: input.evidence?.reflectionIds ?? ['reflection-governance'],
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
    trace: {
      promotedFromReflectionId: input.trace?.promotedFromReflectionId,
      promotedReason: input.trace?.promotedReason,
      promotedAt: input.trace?.promotedAt,
      reviewSourceRefs: input.trace?.reviewSourceRefs ?? [],
      promotionEvidenceSummary: input.trace?.promotionEvidenceSummary,
      deactivatedByRuleId: input.trace?.deactivatedByRuleId,
      deactivatedByReflectionId: input.trace?.deactivatedByReflectionId,
      deactivatedReason: input.trace?.deactivatedReason,
      deactivatedAt: input.trace?.deactivatedAt,
    },
  };
}

test('rules governance stress: freeze path removes applicability and supports manual thaw', () => {
  const databasePath = createTempDbPath('rules-governance-freeze-stress');
  const app = initializeEverMemory({ databasePath });

  try {
    const reflection = makeReflection('reflection-freeze-stress', ['高风险执行前需要二次确认。']);
    app.reflectionRepo.insert(reflection);

    const promoted = app.behaviorService.promoteFromReflection({
      reflectionId: reflection.id,
      appliesTo: { userId: 'user-freeze-stress', intentTypes: ['instruction'] },
    });
    const rule = promoted.promotedRules[0];
    assert.ok(rule);

    const beforeFreeze = app.evermemoryRules({
      scope: { userId: 'user-freeze-stress' },
      intentType: 'instruction',
      limit: 5,
    });
    assert.ok(beforeFreeze.rules.some((item) => item.id === rule.id));

    const freezeResult = app.evermemoryRules({
      action: 'freeze',
      ruleId: rule.id,
      reason: '人工审核暂停规则以复核。',
      scope: { userId: 'user-freeze-stress' },
      intentType: 'instruction',
      limit: 5,
      includeFrozen: true,
      includeInactive: true,
    });
    assert.equal(freezeResult.mutation?.changed, true);
    assert.equal(freezeResult.mutation?.rule?.state.frozen, true);

    const afterFreeze = app.evermemoryRules({
      scope: { userId: 'user-freeze-stress' },
      intentType: 'instruction',
      limit: 5,
    });
    assert.equal(afterFreeze.rules.some((item) => item.id === rule.id), false);

    const frozenRule = app.behaviorRepo.findById(rule.id);
    assert.ok(frozenRule?.state.frozen);

    const thawTimestamp = nowIso();
    const thawedRule: BehaviorRule = {
      ...frozenRule!,
      updatedAt: thawTimestamp,
      lifecycle: {
        ...frozenRule!.lifecycle,
        frozenAt: undefined,
        freezeReason: undefined,
        maturity: frozenRule!.lifecycle.maturity === 'frozen'
          ? 'validated'
          : frozenRule!.lifecycle.maturity,
        lastReviewedAt: thawTimestamp,
      },
      state: {
        ...frozenRule!.state,
        active: true,
        deprecated: false,
        frozen: false,
        statusReason: 'manual_thaw',
        statusChangedAt: thawTimestamp,
      },
    };
    app.behaviorRepo.insert(thawedRule);

    const afterThaw = app.evermemoryRules({
      scope: { userId: 'user-freeze-stress' },
      intentType: 'instruction',
      limit: 5,
    });
    assert.ok(afterThaw.rules.some((item) => item.id === rule.id));
  } finally {
    app.database.connection.close();
    rmSync(databasePath, { force: true });
  }
});

test('rules governance stress: deprecate path narrows active set and exposes explainability', () => {
  const databasePath = createTempDbPath('rules-governance-deprecate-stress');
  const app = initializeEverMemory({ databasePath });

  try {
    const primaryRule = makeRule({
      statement: '生产环境执行高风险指令前必须完成双人审批。',
      category: 'safety',
      priority: 96,
      appliesTo: { userId: 'user-deprecate-stress', intentTypes: ['instruction'] },
    });
    const redundantRule = makeRule({
      statement: '若已同步到人工 runbook，可直接执行。',
      category: 'safety',
      priority: 80,
      appliesTo: { userId: 'user-deprecate-stress', intentTypes: ['instruction'] },
    });
    app.behaviorRepo.insert(primaryRule);
    app.behaviorRepo.insert(redundantRule);

    const beforeDeprecate = app.evermemoryRules({
      scope: { userId: 'user-deprecate-stress' },
      intentType: 'instruction',
      limit: 10,
    });
    assert.ok(beforeDeprecate.rules.some((item) => item.id === redundantRule.id));

    const deprecateReason = '迁移到人工审批，旧规则标记为废弃';
    const deprecateResult = app.evermemoryRules({
      action: 'deprecate',
      ruleId: redundantRule.id,
      reason: deprecateReason,
      scope: { userId: 'user-deprecate-stress' },
      intentType: 'instruction',
      limit: 10,
      includeInactive: true,
      includeDeprecated: true,
    });
    assert.equal(deprecateResult.mutation?.changed, true);
    assert.equal(deprecateResult.mutation?.rule?.state.deprecated, true);

    const afterDeprecate = app.evermemoryRules({
      scope: { userId: 'user-deprecate-stress' },
      intentType: 'instruction',
      limit: 10,
    });
    assert.equal(afterDeprecate.rules.some((item) => item.id === redundantRule.id), false);
    assert.ok(afterDeprecate.rules.some((item) => item.id === primaryRule.id));

    const explain = app.evermemoryExplain({
      topic: 'rule',
      entityId: redundantRule.id,
      limit: 5,
    });
    assert.ok(explain.total >= 1);
    const deprecatedEvent = explain.items.find((item) => item.kind === 'rule_deprecated');
    assert.ok(deprecatedEvent);
    assert.ok(deprecatedEvent.answer.includes(deprecateReason));
  } finally {
    app.database.connection.close();
    rmSync(databasePath, { force: true });
  }
});

test('rules governance stress: rollback path restores updated statement coverage', () => {
  const databasePath = createTempDbPath('rules-governance-rollback-stress');
  const app = initializeEverMemory({ databasePath });

  try {
    const baselineRule = makeRule({
      statement: '部署时允许直接执行，只需记录日志。',
      category: 'execution',
      priority: 70,
      appliesTo: { userId: 'user-rollback-stress', intentTypes: ['instruction'] },
    });
    const saferRule = makeRule({
      statement: '部署前必须确认目标、风险与回滚方案。',
      category: 'safety',
      priority: 98,
      appliesTo: { userId: 'user-rollback-stress', intentTypes: ['instruction'] },
    });
    app.behaviorRepo.insert(baselineRule);
    app.behaviorRepo.insert(saferRule);

    const beforeRollback = app.evermemoryRules({
      scope: { userId: 'user-rollback-stress' },
      intentType: 'instruction',
      limit: 10,
    });
    assert.ok(beforeRollback.rules.some((item) => item.id === saferRule.id));

    const rollbackReason = '新证据要求以更安全规则覆盖旧版本';
    const rollbackResult = app.evermemoryRules({
      action: 'rollback',
      ruleId: baselineRule.id,
      replacementRuleId: saferRule.id,
      reason: rollbackReason,
      scope: { userId: 'user-rollback-stress' },
      intentType: 'instruction',
      limit: 10,
      includeInactive: true,
      includeDeprecated: true,
      includeFrozen: true,
    });
    assert.equal(rollbackResult.mutation?.changed, true);
    assert.equal(rollbackResult.mutation?.rule?.state.supersededBy, saferRule.id);
    assert.equal(rollbackResult.mutation?.rule?.state.frozen, true);

    const rolledBackRecord = app.behaviorRepo.findById(baselineRule.id);
    assert.equal(rolledBackRecord?.state.supersededBy, saferRule.id);
    assert.equal(rolledBackRecord?.lifecycle.freezeReason, 'rollback');

    const afterRollback = app.evermemoryRules({
      scope: { userId: 'user-rollback-stress' },
      intentType: 'instruction',
      limit: 10,
    });
    assert.ok(afterRollback.rules.some((item) => item.id === saferRule.id));
    assert.equal(afterRollback.rules.some((item) => item.id === baselineRule.id), false);
  } finally {
    app.database.connection.close();
    rmSync(databasePath, { force: true });
  }
});

test('rules governance stress: conflict detection freezes contradictory rules', () => {
  const databasePath = createTempDbPath('rules-governance-conflict-stress');
  const app = initializeEverMemory({ databasePath });

  try {
    const conflictingRule = makeRule({
      statement: '高风险动作无需确认，可直接执行。',
      category: 'execution',
      priority: 72,
      appliesTo: { userId: 'user-conflict-stress', intentTypes: ['instruction'] },
    });
    app.behaviorRepo.insert(conflictingRule);

    const reflection = makeReflection('reflection-conflict-stress', ['高风险动作必须先确认再执行。']);
    app.reflectionRepo.insert(reflection);

    const beforeConflict = app.evermemoryRules({
      scope: { userId: 'user-conflict-stress' },
      intentType: 'instruction',
      limit: 5,
    });
    assert.ok(beforeConflict.rules.some((item) => item.id === conflictingRule.id));

    const promotionResult = app.behaviorService.promoteFromReflection({
      reflectionId: reflection.id,
      appliesTo: { userId: 'user-conflict-stress', intentTypes: ['instruction'] },
    });
    assert.equal(promotionResult.promotedRules.length, 0);
    assert.ok(promotionResult.rejected.some((item) => item.reason === 'conflicts_with_existing_rule'));

    const conflictedRecord = app.behaviorRepo.findById(conflictingRule.id);
    assert.equal(conflictedRecord?.state.frozen, true);
    assert.equal(conflictedRecord?.lifecycle.freezeReason, 'conflict');

    const afterConflict = app.evermemoryRules({
      scope: { userId: 'user-conflict-stress' },
      intentType: 'instruction',
      limit: 5,
    });
    assert.equal(afterConflict.rules.some((item) => item.id === conflictingRule.id), false);
  } finally {
    app.database.connection.close();
    rmSync(databasePath, { force: true });
  }
});
