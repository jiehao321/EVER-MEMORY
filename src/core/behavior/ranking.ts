import { evaluateRuleApplicability } from './applicability.js';
import type { BehaviorRule, BehaviorRuleLookupInput } from '../../types.js';

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
    return 0.2;
  }

  const ageDays = (Date.now() - updatedAtTs) / (24 * 60 * 60 * 1000);
  if (ageDays <= 7) {
    return 1;
  }
  if (ageDays <= 30) {
    return 0.8;
  }
  if (ageDays <= 90) {
    return 0.55;
  }
  return 0.3;
}

function levelWeight(level: BehaviorRule['lifecycle']['level']): number {
  switch (level) {
    case 'critical':
      return 1;
    case 'baseline':
      return 0.72;
    case 'candidate':
    default:
      return 0.48;
  }
}

function maturityWeight(maturity: BehaviorRule['lifecycle']['maturity']): number {
  switch (maturity) {
    case 'institutionalized':
      return 1;
    case 'validated':
      return 0.78;
    case 'emerging':
      return 0.52;
    case 'frozen':
    default:
      return 0.1;
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

      const governancePenalty = rule.lifecycle.stale ? 0.08 : 0;
      const score =
        applicability.score * 0.35
        + (rule.priority / 100) * 0.2
        + rule.evidence.confidence * 0.14
        + freshnessScore(rule.updatedAt) * 0.05
        + Math.min(1, rule.evidence.recurrenceCount / 3) * 0.04
        + levelWeight(rule.lifecycle.level) * 0.1
        + maturityWeight(rule.lifecycle.maturity) * 0.08
        + Math.min(1, rule.lifecycle.applyCount / 6) * 0.06
        - Math.min(0.2, rule.lifecycle.decayScore * 0.2)
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
