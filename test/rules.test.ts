import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { initializeEverMemory } from '../src/index.js';
import type { BehaviorRule } from '../src/types.js';
import { createTempDbPath } from './helpers.js';

function nowIso(): string {
  return new Date().toISOString();
}

function createRule(input: {
  statement: string;
  category: BehaviorRule['category'];
  priority: number;
  userId?: string;
  intentTypes?: BehaviorRule['appliesTo']['intentTypes'];
  contexts?: string[];
  lifecycle?: Partial<BehaviorRule['lifecycle']>;
}): BehaviorRule {
  const timestamp = nowIso();
  return {
    id: randomUUID(),
    statement: input.statement,
    createdAt: timestamp,
    updatedAt: timestamp,
    appliesTo: {
      userId: input.userId,
      intentTypes: input.intentTypes ?? [],
      contexts: input.contexts ?? [],
    },
    category: input.category,
    priority: input.priority,
    evidence: {
      reflectionIds: ['reflection-test'],
      memoryIds: [],
      confidence: 0.9,
      recurrenceCount: 2,
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
      active: true,
      deprecated: false,
      frozen: false,
    },
  };
}

test('evermemoryRules returns ranked active rules with governance summary', () => {
  const databasePath = createTempDbPath('rules-tool');
  const app = initializeEverMemory({ databasePath });

  const planningRule = createRule({
    statement: '计划请求先给出阶段拆分。',
    category: 'planning',
    priority: 90,
    userId: 'user-rules-1',
    intentTypes: ['planning'],
    lifecycle: {
      level: 'critical',
      maturity: 'validated',
      applyCount: 3,
    },
  });
  const correctionRule = createRule({
    statement: '更正请求必须复述用户修正点。',
    category: 'confirmation',
    priority: 95,
    userId: 'user-rules-1',
    intentTypes: ['correction'],
  });
  const contextRule = createRule({
    statement: '部署场景先确认回滚方案。',
    category: 'safety',
    priority: 85,
    userId: 'user-rules-1',
    contexts: ['deployment'],
    lifecycle: {
      stale: true,
      staleness: 'stale',
      decayScore: 0.3,
    },
  });
  const globalRule = createRule({
    statement: '关键动作前先确认目标和边界。',
    category: 'confirmation',
    priority: 70,
  });

  app.behaviorRepo.insert(planningRule);
  app.behaviorRepo.insert(correctionRule);
  app.behaviorRepo.insert(contextRule);
  app.behaviorRepo.insert(globalRule);

  const result = app.evermemoryRules({
    scope: { userId: 'user-rules-1' },
    intentType: 'planning',
    contexts: ['deployment'],
    limit: 10,
  });

  assert.ok(result.total >= 3);
  assert.equal(result.rules[0]?.id, planningRule.id);
  assert.ok(result.rules.some((rule) => rule.id === contextRule.id));
  assert.ok(result.rules.some((rule) => rule.id === globalRule.id));
  assert.ok(!result.rules.some((rule) => rule.id === correctionRule.id));
  assert.ok(result.governance.levels.includes('critical'));
  assert.ok(result.governance.maturities.length >= 1);
  assert.ok(result.governance.maxDecayScore >= 0);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});
