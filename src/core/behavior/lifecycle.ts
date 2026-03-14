import type {
  BehaviorRule,
  BehaviorRuleFreezeReason,
  BehaviorRuleLevel,
  BehaviorRuleLifecycle,
  BehaviorRuleMaturity,
  BehaviorRuleStaleness,
} from '../../types.js';
import {
  BEHAVIOR_AGING_AFTER_DAYS,
  BEHAVIOR_APPLY_DECAY_RECOVERY,
  BEHAVIOR_DECAY_FROM_AGING,
  BEHAVIOR_DECAY_FROM_EXPIRED,
  BEHAVIOR_DECAY_FROM_STALE,
  BEHAVIOR_DECAY_PER_CONTRADICTION,
  BEHAVIOR_EXPIRED_AFTER_DAYS,
  BEHAVIOR_EXPIRES_AFTER_DAYS,
  BEHAVIOR_MATURITY_INSTITUTIONALIZED_THRESHOLD,
  BEHAVIOR_MATURITY_VALIDATED_THRESHOLD,
  BEHAVIOR_MAX_CONTRADICTIONS_BEFORE_DISABLE,
  BEHAVIOR_MIN_PRIORITY,
  BEHAVIOR_PRIORITY_CORRECTION_PENALTY,
  BEHAVIOR_PRIORITY_DECAY_STEP,
  BEHAVIOR_STALE_AFTER_DAYS,
  BEHAVIOR_STALE_VALIDATED_THRESHOLD,
  LEVEL_BASELINE_CONFIDENCE_THRESHOLD,
  LEVEL_BASELINE_PRIORITY_THRESHOLD,
  LEVEL_CRITICAL_CONFIDENCE_THRESHOLD,
  LEVEL_CRITICAL_PRIORITY_THRESHOLD,
} from '../../tuning.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseTimestamp(value?: string): number | null {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function daysSince(value: string | undefined, nowTs: number): number | null {
  const ts = parseTimestamp(value);
  if (ts === null) {
    return null;
  }
  return Math.max(0, (nowTs - ts) / MS_PER_DAY);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function deduceMaturity(applyCount: number, contradictionCount: number): BehaviorRuleMaturity {
  if (contradictionCount > 0) {
    return 'frozen';
  }
  if (applyCount >= BEHAVIOR_MATURITY_INSTITUTIONALIZED_THRESHOLD) {
    return 'institutionalized';
  }
  if (applyCount >= BEHAVIOR_MATURITY_VALIDATED_THRESHOLD) {
    return 'validated';
  }
  return 'emerging';
}

function deduceLevel(priority: number, confidence: number): BehaviorRuleLevel {
  if (priority >= LEVEL_CRITICAL_PRIORITY_THRESHOLD || confidence >= LEVEL_CRITICAL_CONFIDENCE_THRESHOLD) {
    return 'critical';
  }
  if (priority >= LEVEL_BASELINE_PRIORITY_THRESHOLD || confidence >= LEVEL_BASELINE_CONFIDENCE_THRESHOLD) {
    return 'baseline';
  }
  return 'candidate';
}

export function createInitialBehaviorLifecycle(input: {
  priority: number;
  confidence: number;
  now?: string;
}): BehaviorRuleLifecycle {
  return {
    level: deduceLevel(input.priority, input.confidence),
    maturity: deduceMaturity(0, 0),
    applyCount: 0,
    contradictionCount: 0,
    lastAppliedAt: undefined,
    lastContradictedAt: undefined,
    lastReviewedAt: input.now,
    stale: false,
    staleness: 'fresh',
    decayScore: 0,
    frozenAt: undefined,
    freezeReason: undefined,
    expiresAt: undefined,
  };
}

export function evaluateBehaviorLifecycle(rule: BehaviorRule, now = new Date()): BehaviorRule {
  const nowIso = now.toISOString();
  const nowTs = now.getTime();
  const baseTimestamp = rule.lifecycle.lastAppliedAt ?? rule.updatedAt ?? rule.createdAt;
  const inactivityDays = daysSince(baseTimestamp, nowTs) ?? 0;

  let staleness: BehaviorRuleStaleness = 'fresh';
  let stale = false;
  let decayScore = rule.lifecycle.contradictionCount * BEHAVIOR_DECAY_PER_CONTRADICTION;
  let expiresAt = rule.lifecycle.expiresAt;
  let active = rule.state.active;
  let deprecated = rule.state.deprecated;
  let frozenAt = rule.lifecycle.frozenAt;
  let freezeReason = rule.lifecycle.freezeReason;
  let maturity = rule.lifecycle.maturity;
  let level = rule.lifecycle.level;
  let priority = rule.priority;

  if (inactivityDays >= BEHAVIOR_EXPIRED_AFTER_DAYS) {
    staleness = 'expired';
    stale = true;
    decayScore += BEHAVIOR_DECAY_FROM_EXPIRED;
  } else if (inactivityDays >= BEHAVIOR_STALE_AFTER_DAYS) {
    staleness = 'stale';
    stale = true;
    decayScore += BEHAVIOR_DECAY_FROM_STALE;
  } else if (inactivityDays >= BEHAVIOR_AGING_AFTER_DAYS) {
    staleness = 'aging';
    decayScore += BEHAVIOR_DECAY_FROM_AGING;
  }

  if (!expiresAt) {
    const baseTs = parseTimestamp(rule.createdAt) ?? nowTs;
    expiresAt = new Date(baseTs + BEHAVIOR_EXPIRES_AFTER_DAYS * MS_PER_DAY).toISOString();
  }

  if (rule.lifecycle.contradictionCount >= BEHAVIOR_MAX_CONTRADICTIONS_BEFORE_DISABLE) {
    active = false;
    deprecated = true;
    frozenAt = frozenAt ?? (rule.lifecycle.lastContradictedAt ?? nowIso);
    freezeReason = freezeReason ?? 'contradiction_threshold';
    maturity = 'frozen';
    level = 'candidate';
  } else if (rule.lifecycle.freezeReason === 'conflict') {
    active = false;
    deprecated = true;
    frozenAt = frozenAt ?? nowIso;
    freezeReason = 'conflict';
    maturity = 'frozen';
    level = 'candidate';
  } else if (staleness === 'expired') {
    priority = Math.max(BEHAVIOR_MIN_PRIORITY, priority - BEHAVIOR_PRIORITY_DECAY_STEP * 2);
    if (rule.lifecycle.applyCount === 0) {
      active = false;
      deprecated = true;
      frozenAt = frozenAt ?? nowIso;
      freezeReason = freezeReason ?? 'expired';
      maturity = 'frozen';
      level = 'candidate';
    } else {
      maturity = rule.lifecycle.contradictionCount > 0 ? 'frozen' : 'validated';
      level = priority >= LEVEL_BASELINE_PRIORITY_THRESHOLD ? 'baseline' : 'candidate';
    }
  } else if (staleness === 'stale') {
    priority = Math.max(BEHAVIOR_MIN_PRIORITY, priority - BEHAVIOR_PRIORITY_DECAY_STEP);
    maturity = rule.lifecycle.contradictionCount > 0
      ? 'frozen'
      : rule.lifecycle.applyCount >= BEHAVIOR_STALE_VALIDATED_THRESHOLD
        ? 'validated'
        : 'emerging';
    level = priority >= LEVEL_BASELINE_PRIORITY_THRESHOLD ? 'baseline' : 'candidate';
  } else {
    maturity = rule.lifecycle.freezeReason ? 'frozen' : deduceMaturity(rule.lifecycle.applyCount, rule.lifecycle.contradictionCount);
    level = deduceLevel(priority, rule.evidence.confidence);
  }

  return {
    ...rule,
    priority,
    updatedAt: nowIso,
    lifecycle: {
      ...rule.lifecycle,
      level,
      maturity,
      stale,
      staleness,
      decayScore: clamp01(decayScore),
      frozenAt,
      freezeReason,
      expiresAt,
      lastReviewedAt: nowIso,
    },
    state: {
      ...rule.state,
      active,
      deprecated,
    },
  };
}

export function markBehaviorRuleApplied(rule: BehaviorRule, now = new Date()): BehaviorRule {
  const nowIso = now.toISOString();
  const applyCount = rule.lifecycle.applyCount + 1;
  return evaluateBehaviorLifecycle(
    {
      ...rule,
      updatedAt: nowIso,
      lifecycle: {
        ...rule.lifecycle,
        applyCount,
        lastAppliedAt: nowIso,
        stale: false,
        staleness: 'fresh',
        decayScore: Math.max(0, rule.lifecycle.decayScore - BEHAVIOR_APPLY_DECAY_RECOVERY),
        lastReviewedAt: nowIso,
        maturity: deduceMaturity(applyCount, rule.lifecycle.contradictionCount),
      },
    },
    now,
  );
}

export function markBehaviorRuleContradicted(
  rule: BehaviorRule,
  input: { reason?: BehaviorRuleFreezeReason; now?: Date } = {},
): BehaviorRule {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const contradictionCount = rule.lifecycle.contradictionCount + 1;
  const freezeReason = input.reason
    ?? (contradictionCount >= BEHAVIOR_MAX_CONTRADICTIONS_BEFORE_DISABLE ? 'contradiction_threshold' : 'correction');

  return evaluateBehaviorLifecycle(
    {
      ...rule,
      priority: Math.max(BEHAVIOR_MIN_PRIORITY, rule.priority - BEHAVIOR_PRIORITY_CORRECTION_PENALTY),
      updatedAt: nowIso,
      lifecycle: {
        ...rule.lifecycle,
        contradictionCount,
        lastContradictedAt: nowIso,
        freezeReason,
        frozenAt: freezeReason === 'correction' ? undefined : nowIso,
        lastReviewedAt: nowIso,
        maturity: 'frozen',
        level: 'candidate',
      },
    },
    now,
  );
}

export function freezeBehaviorRule(rule: BehaviorRule, reason: BehaviorRuleFreezeReason, now = new Date()): BehaviorRule {
  const nowIso = now.toISOString();
  return evaluateBehaviorLifecycle(
    {
      ...rule,
      updatedAt: nowIso,
      lifecycle: {
        ...rule.lifecycle,
        freezeReason: reason,
        frozenAt: nowIso,
        lastReviewedAt: nowIso,
        maturity: 'frozen',
        level: 'candidate',
      },
      state: {
        ...rule.state,
        active: false,
        deprecated: true,
      },
    },
    now,
  );
}
