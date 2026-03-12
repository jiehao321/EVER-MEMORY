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

      const score =
        applicability.score * 0.45
        + (rule.priority / 100) * 0.25
        + rule.evidence.confidence * 0.2
        + freshnessScore(rule.updatedAt) * 0.05
        + Math.min(1, rule.evidence.recurrenceCount / 3) * 0.05;

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
