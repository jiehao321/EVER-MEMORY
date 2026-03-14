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
      experienceIds: ['exp-1'],
    },
    analysis: {
      category: 'governance',
      summary: '用户多次纠正执行顺序，要求高风险动作前确认。',
      nextTimeRecommendation: '先确认再执行。',
    },
    evidence: {
      refs: ['msg-1', 'msg-2'],
      confidence: 0.92,
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

test('rules tool supports freeze/deprecate/rollback and excludes frozen rules from active loading', () => {
  const databasePath = createTempDbPath('rules-governance');
  const app = initializeEverMemory({ databasePath });

  const reflectionA = makeReflection('reflection-governance-a', ['高风险外部动作需要双重确认后再执行。']);
  const reflectionB = makeReflection('reflection-governance-b', ['高风险外部动作若指令不完整，先复述风险和回滚方案再确认。']);
  app.reflectionRepo.insert(reflectionA);
  app.reflectionRepo.insert(reflectionB);

  const promoted = app.behaviorService.promoteFromReflection({
    reflectionId: reflectionA.id,
    appliesTo: { userId: 'user-governance-1', intentTypes: ['instruction'] },
  });
  const rule = promoted.promotedRules[0];
  assert.ok(rule);
  assert.equal(rule.trace?.promotedFromReflectionId, reflectionA.id);

  const freezeResult = app.evermemoryRules({
    action: 'freeze',
    ruleId: rule.id,
    reflectionId: reflectionB.id,
    reason: '人工审查发现规则过于激进，先冻结等待复核。',
    scope: { userId: 'user-governance-1' },
    limit: 10,
    includeFrozen: true,
    includeInactive: true,
  });
  assert.equal(freezeResult.mutation?.changed, true);
  assert.equal(freezeResult.mutation?.rule?.state.frozen, true);
  assert.equal(app.evermemoryRules({ scope: { userId: 'user-governance-1' }, limit: 10 }).rules.some((item) => item.id === rule.id), false);

  const replacement = makeRule({
    statement: '高风险外部动作若指令不完整，先确认目标、风险和回滚方案。',
    category: 'safety',
    priority: 96,
    appliesTo: { userId: 'user-governance-1', intentTypes: ['instruction'], contexts: [] },
    evidence: { reflectionIds: [reflectionB.id], memoryIds: [], confidence: 0.95, recurrenceCount: 4 },
    trace: {
      promotedFromReflectionId: reflectionB.id,
      promotedReason: 'promoted',
      promotedAt: nowIso(),
      reviewSourceRefs: ['msg-3'],
      promotionEvidenceSummary: '人工修正后提升',
    },
  });
  app.behaviorRepo.insert(replacement);

  const rollbackResult = app.evermemoryRules({
    action: 'rollback',
    ruleId: rule.id,
    reflectionId: reflectionB.id,
    replacementRuleId: replacement.id,
    reason: '被更精确的新规则取代，回滚旧规则。',
    scope: { userId: 'user-governance-1' },
    limit: 10,
    includeInactive: true,
    includeDeprecated: true,
    includeFrozen: true,
  });
  assert.equal(rollbackResult.mutation?.changed, true);
  assert.equal(rollbackResult.mutation?.rule?.state.deprecated, true);
  assert.equal(rollbackResult.mutation?.rule?.state.supersededBy, replacement.id);
  assert.equal(rollbackResult.mutation?.rule?.trace?.deactivatedByRuleId, replacement.id);

  const ruleReview = app.evermemoryReview({
    ruleId: rule.id,
  });
  assert.equal(ruleReview.ruleReview?.replacementRule?.id, replacement.id);
  assert.equal(ruleReview.ruleReview?.replacementRule?.statement, replacement.statement);
  assert.equal(ruleReview.ruleReview?.sourceTrace.deactivatedByRuleId, replacement.id);

  const deprecated = app.evermemoryRules({
    action: 'deprecate',
    ruleId: replacement.id,
    reason: '规则已被人工流程替代。',
    scope: { userId: 'user-governance-1' },
    limit: 10,
    includeInactive: true,
    includeDeprecated: true,
  });
  assert.equal(deprecated.mutation?.changed, true);
  assert.equal(deprecated.mutation?.rule?.state.deprecated, true);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('rules rollback requires a valid replacement rule and repeat mutations are idempotent', () => {
  const databasePath = createTempDbPath('rules-governance-boundary');
  const app = initializeEverMemory({ databasePath });

  const rule = makeRule({
    statement: '生产变更允许直接执行。',
    category: 'execution',
    priority: 78,
    appliesTo: { userId: 'user-governance-2', intentTypes: ['instruction'], contexts: [] },
  });
  const replacement = makeRule({
    statement: '生产变更必须先确认目标、风险和回滚方案。',
    category: 'safety',
    priority: 96,
    appliesTo: { userId: 'user-governance-2', intentTypes: ['instruction'], contexts: [] },
  });
  app.behaviorRepo.insert(rule);
  app.behaviorRepo.insert(replacement);

  const missingReplacement = app.evermemoryRules({
    action: 'rollback',
    ruleId: rule.id,
    reason: '没有替代规则时不允许回滚。',
    includeInactive: true,
    includeDeprecated: true,
    includeFrozen: true,
  });
  assert.equal(missingReplacement.mutation?.changed, false);
  assert.equal(missingReplacement.mutation?.reason, 'replacement_rule_required');

  const selfReplacement = app.evermemoryRules({
    action: 'rollback',
    ruleId: rule.id,
    replacementRuleId: rule.id,
    reason: '自身不能作为替代规则。',
    includeInactive: true,
    includeDeprecated: true,
    includeFrozen: true,
  });
  assert.equal(selfReplacement.mutation?.changed, false);
  assert.equal(selfReplacement.mutation?.reason, 'replacement_rule_invalid');

  const firstFreeze = app.evermemoryRules({
    action: 'freeze',
    ruleId: rule.id,
    reason: '先冻结等待复核。',
    includeFrozen: true,
    includeInactive: true,
  });
  assert.equal(firstFreeze.mutation?.changed, true);

  const secondFreeze = app.evermemoryRules({
    action: 'freeze',
    ruleId: rule.id,
    reason: '重复冻结不应再次改写状态。',
    includeFrozen: true,
    includeInactive: true,
  });
  assert.equal(secondFreeze.mutation?.changed, false);
  assert.equal(secondFreeze.mutation?.reason, 'already_frozen');

  const rollback = app.evermemoryRules({
    action: 'rollback',
    ruleId: rule.id,
    replacementRuleId: replacement.id,
    reason: '由更安全的新规则替代。',
    includeInactive: true,
    includeDeprecated: true,
    includeFrozen: true,
  });
  assert.equal(rollback.mutation?.changed, true);
  assert.equal(rollback.mutation?.rule?.state.supersededBy, replacement.id);

  const rollbackAgain = app.evermemoryRules({
    action: 'rollback',
    ruleId: rule.id,
    replacementRuleId: replacement.id,
    reason: '重复回滚应为幂等。',
    includeInactive: true,
    includeDeprecated: true,
    includeFrozen: true,
  });
  assert.equal(rollbackAgain.mutation?.changed, false);
  assert.equal(rollbackAgain.mutation?.reason, 'already_rolled_back');

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});
