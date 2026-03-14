import { randomUUID } from 'node:crypto';
import {
  evaluateBehaviorLifecycle,
  freezeBehaviorRule,
  markBehaviorRuleApplied,
  markBehaviorRuleContradicted,
} from './lifecycle.js';
import {
  buildPromotedRuleGovernance,
  evaluatePromotionCandidate,
  freezeConflictingRules,
} from './promotion.js';
import { rankBehaviorRules } from './ranking.js';
import type { DebugRepository } from '../../storage/debugRepo.js';
import type { BehaviorRepository } from '../../storage/behaviorRepo.js';
import type { ReflectionRepository } from '../../storage/reflectionRepo.js';
import type {
  BehaviorRule,
  BehaviorRuleLookupInput,
  BehaviorRuleMutationInput,
  BehaviorRuleMutationResult,
  BehaviorRuleReviewRecord,
  PromoteFromReflectionInput,
  PromoteFromReflectionResult,
  ReflectionRecord,
} from '../../types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function withReviewState(reflection: ReflectionRecord, promotedCount: number): ReflectionRecord {
  return {
    ...reflection,
    state: {
      ...reflection.state,
      promoted: reflection.state.promoted || promotedCount > 0,
      rejected: promotedCount === 0,
      reviewedAt: nowIso(),
    },
  };
}

export class BehaviorService {
  constructor(
    private readonly behaviorRepo: BehaviorRepository,
    private readonly reflectionRepo: ReflectionRepository,
    private readonly debugRepo?: DebugRepository,
  ) {}

  promoteFromReflection(input: PromoteFromReflectionInput): PromoteFromReflectionResult {
    const reflection = this.reflectionRepo.findById(input.reflectionId);
    if (!reflection) {
      return {
        reflectionId: input.reflectionId,
        promotedRules: [],
        rejected: [],
        error: `Reflection not found: ${input.reflectionId}`,
      };
    }

    const existingRules = this.behaviorRepo.listActiveCandidates({
      userId: input.appliesTo?.userId,
      channel: input.appliesTo?.channel,
      limit: 200,
    });

    const promotedRules: BehaviorRule[] = [];
    const rejected: PromoteFromReflectionResult['rejected'] = [];

    for (const candidate of reflection.candidateRules) {
      const frozenRules = freezeConflictingRules(candidate, [...existingRules, ...promotedRules]);
      for (const frozenRule of frozenRules) {
        const governedFrozenRule: BehaviorRule = {
          ...frozenRule,
          state: {
            ...frozenRule.state,
            frozen: true,
            statusReason: frozenRule.lifecycle.freezeReason,
            statusSourceReflectionId: reflection.id,
            statusChangedAt: nowIso(),
          },
          trace: {
            ...frozenRule.trace,
            reviewSourceRefs: Array.from(new Set([
              ...(frozenRule.trace?.reviewSourceRefs ?? []),
              ...reflection.evidence.refs,
            ])),
            deactivatedByReflectionId: reflection.id,
            deactivatedReason: frozenRule.lifecycle.freezeReason,
            deactivatedAt: nowIso(),
          },
        };
        this.behaviorRepo.insert(governedFrozenRule);
        this.debugRepo?.log('rule_frozen', governedFrozenRule.id, {
          reflectionId: reflection.id,
          reason: governedFrozenRule.lifecycle.freezeReason,
          statement: governedFrozenRule.statement,
        });
      }

      const decision = evaluatePromotionCandidate({
        statement: candidate,
        reflection,
        existingRules: [...existingRules, ...promotedRules],
      });

      if (!decision.accepted || !decision.category || !decision.priority) {
        rejected.push({
          statement: decision.statement,
          reason: decision.reason,
        });
        this.debugRepo?.log('rule_rejected', reflection.id, {
          reflectionId: reflection.id,
          statement: decision.statement,
          reason: decision.reason,
        });
        continue;
      }

      const timestamp = nowIso();
      const rule: BehaviorRule = {
        id: randomUUID(),
        statement: decision.statement,
        createdAt: timestamp,
        updatedAt: timestamp,
        appliesTo: {
          userId: input.appliesTo?.userId,
          channel: input.appliesTo?.channel,
          intentTypes: input.appliesTo?.intentTypes ?? [],
          contexts: input.appliesTo?.contexts ?? [],
        },
        category: decision.category,
        priority: decision.priority,
        evidence: {
          reflectionIds: [reflection.id],
          memoryIds: [],
          confidence: reflection.evidence.confidence,
          recurrenceCount: reflection.evidence.recurrenceCount,
        },
        lifecycle: buildPromotedRuleGovernance({
          priority: decision.priority,
          confidence: reflection.evidence.confidence,
          recurrenceCount: reflection.evidence.recurrenceCount,
          now: timestamp,
        }),
        state: {
          active: true,
          deprecated: false,
          frozen: false,
          statusReason: 'promoted',
          statusSourceReflectionId: reflection.id,
          statusChangedAt: timestamp,
        },
        trace: {
          promotedFromReflectionId: reflection.id,
          promotedReason: decision.reason,
          promotedAt: timestamp,
          reviewSourceRefs: reflection.evidence.refs,
          promotionEvidenceSummary: reflection.analysis.summary,
        },
      };

      this.behaviorRepo.insert(rule);
      promotedRules.push(rule);

      this.debugRepo?.log('rule_promoted', rule.id, {
        reflectionId: reflection.id,
        category: rule.category,
        priority: rule.priority,
        confidence: rule.evidence.confidence,
        level: rule.lifecycle.level,
        maturity: rule.lifecycle.maturity,
        promotedReason: decision.reason,
        reviewSourceRefs: rule.trace?.reviewSourceRefs,
        promotionEvidenceSummary: rule.trace?.promotionEvidenceSummary,
      });
    }

    this.reflectionRepo.insert(withReviewState(reflection, promotedRules.length));

    return {
      reflectionId: reflection.id,
      promotedRules,
      rejected,
    };
  }

  getActiveRules(input: BehaviorRuleLookupInput = {}): BehaviorRule[] {
    const limit = input.limit ?? 8;
    const candidates = this.behaviorRepo.listActiveCandidates({
      userId: input.scope?.userId,
      channel: input.channel,
      limit: Math.max(60, limit * 5),
      includeInactive: input.includeInactive,
      includeDeprecated: input.includeDeprecated,
      includeFrozen: input.includeFrozen,
    });

    const ranked = rankBehaviorRules(candidates, input);
    const selected = ranked.slice(0, limit).map((item) => item.rule);

    return selected.map((rule) => {
      const appliedRule = markBehaviorRuleApplied(evaluateBehaviorLifecycle(rule));
      this.behaviorRepo.insert(appliedRule);
      return appliedRule;
    });
  }

  mutateRule(input: BehaviorRuleMutationInput): BehaviorRuleMutationResult {
    const rule = this.behaviorRepo.findById(input.ruleId);
    if (!rule) {
      return {
        action: input.action,
        rule: null,
        changed: false,
        reason: 'rule_not_found',
      };
    }

    const replacementRule = input.replacementRuleId
      ? this.behaviorRepo.findById(input.replacementRuleId)
      : null;
    if (input.action === 'rollback') {
      if (!input.replacementRuleId) {
        return {
          action: input.action,
          rule,
          changed: false,
          reason: 'replacement_rule_required',
        };
      }
      if (input.replacementRuleId === rule.id) {
        return {
          action: input.action,
          rule,
          changed: false,
          reason: 'replacement_rule_invalid',
        };
      }
      if (!replacementRule) {
        return {
          action: input.action,
          rule,
          changed: false,
          reason: 'replacement_rule_not_found',
        };
      }
      if (rule.state.deprecated && rule.state.supersededBy === input.replacementRuleId) {
        return {
          action: input.action,
          rule,
          changed: false,
          reason: 'already_rolled_back',
        };
      }
    }
    if (input.action === 'freeze' && rule.state.frozen && !rule.state.deprecated) {
      return {
        action: input.action,
        rule,
        changed: false,
        reason: 'already_frozen',
      };
    }
    if (input.action === 'deprecate' && rule.state.deprecated) {
      return {
        action: input.action,
        rule,
        changed: false,
        reason: 'already_deprecated',
      };
    }

    let updatedRule: BehaviorRule;
    if (input.action === 'freeze') {
      updatedRule = freezeBehaviorRule(rule, 'manual');
    } else if (input.action === 'deprecate') {
      updatedRule = freezeBehaviorRule(rule, 'deprecated');
    } else {
      updatedRule = freezeBehaviorRule(
        markBehaviorRuleContradicted(rule, { reason: 'rollback' }),
        'rollback',
      );
    }

    const timestamp = nowIso();
    updatedRule = {
      ...updatedRule,
      updatedAt: timestamp,
      state: {
        ...updatedRule.state,
        active: false,
        deprecated: input.action !== 'freeze',
        frozen: true,
        statusReason: input.reason ?? updatedRule.lifecycle.freezeReason,
        statusSourceReflectionId: input.reflectionId,
        statusChangedAt: timestamp,
        supersededBy: input.replacementRuleId ?? updatedRule.state.supersededBy,
      },
      lifecycle: {
        ...updatedRule.lifecycle,
        frozenAt: input.action === 'freeze' ? timestamp : updatedRule.lifecycle.frozenAt,
        freezeReason: input.action === 'freeze'
          ? 'manual'
          : input.action === 'deprecate'
            ? 'deprecated'
            : 'rollback',
        lastReviewedAt: timestamp,
      },
      trace: {
        ...updatedRule.trace,
        deactivatedByRuleId: input.replacementRuleId,
        deactivatedByReflectionId: input.reflectionId,
        deactivatedReason: input.reason ?? updatedRule.lifecycle.freezeReason,
        deactivatedAt: timestamp,
      },
    };

    this.behaviorRepo.insert(updatedRule);

    const debugKind = input.action === 'freeze'
      ? 'rule_frozen'
      : input.action === 'deprecate'
        ? 'rule_deprecated'
        : 'rule_rolled_back';
    this.debugRepo?.log(debugKind, updatedRule.id, {
      action: input.action,
      reason: input.reason,
      reflectionId: input.reflectionId,
      replacementRuleId: input.replacementRuleId,
      statusChangedAt: timestamp,
    });

    return {
      action: input.action,
      rule: updatedRule,
      changed: true,
      reason: input.reason ?? 'ok',
    };
  }

  reviewRule(ruleId: string): BehaviorRuleReviewRecord | null {
    const rule = this.behaviorRepo.findById(ruleId);
    if (!rule) {
      return null;
    }

    const reflectionId = rule.trace?.promotedFromReflectionId ?? rule.state.statusSourceReflectionId;
    const reflection = reflectionId ? this.reflectionRepo.findById(reflectionId) : null;
    const replacementRule = rule.state.supersededBy
      ? this.behaviorRepo.findById(rule.state.supersededBy)
      : null;

    return {
      rule,
      reflection: reflection
        ? {
            id: reflection.id,
            summary: reflection.analysis.summary,
            nextTimeRecommendation: reflection.analysis.nextTimeRecommendation,
            confidence: reflection.evidence.confidence,
            recurrenceCount: reflection.evidence.recurrenceCount,
            evidenceRefs: reflection.evidence.refs,
            reviewedAt: reflection.state.reviewedAt,
          }
        : undefined,
      replacementRule: replacementRule
        ? {
            id: replacementRule.id,
            statement: replacementRule.statement,
            category: replacementRule.category,
            priority: replacementRule.priority,
            active: replacementRule.state.active,
            deprecated: replacementRule.state.deprecated,
            frozen: replacementRule.state.frozen,
          }
        : undefined,
      sourceTrace: {
        promotedFromReflectionId: rule.trace?.promotedFromReflectionId,
        promotedReason: rule.trace?.promotedReason,
        promotedAt: rule.trace?.promotedAt,
        statusReason: rule.state.statusReason,
        statusChangedAt: rule.state.statusChangedAt,
        statusSourceReflectionId: rule.state.statusSourceReflectionId,
        deactivatedByRuleId: rule.trace?.deactivatedByRuleId,
        deactivatedByReflectionId: rule.trace?.deactivatedByReflectionId,
        deactivatedReason: rule.trace?.deactivatedReason,
        deactivatedAt: rule.trace?.deactivatedAt,
        reviewSourceRefs: Array.from(new Set([
          ...(rule.trace?.reviewSourceRefs ?? []),
          ...(reflection?.evidence.refs ?? []),
        ])),
      },
    };
  }

  listRecentRules(limit = 20): BehaviorRule[] {
    return this.behaviorRepo.listRecent(limit);
  }

  countActiveRules(userId?: string): number {
    return this.behaviorRepo.countActive(userId);
  }
}
