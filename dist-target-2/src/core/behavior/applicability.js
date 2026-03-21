import { APPLICABILITY_CHANNEL_MATCH_BONUS, APPLICABILITY_CONTEXT_MATCH_BONUS, APPLICABILITY_GLOBAL_SCOPE_BONUS, APPLICABILITY_INTENT_MATCH_BONUS, APPLICABILITY_NO_CHANNEL_BONUS, APPLICABILITY_NO_CONTEXT_BONUS, APPLICABILITY_NO_INTENT_BONUS, APPLICABILITY_USER_SCOPE_MATCH_BONUS, } from '../../tuning.js';
function normalize(value) {
    return value.trim().toLowerCase();
}
function includesNormalized(values, target) {
    const normalizedTarget = normalize(target);
    return values.some((value) => normalize(value) === normalizedTarget);
}
function intersectsNormalized(left, right) {
    const rightSet = new Set(right.map((item) => normalize(item)));
    return left.some((item) => rightSet.has(normalize(item)));
}
export function evaluateRuleApplicability(rule, input) {
    if (!rule.state.active || rule.state.deprecated) {
        return {
            applicable: false,
            score: 0,
            reasons: ['inactive'],
        };
    }
    const reasons = [];
    let score = 1;
    if (rule.appliesTo.userId) {
        if (!input.scope?.userId || normalize(input.scope.userId) !== normalize(rule.appliesTo.userId)) {
            return {
                applicable: false,
                score: 0,
                reasons: ['user_scope_mismatch'],
            };
        }
        score += APPLICABILITY_USER_SCOPE_MATCH_BONUS;
        reasons.push('user_scope_match');
    }
    else {
        score += APPLICABILITY_GLOBAL_SCOPE_BONUS;
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
        score += APPLICABILITY_CHANNEL_MATCH_BONUS;
        reasons.push('channel_match');
    }
    else {
        score += APPLICABILITY_NO_CHANNEL_BONUS;
    }
    if (rule.appliesTo.intentTypes && rule.appliesTo.intentTypes.length > 0) {
        if (!input.intentType || !includesNormalized(rule.appliesTo.intentTypes, input.intentType)) {
            return {
                applicable: false,
                score: 0,
                reasons: ['intent_mismatch'],
            };
        }
        score += APPLICABILITY_INTENT_MATCH_BONUS;
        reasons.push('intent_match');
    }
    else {
        score += APPLICABILITY_NO_INTENT_BONUS;
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
        score += APPLICABILITY_CONTEXT_MATCH_BONUS;
        reasons.push('context_match');
    }
    else {
        score += APPLICABILITY_NO_CONTEXT_BONUS;
    }
    return {
        applicable: true,
        score,
        reasons,
    };
}
