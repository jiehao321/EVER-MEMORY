import { evaluateRuleApplicability } from './applicability.js';
import type { BehaviorRule, BehaviorRuleLookupInput } from '../../types.js';
import {
  RANKING_APPLY_COUNT_DIVISOR,
  RANKING_FRESHNESS_BRACKETS,
  RANKING_LEVEL_WEIGHT_BASELINE,
  RANKING_LEVEL_WEIGHT_CANDIDATE,
  RANKING_LEVEL_WEIGHT_CRITICAL,
  RANKING_MATURITY_WEIGHT_EMERGING,
  RANKING_MATURITY_WEIGHT_FROZEN,
  RANKING_MATURITY_WEIGHT_INSTITUTIONALIZED,
  RANKING_MATURITY_WEIGHT_VALIDATED,
  RANKING_MAX_DECAY_PENALTY,
  RANKING_RECURRENCE_DIVISOR,
  RANKING_STALE_GOVERNANCE_PENALTY,
  RANKING_WEIGHT_APPLICABILITY,
  RANKING_WEIGHT_APPLY_COUNT,
  RANKING_WEIGHT_CONFIDENCE,
  RANKING_WEIGHT_FRESHNESS,
  RANKING_WEIGHT_LEVEL,
  RANKING_WEIGHT_MATURITY,
  RANKING_WEIGHT_PRIORITY,
  RANKING_WEIGHT_RECURRENCE,
} from '../../tuning.js';

export interface RankedBehaviorRule {
  rule: BehaviorRule;
  score: number;
  applicabilityScore: number;
}

function parseTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function freshnessScore(updatedAt: string): number {
  const updatedAtTs = parseTimestamp(updatedAt);
  if (updatedAtTs <= 0) {
    return RANKING_FRESHNESS_BRACKETS.unknownScore;
  }

  const ageDays = (Date.now() - updatedAtTs) / (24 * 60 * 60 * 1000);
  if (ageDays <= RANKING_FRESHNESS_BRACKETS.recentDays) {
    return RANKING_FRESHNESS_BRACKETS.recentScore;
  }
  if (ageDays <= RANKING_FRESHNESS_BRACKETS.moderateDays) {
    return RANKING_FRESHNESS_BRACKETS.moderateScore;
  }
  if (ageDays <= RANKING_FRESHNESS_BRACKETS.oldDays) {
    return RANKING_FRESHNESS_BRACKETS.oldScore;
  }
  return RANKING_FRESHNESS_BRACKETS.ancientScore;
}

function levelWeight(level: BehaviorRule['lifecycle']['level']): number {
  switch (level) {
    case 'critical':
      return RANKING_LEVEL_WEIGHT_CRITICAL;
    case 'baseline':
      return RANKING_LEVEL_WEIGHT_BASELINE;
    case 'candidate':
    default:
      return RANKING_LEVEL_WEIGHT_CANDIDATE;
  }
}

function maturityWeight(maturity: BehaviorRule['lifecycle']['maturity']): number {
  switch (maturity) {
    case 'institutionalized':
      return RANKING_MATURITY_WEIGHT_INSTITUTIONALIZED;
    case 'validated':
      return RANKING_MATURITY_WEIGHT_VALIDATED;
    case 'emerging':
      return RANKING_MATURITY_WEIGHT_EMERGING;
    case 'frozen':
    default:
      return RANKING_MATURITY_WEIGHT_FROZEN;
  }
}

export function rankBehaviorRules(
  rules: BehaviorRule[],
  input: BehaviorRuleLookupInput,
): RankedBehaviorRule[] {
  const ranked = rules
    .map((rule) => {
      const applicability = evaluateRuleApplicability(rule, input);
      if (!applicability.applicable) {
        return null;
      }

      const governancePenalty = rule.lifecycle.stale ? RANKING_STALE_GOVERNANCE_PENALTY : 0;
      const score =
        applicability.score * RANKING_WEIGHT_APPLICABILITY
        + (rule.priority / 100) * RANKING_WEIGHT_PRIORITY
        + rule.evidence.confidence * RANKING_WEIGHT_CONFIDENCE
        + freshnessScore(rule.updatedAt) * RANKING_WEIGHT_FRESHNESS
        + Math.min(1, rule.evidence.recurrenceCount / RANKING_RECURRENCE_DIVISOR) * RANKING_WEIGHT_RECURRENCE
        + levelWeight(rule.lifecycle.level) * RANKING_WEIGHT_LEVEL
        + maturityWeight(rule.lifecycle.maturity) * RANKING_WEIGHT_MATURITY
        + Math.min(1, rule.lifecycle.applyCount / RANKING_APPLY_COUNT_DIVISOR) * RANKING_WEIGHT_APPLY_COUNT
        - Math.min(RANKING_MAX_DECAY_PENALTY, rule.lifecycle.decayScore * RANKING_MAX_DECAY_PENALTY)
        - governancePenalty;

      return {
        rule,
        score,
        applicabilityScore: applicability.score,
      } satisfies RankedBehaviorRule;
    })
    .filter((item): item is RankedBehaviorRule => Boolean(item));

  ranked.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    if (right.rule.priority !== left.rule.priority) {
      return right.rule.priority - left.rule.priority;
    }
    return parseTimestamp(right.rule.updatedAt) - parseTimestamp(left.rule.updatedAt);
  });

  return ranked;
}
