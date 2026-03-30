import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildBehaviorRule } from '../../storage/helpers.js';
import { buildPromotedRuleGovernance } from '../../../src/core/behavior/promotion.js';
import {
  evaluateBehaviorLifecycle,
  markBehaviorRuleApplied,
  markBehaviorRuleOverridden,
} from '../../../src/core/behavior/lifecycle.js';

describe('behavior lifecycle', () => {
  it('uses category-aware maturity thresholds for applied rules', () => {
    const now = new Date('2026-03-29T08:00:00.000Z');
    const safetyRule = buildBehaviorRule({
      category: 'safety',
      lifecycle: {
        level: 'critical',
        maturity: 'emerging',
        applyCount: 0,
        contradictionCount: 0,
        stale: false,
        staleness: 'fresh',
        decayScore: 0,
      },
    });
    const styleRule = buildBehaviorRule({
      category: 'style',
      lifecycle: {
        level: 'candidate',
        maturity: 'emerging',
        applyCount: 0,
        contradictionCount: 0,
        stale: false,
        staleness: 'fresh',
        decayScore: 0,
      },
    });

    const safetyValidated = markBehaviorRuleApplied(markBehaviorRuleApplied(safetyRule, now), now);
    assert.equal(safetyValidated.lifecycle.maturity, 'validated');

    let styled = styleRule;
    for (let index = 0; index < 6; index += 1) {
      styled = markBehaviorRuleApplied(styled, now);
    }
    assert.equal(styled.lifecycle.maturity, 'emerging');

    styled = markBehaviorRuleApplied(styled, now);
    assert.equal(styled.lifecycle.maturity, 'validated');
  });

  it('uses category-aware staleness thresholds', () => {
    const now = new Date('2026-03-29T08:00:00.000Z');
    const planningIso = new Date('2026-03-24T08:00:00.000Z').toISOString();
    const safetyIso = new Date('2026-03-16T08:00:00.000Z').toISOString();

    const planningRule = buildBehaviorRule({
      category: 'planning',
      createdAt: planningIso,
      updatedAt: planningIso,
      lifecycle: {
        level: 'baseline',
        maturity: 'validated',
        applyCount: 3,
        contradictionCount: 0,
        lastAppliedAt: planningIso,
        stale: false,
        staleness: 'fresh',
        decayScore: 0,
      },
    });
    const safetyRule = buildBehaviorRule({
      category: 'safety',
      createdAt: safetyIso,
      updatedAt: safetyIso,
      lifecycle: {
        level: 'critical',
        maturity: 'validated',
        applyCount: 3,
        contradictionCount: 0,
        lastAppliedAt: safetyIso,
        stale: false,
        staleness: 'fresh',
        decayScore: 0,
      },
    });

    const planningStale = evaluateBehaviorLifecycle(planningRule, now);
    const safetyFresh = evaluateBehaviorLifecycle(safetyRule, now);

    assert.equal(planningStale.lifecycle.staleness, 'stale');
    assert.equal(planningStale.lifecycle.stale, true);
    assert.equal(safetyFresh.lifecycle.staleness, 'fresh');
    assert.equal(safetyFresh.lifecycle.stale, false);
  });

  it('auto-suspends after three consecutive overrides', () => {
    const now = new Date('2026-03-29T08:00:00.000Z');
    const rule = buildBehaviorRule({
      category: 'execution',
      lifecycle: {
        level: 'baseline',
        maturity: 'validated',
        applyCount: 3,
        contradictionCount: 0,
        stale: false,
        staleness: 'fresh',
        decayScore: 0,
      },
    });

    const twiceOverridden = markBehaviorRuleOverridden(markBehaviorRuleOverridden(rule, now), now);
    assert.equal(twiceOverridden.lifecycle.overrideCount, 2);
    assert.equal(twiceOverridden.lifecycle.autoSuspended, false);
    assert.equal(twiceOverridden.state.active, true);

    const autoSuspended = markBehaviorRuleOverridden(twiceOverridden, now);
    assert.equal(autoSuspended.lifecycle.overrideCount, 3);
    assert.equal(autoSuspended.lifecycle.autoSuspended, true);
    assert.equal(autoSuspended.lifecycle.freezeReason, 'auto_suspended');
    assert.equal(autoSuspended.state.active, false);
    assert.equal(autoSuspended.state.deprecated, true);
  });
});

describe('behavior promotion governance', () => {
  it('uses category-aware maturity thresholds during promotion', () => {
    const now = '2026-03-29T08:00:00.000Z';

    const safetyGovernance = buildPromotedRuleGovernance({
      category: 'safety',
      priority: 95,
      confidence: 0.92,
      recurrenceCount: 2,
      now,
    });
    const styleGovernance = buildPromotedRuleGovernance({
      category: 'style',
      priority: 54,
      confidence: 0.82,
      recurrenceCount: 6,
      now,
    });

    assert.equal(safetyGovernance.maturity, 'validated');
    assert.equal(styleGovernance.maturity, 'emerging');
  });
});
