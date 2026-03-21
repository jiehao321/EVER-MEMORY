import { randomUUID } from 'node:crypto';
import { evaluateBehaviorLifecycle, freezeBehaviorRule, markBehaviorRuleApplied, markBehaviorRuleContradicted, } from './lifecycle.js';
import { buildPromotedRuleGovernance, evaluatePromotionCandidate, freezeConflictingRules, inferRuleDuration, } from './promotion.js';
import { rankBehaviorRules } from './ranking.js';
import { BEHAVIOR_CANDIDATE_FETCH_MULTIPLIER, BEHAVIOR_DEFAULT_ACTIVE_RULES_LIMIT, BEHAVIOR_DEFAULT_RECENT_RULES_LIMIT, BEHAVIOR_MIN_CANDIDATE_FETCH, BEHAVIOR_PROMOTION_CANDIDATE_LIMIT, EMERGING_AUTO_DEMOTE_DAYS, } from '../../tuning.js';
function nowIso() {
    return new Date().toISOString();
}
function mergeTags(...groups) {
    return Array.from(new Set(groups.flatMap((group) => group ?? []).filter((tag) => tag.trim().length > 0)));
}
function withReviewState(reflection, promotedCount) {
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
    behaviorRepo;
    reflectionRepo;
    debugRepo;
    constructor(behaviorRepo, reflectionRepo, debugRepo) {
        this.behaviorRepo = behaviorRepo;
        this.reflectionRepo = reflectionRepo;
        this.debugRepo = debugRepo;
    }
    listPendingReflections(limit = 20) {
        return this.reflectionRepo.listRecent(limit).filter((reflection) => !reflection.state.promoted
            && !reflection.state.rejected
            && reflection.candidateRules.length > 0);
    }
    promoteFromReflection(input) {
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
            limit: BEHAVIOR_PROMOTION_CANDIDATE_LIMIT,
        });
        const promotedRules = [];
        const rejected = [];
        const frozenLog = [];
        const rejectedLog = [];
        // Capture a single timestamp for the entire promotion batch so all records are consistent
        const batchTimestamp = nowIso();
        // A9: Wrap all DB writes in a single transaction for atomicity
        this.behaviorRepo.transaction(() => {
            for (const candidate of reflection.candidateRules) {
                const frozenRules = freezeConflictingRules(candidate, [...existingRules, ...promotedRules]);
                for (const frozenRule of frozenRules) {
                    const governedFrozenRule = {
                        ...frozenRule,
                        state: {
                            ...frozenRule.state,
                            frozen: true,
                            statusReason: frozenRule.lifecycle.freezeReason,
                            statusSourceReflectionId: reflection.id,
                            statusChangedAt: batchTimestamp,
                        },
                        trace: {
                            ...frozenRule.trace,
                            reviewSourceRefs: Array.from(new Set([
                                ...(frozenRule.trace?.reviewSourceRefs ?? []),
                                ...reflection.evidence.refs,
                            ])),
                            deactivatedByReflectionId: reflection.id,
                            deactivatedReason: frozenRule.lifecycle.freezeReason,
                            deactivatedAt: batchTimestamp,
                        },
                    };
                    this.behaviorRepo.insert(governedFrozenRule);
                    frozenLog.push({ id: governedFrozenRule.id, reflectionId: reflection.id, reason: governedFrozenRule.lifecycle.freezeReason, statement: governedFrozenRule.statement });
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
                    rejectedLog.push({ reflectionId: reflection.id, statement: decision.statement, reason: decision.reason });
                    continue;
                }
                const timestamp = batchTimestamp;
                const lifecycle = {
                    ...buildPromotedRuleGovernance({
                        priority: decision.priority,
                        confidence: reflection.evidence.confidence,
                        recurrenceCount: reflection.evidence.recurrenceCount,
                        now: timestamp,
                    }),
                    duration: inferRuleDuration(decision.statement),
                };
                const rule = {
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
                    lifecycle,
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
                        sourceExperienceIds: reflection.trigger.experienceIds,
                    },
                    tags: mergeTags(input.tags),
                };
                this.behaviorRepo.insert(rule);
                promotedRules.push(rule);
            }
            this.reflectionRepo.insert(withReviewState(reflection, promotedRules.length));
        });
        // Emit debug logs outside transaction (best-effort, append-only)
        for (const entry of frozenLog) {
            this.debugRepo?.log('rule_frozen', entry.id, {
                reflectionId: entry.reflectionId,
                reason: entry.reason,
                statement: entry.statement,
            });
        }
        for (const entry of rejectedLog) {
            this.debugRepo?.log('rule_rejected', entry.reflectionId, {
                reflectionId: entry.reflectionId,
                statement: entry.statement,
                reason: entry.reason,
            });
        }
        for (const rule of promotedRules) {
            this.debugRepo?.log('rule_promoted', rule.id, {
                reflectionId: reflection.id,
                category: rule.category,
                priority: rule.priority,
                confidence: rule.evidence.confidence,
                level: rule.lifecycle.level,
                maturity: rule.lifecycle.maturity,
                tags: rule.tags,
                promotedReason: rule.trace?.promotedReason,
                reviewSourceRefs: rule.trace?.reviewSourceRefs,
                promotionEvidenceSummary: rule.trace?.promotionEvidenceSummary,
            });
        }
        return {
            reflectionId: reflection.id,
            promotedRules,
            rejected,
        };
    }
    getActiveRules(input = {}) {
        const limit = input.limit ?? BEHAVIOR_DEFAULT_ACTIVE_RULES_LIMIT;
        const candidates = this.behaviorRepo.listActiveCandidates({
            userId: input.scope?.userId,
            channel: input.channel,
            limit: Math.max(BEHAVIOR_MIN_CANDIDATE_FETCH, limit * BEHAVIOR_CANDIDATE_FETCH_MULTIPLIER),
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
    mutateRule(input) {
        const rule = this.behaviorRepo.findById(input.ruleId);
        if (!rule) {
            return {
                action: input.action,
                rule: null,
                changed: false,
                reason: 'rule_not_found',
            };
        }
        if (input.action === 'rollback') {
            if (input.replacementRuleId) {
                // Replacement-based rollback: freeze and supersede with the given rule
                if (input.replacementRuleId === rule.id) {
                    return {
                        action: input.action,
                        rule,
                        changed: false,
                        reason: 'replacement_rule_invalid',
                    };
                }
                const replacementRuleForRollback = this.behaviorRepo.findById(input.replacementRuleId);
                if (!replacementRuleForRollback) {
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
                const tsReplace = nowIso();
                const contradictedFrozen = freezeBehaviorRule(markBehaviorRuleContradicted(rule, { reason: 'rollback' }), 'rollback');
                const frozenRule = {
                    ...contradictedFrozen,
                    updatedAt: tsReplace,
                    state: {
                        ...contradictedFrozen.state,
                        active: false,
                        deprecated: true,
                        frozen: true,
                        statusReason: input.reason ?? 'rollback',
                        statusSourceReflectionId: input.reflectionId,
                        statusChangedAt: tsReplace,
                        supersededBy: input.replacementRuleId,
                    },
                    lifecycle: {
                        ...contradictedFrozen.lifecycle,
                        freezeReason: 'rollback',
                        lastReviewedAt: tsReplace,
                    },
                    trace: {
                        ...rule.trace,
                        deactivatedByRuleId: input.replacementRuleId,
                        deactivatedByReflectionId: input.reflectionId,
                        deactivatedReason: input.reason ?? 'rollback',
                        deactivatedAt: tsReplace,
                    },
                };
                this.behaviorRepo.insert(frozenRule);
                this.debugRepo?.log('rule_rolled_back', frozenRule.id, {
                    action: input.action,
                    reason: input.reason,
                    reflectionId: input.reflectionId,
                    replacementRuleId: input.replacementRuleId,
                    statusChangedAt: tsReplace,
                });
                return {
                    action: input.action,
                    rule: frozenRule,
                    changed: true,
                    reason: input.reason ?? 'ok',
                };
            }
            // Revert-to-candidate rollback: no replacement needed
            if (rule.state.statusReason === 'rolled_back' && rule.lifecycle.level === 'candidate' && !rule.state.active) {
                return {
                    action: input.action,
                    rule,
                    changed: false,
                    reason: 'already_rolled_back',
                };
            }
            const timestamp = nowIso();
            const rolledBackRule = {
                ...rule,
                updatedAt: timestamp,
                state: {
                    ...rule.state,
                    active: false,
                    statusReason: 'rolled_back',
                    statusChangedAt: timestamp,
                    statusSourceReflectionId: input.reflectionId ?? rule.state.statusSourceReflectionId,
                },
                lifecycle: {
                    ...rule.lifecycle,
                    level: 'candidate',
                    maturity: 'emerging',
                    lastReviewedAt: timestamp,
                },
                trace: {
                    ...rule.trace,
                    deactivatedByReflectionId: input.reflectionId ?? rule.trace?.deactivatedByReflectionId,
                    deactivatedReason: input.reason ?? 'rolled_back',
                    deactivatedAt: timestamp,
                },
            };
            this.behaviorRepo.insert(rolledBackRule);
            this.debugRepo?.log('rule_rolled_back', rolledBackRule.id, {
                action: input.action,
                reason: input.reason,
                reflectionId: input.reflectionId,
                statusChangedAt: timestamp,
            });
            return {
                action: input.action,
                rule: rolledBackRule,
                changed: true,
                reason: input.reason ?? 'ok',
                rolledBack: true,
            };
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
        let updatedRule;
        if (input.action === 'freeze') {
            updatedRule = freezeBehaviorRule(rule, 'manual');
        }
        else {
            updatedRule = freezeBehaviorRule(rule, 'deprecated');
        }
        const replacementRule = input.replacementRuleId
            ? this.behaviorRepo.findById(input.replacementRuleId)
            : null;
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
                freezeReason: input.action === 'freeze' ? 'manual' : 'deprecated',
                lastReviewedAt: timestamp,
            },
            trace: {
                ...updatedRule.trace,
                deactivatedByRuleId: replacementRule?.id,
                deactivatedByReflectionId: input.reflectionId,
                deactivatedReason: input.reason ?? updatedRule.lifecycle.freezeReason,
                deactivatedAt: timestamp,
            },
        };
        this.behaviorRepo.insert(updatedRule);
        const debugKind = input.action === 'freeze' ? 'rule_frozen' : 'rule_deprecated';
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
    reviewRule(ruleId) {
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
    listRecentRules(limit = BEHAVIOR_DEFAULT_RECENT_RULES_LIMIT) {
        return this.behaviorRepo.listRecent(limit);
    }
    freezeRulesByDuration(input) {
        const timestamp = nowIso();
        const timestampDate = new Date(timestamp);
        const rules = this.behaviorRepo.listByDuration({
            duration: input.duration,
            userId: input.userId,
            channel: input.channel,
        });
        const buildFrozenRule = (rule) => {
            const frozen = freezeBehaviorRule(rule, input.reason, timestampDate);
            return {
                ...frozen,
                updatedAt: timestamp,
                state: {
                    ...frozen.state,
                    active: false,
                    deprecated: true,
                    frozen: true,
                    statusReason: input.reason,
                    statusChangedAt: timestamp,
                },
                lifecycle: {
                    ...frozen.lifecycle,
                    freezeReason: input.reason,
                    frozenAt: timestamp,
                    lastReviewedAt: timestamp,
                    maturity: 'frozen',
                    level: 'candidate',
                },
                trace: {
                    ...rule.trace,
                    deactivatedReason: input.reason,
                    deactivatedAt: timestamp,
                },
            };
        };
        const frozenRules = this.behaviorRepo.transaction(() => rules.map((rule) => {
            const frozenRule = buildFrozenRule(rule);
            this.behaviorRepo.insert(frozenRule);
            return frozenRule;
        }));
        for (const frozenRule of frozenRules) {
            this.debugRepo?.log('rule_frozen', frozenRule.id, {
                reason: input.reason,
                statement: frozenRule.statement,
                duration: frozenRule.lifecycle.duration,
                statusChangedAt: timestamp,
            });
        }
        return frozenRules;
    }
    demoteStaleEmergingRules() {
        const staleRules = this.behaviorRepo.listStaleEmerging(EMERGING_AUTO_DEMOTE_DAYS);
        if (staleRules.length === 0) {
            return 0;
        }
        const timestamp = nowIso();
        const demotedRules = this.behaviorRepo.transaction(() => staleRules.map((rule) => {
            const demoted = {
                ...rule,
                updatedAt: timestamp,
                lifecycle: {
                    ...rule.lifecycle,
                    maturity: 'emerging',
                    level: 'candidate',
                },
                state: {
                    ...rule.state,
                    active: false,
                    statusReason: 'stale_emerging_demoted',
                    statusChangedAt: timestamp,
                },
            };
            this.behaviorRepo.insert(demoted);
            return demoted;
        }));
        for (const rule of demotedRules) {
            this.debugRepo?.log('rule_stale_demoted', rule.id, {
                statement: rule.statement,
                category: rule.category,
                demotedAt: timestamp,
                reason: 'stale_emerging_demoted',
            });
        }
        return demotedRules.length;
    }
    countActiveRules(userId) {
        return this.behaviorRepo.countActive(userId);
    }
}
