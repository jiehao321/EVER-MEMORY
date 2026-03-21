import { createInitialBehaviorLifecycle, freezeBehaviorRule, } from './lifecycle.js';
import { CATEGORY_DEFAULT_PRIORITY, LEVEL_BASELINE_CONFIDENCE_THRESHOLD, LEVEL_BASELINE_PRIORITY_THRESHOLD, LEVEL_CRITICAL_CONFIDENCE_THRESHOLD, LEVEL_CRITICAL_PRIORITY_THRESHOLD, PROMOTION_MAX_STATEMENT_LENGTH, PROMOTION_MIN_CONFIDENCE, PROMOTION_MIN_RECUR_DEFAULT, PROMOTION_MIN_RECUR_FOR_STYLE, PROMOTION_MIN_STATEMENT_LENGTH, PROMOTION_VALIDATED_RECURRENCE_THRESHOLD, } from '../../tuning.js';
import { EPHEMERAL_RULE_PATTERNS } from '../../patterns.js';
const SAFETY_KEYWORDS = ['高风险', '风险', '危险', '安全', 'risk', 'safe', 'danger'];
const CONFIRM_KEYWORDS = ['确认', '复述', '先问', 'confirm', 'confirmation'];
const MEMORY_KEYWORDS = ['检索', '回忆', '记忆', '复用', 'recall', 'memory'];
const PLANNING_KEYWORDS = ['计划', '阶段', '里程碑', 'plan', 'phase', 'milestone'];
const EXECUTION_KEYWORDS = ['执行', '操作', 'run', 'execute', 'action'];
const STYLE_KEYWORDS = ['风格', '语气', '简洁', '格式', 'style', 'tone', 'format'];
const CONFIRM_REQUIRED_KEYWORDS = ['先确认', '确认后', 'ask for confirmation', 'confirm before'];
const CONFIRM_SKIPPED_KEYWORDS = ['无需确认', '直接执行', 'skip confirmation', 'no confirmation'];
const VAGUE_PATTERNS = [
    /总是|永远|全部|所有场景/,
    /\b(always|never|everyone|all cases)\b/i,
];
function normalizeStatement(statement) {
    return statement.trim().replace(/\s+/g, ' ').toLowerCase();
}
function includesAny(statement, keywords) {
    const normalized = normalizeStatement(statement);
    return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}
function isVague(statement) {
    const normalized = statement.trim();
    return VAGUE_PATTERNS.some((pattern) => pattern.test(normalized));
}
function inferCategory(statement) {
    if (includesAny(statement, SAFETY_KEYWORDS)) {
        return 'safety';
    }
    if (includesAny(statement, CONFIRM_KEYWORDS)) {
        return 'confirmation';
    }
    if (includesAny(statement, MEMORY_KEYWORDS)) {
        return 'memory';
    }
    if (includesAny(statement, PLANNING_KEYWORDS)) {
        return 'planning';
    }
    if (includesAny(statement, EXECUTION_KEYWORDS)) {
        return 'execution';
    }
    if (includesAny(statement, STYLE_KEYWORDS)) {
        return 'style';
    }
    return 'execution';
}
function inferPriority(category) {
    switch (category) {
        case 'safety':
            return CATEGORY_DEFAULT_PRIORITY.safety;
        case 'confirmation':
            return CATEGORY_DEFAULT_PRIORITY.confirmation;
        case 'memory':
            return CATEGORY_DEFAULT_PRIORITY.memory;
        case 'planning':
            return CATEGORY_DEFAULT_PRIORITY.planning;
        case 'execution':
            return CATEGORY_DEFAULT_PRIORITY.execution;
        case 'style':
        default:
            return CATEGORY_DEFAULT_PRIORITY.style;
    }
}
function inferLevel(priority, confidence) {
    if (priority >= LEVEL_CRITICAL_PRIORITY_THRESHOLD || confidence >= LEVEL_CRITICAL_CONFIDENCE_THRESHOLD) {
        return 'critical';
    }
    if (priority >= LEVEL_BASELINE_PRIORITY_THRESHOLD || confidence >= LEVEL_BASELINE_CONFIDENCE_THRESHOLD) {
        return 'baseline';
    }
    return 'candidate';
}
function inferMaturity(recurrenceCount) {
    if (recurrenceCount >= PROMOTION_VALIDATED_RECURRENCE_THRESHOLD) {
        return 'validated';
    }
    return 'emerging';
}
export function inferRuleDuration(statement) {
    return EPHEMERAL_RULE_PATTERNS.some((pattern) => pattern.test(statement))
        ? 'ephemeral'
        : 'long_term';
}
function detectDirectConflict(statement, existingRules) {
    const requiresConfirm = includesAny(statement, CONFIRM_REQUIRED_KEYWORDS);
    const skipsConfirm = includesAny(statement, CONFIRM_SKIPPED_KEYWORDS);
    if (!requiresConfirm && !skipsConfirm) {
        return null;
    }
    return existingRules.find((rule) => {
        if (!rule.state.active || rule.state.deprecated) {
            return false;
        }
        if (requiresConfirm && includesAny(rule.statement, CONFIRM_SKIPPED_KEYWORDS)) {
            return true;
        }
        if (skipsConfirm && includesAny(rule.statement, CONFIRM_REQUIRED_KEYWORDS)) {
            return true;
        }
        return false;
    }) ?? null;
}
export function freezeConflictingRules(statement, existingRules) {
    const conflict = detectDirectConflict(statement, existingRules);
    if (!conflict) {
        return [];
    }
    return [freezeBehaviorRule(conflict, 'conflict')];
}
export function buildPromotedRuleGovernance(input) {
    const lifecycle = createInitialBehaviorLifecycle({
        priority: input.priority,
        confidence: input.confidence,
        now: input.now,
    });
    return {
        ...lifecycle,
        level: inferLevel(input.priority, input.confidence),
        maturity: inferMaturity(input.recurrenceCount),
    };
}
export function evaluatePromotionCandidate(input) {
    const statement = input.statement.trim();
    const category = inferCategory(statement);
    const priority = inferPriority(category);
    const normalized = normalizeStatement(statement);
    const existingNormalized = new Set(input.existingRules
        .filter((rule) => rule.state.active && !rule.state.deprecated)
        .map((rule) => normalizeStatement(rule.statement)));
    if (statement.length < PROMOTION_MIN_STATEMENT_LENGTH) {
        return {
            accepted: false,
            reason: 'statement_too_short',
            statement,
        };
    }
    if (statement.length > PROMOTION_MAX_STATEMENT_LENGTH) {
        return {
            accepted: false,
            reason: 'statement_too_long',
            statement,
        };
    }
    if (isVague(statement)) {
        return {
            accepted: false,
            reason: 'statement_too_vague',
            statement,
        };
    }
    if (input.reflection.evidence.confidence < PROMOTION_MIN_CONFIDENCE) {
        return {
            accepted: false,
            reason: 'insufficient_confidence',
            statement,
        };
    }
    if (category === 'style' && input.reflection.evidence.recurrenceCount < PROMOTION_MIN_RECUR_FOR_STYLE) {
        return {
            accepted: false,
            reason: 'insufficient_recurrence_for_style',
            statement,
        };
    }
    if (category !== 'safety' && input.reflection.evidence.recurrenceCount < PROMOTION_MIN_RECUR_DEFAULT) {
        return {
            accepted: false,
            reason: 'insufficient_recurrence',
            statement,
        };
    }
    if (existingNormalized.has(normalized)) {
        return {
            accepted: false,
            reason: 'duplicate_rule',
            statement,
        };
    }
    if (detectDirectConflict(statement, input.existingRules)) {
        return {
            accepted: false,
            reason: 'conflicts_with_existing_rule',
            statement,
        };
    }
    return {
        accepted: true,
        reason: 'promoted',
        statement,
        category,
        priority,
        level: inferLevel(priority, input.reflection.evidence.confidence),
        maturity: inferMaturity(input.reflection.evidence.recurrenceCount),
    };
}
