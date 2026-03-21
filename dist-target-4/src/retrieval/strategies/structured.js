import { DEFAULT_RECALL_LIMIT, HIGH_VALUE_PROJECT_PRIORITY_THRESHOLD, PROJECT_ROUTE_MAX_LIMIT, RECALL_DEEP_MAX, RECALL_DEEP_MIN, RECALL_LIGHT_MAX, RECALL_TARGETED_MAX, RECALL_TARGETED_MIN, } from '../../tuning.js';
import { NEXT_STEP_PATTERNS, PROJECT_PROGRESS_ROUTE_PATTERNS, PROJECT_STAGE_ROUTE_PATTERNS, PROJECT_STATUS_PATTERNS, } from '../../patterns.js';
import { rankKeywordRecall } from './keyword.js';
import { pickIntentQuery, resolvePositiveInteger, sanitizeInputText } from './support.js';
const LAST_DECISION_PATTERNS = [
    /\b(last decision|latest decision|what did we decide|why did we decide)\b/i,
    /(最近决策|最近决定|最后决策|上次决定|上次决策|最终决定|为什么这样决定|为什么这么决定|为什么这么做)/,
];
const PROJECT_ORIENTED_INTENTS = new Set(['planning', 'status_update']);
const PROJECT_SIGNAL_PATTERNS = [
    /\b(project|phase|milestone|roadmap|plan)\b/i,
    /(项目|阶段|里程碑|路线图|计划|推进)/,
    ...PROJECT_STATUS_PATTERNS,
    ...PROJECT_PROGRESS_ROUTE_PATTERNS,
    ...PROJECT_STAGE_ROUTE_PATTERNS,
];
const PROJECT_ROUTE_KIND_PRIORITY = {
    last_decision: 4,
    next_step: 3,
    current_stage: 2,
    project_progress: 1,
};
const PROJECT_ROUTE_PATTERNS = {
    project_progress: PROJECT_PROGRESS_ROUTE_PATTERNS,
    current_stage: PROJECT_STAGE_ROUTE_PATTERNS,
    next_step: NEXT_STEP_PATTERNS,
    last_decision: LAST_DECISION_PATTERNS,
};
const PROJECT_ROUTE_TYPE_PRIORITY = {
    project_progress: ['summary', 'project', 'decision', 'commitment', 'constraint', 'task'],
    current_stage: ['summary', 'project', 'decision', 'commitment', 'constraint', 'task'],
    next_step: ['commitment', 'decision', 'summary', 'project', 'task', 'constraint'],
    last_decision: ['decision', 'summary', 'project', 'constraint', 'commitment'],
};
const PROJECT_ROUTE_ANCHOR_PRIORITY = {
    project_progress: ['summary', 'project', 'decision'],
    current_stage: ['summary', 'project', 'decision'],
    next_step: ['commitment', 'decision', 'summary'],
    last_decision: ['decision', 'summary', 'project'],
};
const PROJECT_ROUTE_QUERY = {
    project_progress: '项目进展 项目连续性摘要 项目状态 最近决策 下一步',
    current_stage: '当前阶段 阶段状态 项目状态 最近决策',
    next_step: '下一步 后续动作 commitment 最近决策',
    last_decision: '最近决策 最终决定 decision 原因',
};
function routeScore(text, patterns) {
    return patterns.reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0);
}
function hasProjectSignal(text) {
    return PROJECT_SIGNAL_PATTERNS.some((pattern) => pattern.test(text));
}
function mergeOrderedTypes(primary, secondary) {
    const output = [];
    const seen = new Set();
    for (const type of [...primary, ...secondary]) {
        if (!seen.has(type)) {
            seen.add(type);
            output.push(type);
        }
    }
    return output;
}
function normalizeDedupKey(content) {
    return content
        .replace(/^(项目状态更新：|关键约束：|最近决策：|下一步：|项目连续性摘要（[^）]+）：)\s*/u, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}
function toStrategyItem(memory, baseScore, support, meta) {
    const policyScore = support.applyRecallPolicyScore(memory, baseScore, meta);
    return {
        memory,
        score: policyScore.score,
        keywordScore: 0,
        semanticScore: 0,
        baseScore,
        projectPriority: policyScore.projectPriority,
        dataQuality: policyScore.dataQuality,
        dataClass: policyScore.dataClass,
    };
}
export class StructuredRetrievalStrategy {
    support;
    maxRecall;
    keywordWeights;
    semanticEnabled;
    semanticRepo;
    constructor(support, maxRecall, keywordWeights, semanticEnabled, semanticRepo) {
        this.support = support;
        this.maxRecall = maxRecall;
        this.keywordWeights = keywordWeights;
        this.semanticEnabled = semanticEnabled;
        this.semanticRepo = semanticRepo;
    }
    prepareIntentRecall(request) {
        const memoryNeed = request.intent.signals.memoryNeed;
        const rawText = request.query?.trim() || request.intent.rawText;
        const intentProjectOriented = PROJECT_ORIENTED_INTENTS.has(request.intent.intent.type);
        const route = this.detectProjectRoute(rawText, {
            hasProjectScope: Boolean(request.scope?.project),
            intentProjectOriented,
        });
        const routeKind = route.routeKind;
        const routeApplied = route.routeApplied;
        const projectOriented = routeApplied || intentProjectOriented || route.projectSignal;
        const preferredTypes = mergeOrderedTypes(routeApplied ? PROJECT_ROUTE_TYPE_PRIORITY[routeKind] : [], request.intent.retrievalHints.preferredTypes);
        const requested = resolvePositiveInteger(request.limit, DEFAULT_RECALL_LIMIT);
        const byNeed = memoryNeed === 'light'
            ? Math.min(requested, RECALL_LIGHT_MAX)
            : memoryNeed === 'targeted'
                ? Math.max(RECALL_TARGETED_MIN, Math.min(requested, RECALL_TARGETED_MAX))
                : Math.max(RECALL_DEEP_MIN, Math.min(requested, RECALL_DEEP_MAX));
        const routed = routeApplied
            ? Math.min(byNeed, PROJECT_ROUTE_MAX_LIMIT[routeKind])
            : byNeed;
        const baseQuery = pickIntentQuery(rawText, memoryNeed);
        const query = routeApplied
            ? [baseQuery, PROJECT_ROUTE_QUERY[routeKind], request.scope?.project]
                .filter((part) => Boolean(part && part.trim()))
                .join(' ')
            : baseQuery;
        return {
            request: {
                query,
                scope: request.scope,
                types: preferredTypes.length > 0 ? preferredTypes : undefined,
                lifecycles: this.resolveIntentLifecycles(memoryNeed, projectOriented),
                mode: request.mode ?? (memoryNeed === 'deep' ? 'hybrid' : 'keyword'),
                limit: Math.min(routed, this.maxRecall),
            },
            meta: {
                routeKind,
                routeApplied,
                projectOriented,
                routeReason: route.routeReason,
                routeScore: route.routeScore,
                routeProjectSignal: route.projectSignal,
                hasProjectScope: Boolean(request.scope?.project),
                intentProjectOriented,
            },
        };
    }
    deriveExecutionMeta(request) {
        const route = this.detectProjectRoute(request.query, {
            hasProjectScope: Boolean(request.scope?.project),
            intentProjectOriented: false,
        });
        return {
            routeKind: route.routeKind,
            routeApplied: route.routeApplied,
            projectOriented: route.routeApplied || route.projectSignal,
            routeReason: route.routeReason,
            routeScore: route.routeScore,
            routeProjectSignal: route.projectSignal,
            hasProjectScope: Boolean(request.scope?.project),
            intentProjectOriented: false,
        };
    }
    resolveMode(mode) {
        if (!mode) {
            return 'keyword';
        }
        if (mode === 'hybrid' && (!this.semanticEnabled || !this.semanticRepo)) {
            return 'keyword';
        }
        return mode;
    }
    rank(request, limit, meta) {
        const loaded = this.support.loadCandidates(request, limit, false, meta);
        const candidateResult = this.support.applyCandidatePolicy(loaded, limit, meta);
        return {
            ranked: rankKeywordRecall(candidateResult.candidates, { ...request, query: '' }, {
                weights: this.keywordWeights,
            }).map((entry) => toStrategyItem(entry.memory, entry.score, this.support, meta)),
            candidates: candidateResult.candidates,
            semanticHitCount: 0,
            candidatePolicy: candidateResult.stats,
        };
    }
    selectTopRanked(ranked, limit, meta) {
        const highValue = meta.projectOriented
            ? ranked.filter((entry) => entry.projectPriority >= HIGH_VALUE_PROJECT_PRIORITY_THRESHOLD)
            : [];
        const ordered = meta.projectOriented
            ? [...highValue, ...ranked.filter((entry) => entry.projectPriority < HIGH_VALUE_PROJECT_PRIORITY_THRESHOLD)]
            : ranked;
        const selected = [];
        const selectedIds = new Set();
        const seenKeys = new Set();
        let duplicateItemsRemoved = 0;
        let routeAnchorItemsSelected = 0;
        const trySelect = (entry) => {
            if (selected.length >= limit || selectedIds.has(entry.memory.id)) {
                return false;
            }
            const key = normalizeDedupKey(entry.memory.content);
            if (key.length > 0 && seenKeys.has(key)) {
                duplicateItemsRemoved += 1;
                return false;
            }
            if (key.length > 0) {
                seenKeys.add(key);
            }
            selected.push(entry);
            selectedIds.add(entry.memory.id);
            return true;
        };
        if (meta.routeApplied && meta.routeKind !== 'none') {
            for (const type of PROJECT_ROUTE_ANCHOR_PRIORITY[meta.routeKind]) {
                const candidate = ordered.find((entry) => entry.memory.type === type && !selectedIds.has(entry.memory.id));
                if (candidate && trySelect(candidate)) {
                    routeAnchorItemsSelected += 1;
                }
                if (selected.length >= limit) {
                    break;
                }
            }
        }
        for (const entry of ordered) {
            trySelect(entry);
            if (selected.length >= limit) {
                break;
            }
        }
        return {
            top: selected,
            selectionStats: {
                duplicateItemsRemoved,
                highValueItemsSelected: selected.filter((entry) => entry.projectPriority >= HIGH_VALUE_PROJECT_PRIORITY_THRESHOLD).length,
                routeAnchorItemsSelected,
                selectedTypeCounts: selected.reduce((acc, entry) => {
                    acc[entry.memory.type] = (acc[entry.memory.type] ?? 0) + 1;
                    return acc;
                }, {}),
            },
        };
    }
    detectProjectRoute(text, options = {}) {
        const normalized = sanitizeInputText(text);
        if (!normalized) {
            return {
                routeKind: 'none',
                routeApplied: false,
                routeScore: 0,
                routeReason: 'none',
                projectSignal: false,
            };
        }
        const scored = Object.entries(PROJECT_ROUTE_PATTERNS)
            .map(([kind, patterns]) => ({
            kind: kind,
            score: routeScore(normalized, patterns),
            priority: PROJECT_ROUTE_KIND_PRIORITY[kind],
        }))
            .filter((item) => item.score > 0)
            .sort((left, right) => {
            if (right.score !== left.score) {
                return right.score - left.score;
            }
            return right.priority - left.priority;
        });
        if (scored.length === 0) {
            return {
                routeKind: 'none',
                routeApplied: false,
                routeScore: 0,
                routeReason: 'none',
                projectSignal: hasProjectSignal(normalized),
            };
        }
        const top = scored[0];
        const projectSignal = hasProjectSignal(normalized);
        const hasProjectScope = options.hasProjectScope === true;
        const intentProjectOriented = options.intentProjectOriented === true;
        if (!projectSignal && !hasProjectScope && !intentProjectOriented) {
            return {
                routeKind: 'none',
                routeApplied: false,
                routeScore: top.score,
                routeReason: 'pattern_without_project_context',
                projectSignal,
            };
        }
        return {
            routeKind: top.kind,
            routeApplied: true,
            routeScore: top.score,
            routeReason: projectSignal
                ? 'project_signal'
                : hasProjectScope
                    ? 'scope_project'
                    : 'intent_project',
            projectSignal,
        };
    }
    resolveIntentLifecycles(memoryNeed, projectOriented) {
        if (projectOriented || memoryNeed === 'deep') {
            return ['semantic', 'episodic'];
        }
        if (memoryNeed === 'targeted') {
            return ['semantic'];
        }
        return undefined;
    }
}
