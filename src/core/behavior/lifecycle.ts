import type {
  BehaviorRule,
  BehaviorRuleFreezeReason,
  BehaviorRuleLevel,
  BehaviorRuleLifecycle,
  BehaviorRuleMaturity,
  BehaviorRuleStaleness,
} from '../../types.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const AGING_AFTER_DAYS = 14;
const STALE_AFTER_DAYS = 30;
const EXPIRED_AFTER_DAYS = 60;
const EXPIRES_AFTER_DAYS = 120;
const DECAY_FROM_AGING = 0.12;
const DECAY_FROM_STALE = 0.32;
const DECAY_FROM_EXPIRED = 0.62;
const DECAY_PER_CONTRADICTION = 0.18;
const MAX_CONTRADICTIONS_BEFORE_DISABLE = 2;
const MIN_PRIORITY = 10;
const PRIORITY_DECAY_STEP = 10;
const PRIORITY_CORRECTION_PENALTY = 14;

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
  if (applyCount >= 6) {
    return 'institutionalized';
  }
  if (applyCount >= 2) {
    return 'validated';
  }
  return 'emerging';
}

function deduceLevel(priority: number, confidence: number): BehaviorRuleLevel {
  if (priority >= 90 || confidence >= 0.92) {
    return 'critical';
  }
  if (priority >= 70 || confidence >= 0.8) {
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
  let decayScore = rule.lifecycle.contradictionCount * DECAY_PER_CONTRADICTION;
  let expiresAt = rule.lifecycle.expiresAt;
  let active = rule.state.active;
  let deprecated = rule.state.deprecated;
  let frozenAt = rule.lifecycle.frozenAt;
  let freezeReason = rule.lifecycle.freezeReason;
  let maturity = rule.lifecycle.maturity;
  let level = rule.lifecycle.level;
  let priority = rule.priority;

  if (inactivityDays >= EXPIRED_AFTER_DAYS) {
    staleness = 'expired';
    stale = true;
    decayScore += DECAY_FROM_EXPIRED;
  } else if (inactivityDays >= STALE_AFTER_DAYS) {
    staleness = 'stale';
    stale = true;
    decayScore += DECAY_FROM_STALE;
  } else if (inactivityDays >= AGING_AFTER_DAYS) {
    staleness = 'aging';
    decayScore += DECAY_FROM_AGING;
  }

  if (!expiresAt) {
    const baseTs = parseTimestamp(rule.createdAt) ?? nowTs;
    expiresAt = new Date(baseTs + EXPIRES_AFTER_DAYS * MS_PER_DAY).toISOString();
  }

  if (rule.lifecycle.contradictionCount >= MAX_CONTRADICTIONS_BEFORE_DISABLE) {
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
    priority = Math.max(MIN_PRIORITY, priority - PRIORITY_DECAY_STEP * 2);
    if (rule.lifecycle.applyCount === 0) {
      active = false;
      deprecated = true;
      frozenAt = frozenAt ?? nowIso;
      freezeReason = freezeReason ?? 'expired';
      maturity = 'frozen';
      level = 'candidate';
    } else {
      maturity = rule.lifecycle.contradictionCount > 0 ? 'frozen' : 'validated';
      level = priority >= 70 ? 'baseline' : 'candidate';
    }
  } else if (staleness === 'stale') {
    priority = Math.max(MIN_PRIORITY, priority - PRIORITY_DECAY_STEP);
    maturity = rule.lifecycle.contradictionCount > 0 ? 'frozen' : rule.lifecycle.applyCount >= 4 ? 'validated' : 'emerging';
    level = priority >= 70 ? 'baseline' : 'candidate';
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
        decayScore: Math.max(0, rule.lifecycle.decayScore - 0.08),
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
  const freezeReason = input.reason ?? (contradictionCount >= MAX_CONTRADICTIONS_BEFORE_DISABLE ? 'contradiction_threshold' : 'correction');

  return evaluateBehaviorLifecycle(
    {
      ...rule,
      priority: Math.max(MIN_PRIORITY, rule.priority - PRIORITY_CORRECTION_PENALTY),
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
