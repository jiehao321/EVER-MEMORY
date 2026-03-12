import type { BehaviorRule, BehaviorRuleLookupInput } from '../../types.js';

export interface BehaviorRuleApplicability {
  applicable: boolean;
  score: number;
  reasons: string[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function includesNormalized(values: string[], target: string): boolean {
  const normalizedTarget = normalize(target);
  return values.some((value) => normalize(value) === normalizedTarget);
}

function intersectsNormalized(left: string[], right: string[]): boolean {
  const rightSet = new Set(right.map((item) => normalize(item)));
  return left.some((item) => rightSet.has(normalize(item)));
}

export function evaluateRuleApplicability(
  rule: BehaviorRule,
  input: BehaviorRuleLookupInput,
): BehaviorRuleApplicability {
  if (!rule.state.active || rule.state.deprecated) {
    return {
      applicable: false,
      score: 0,
      reasons: ['inactive'],
    };
  }

  const reasons: string[] = [];
  let score = 1;

  if (rule.appliesTo.userId) {
    if (!input.scope?.userId || normalize(input.scope.userId) !== normalize(rule.appliesTo.userId)) {
      return {
        applicable: false,
        score: 0,
        reasons: ['user_scope_mismatch'],
      };
    }
    score += 1;
    reasons.push('user_scope_match');
  } else {
    score += 0.4;
    reasons.push('global_scope');
  }

  if (rule.appliesTo.channel) {
    if (!input.channel || normalize(input.channel) !== normalize(rule.appliesTo.channel)) {
      return {
        applicable: false,
        score: 0,
        reasons: ['channel_mismatch'],
      };
    }
    score += 0.7;
    reasons.push('channel_match');
  } else {
    score += 0.2;
  }

  if (rule.appliesTo.intentTypes && rule.appliesTo.intentTypes.length > 0) {
    if (!input.intentType || !includesNormalized(rule.appliesTo.intentTypes, input.intentType)) {
      return {
        applicable: false,
        score: 0,
        reasons: ['intent_mismatch'],
      };
    }
    score += 0.6;
    reasons.push('intent_match');
  } else {
    score += 0.2;
  }

  if (rule.appliesTo.contexts && rule.appliesTo.contexts.length > 0) {
    if (!input.contexts || input.contexts.length === 0) {
      return {
        applicable: false,
        score: 0,
        reasons: ['context_required'],
      };
    }
    if (!intersectsNormalized(rule.appliesTo.contexts, input.contexts)) {
      return {
        applicable: false,
        score: 0,
        reasons: ['context_mismatch'],
      };
    }
    score += 0.4;
    reasons.push('context_match');
  } else {
    score += 0.1;
  }

  return {
    applicable: true,
    score,
    reasons,
  };
}
