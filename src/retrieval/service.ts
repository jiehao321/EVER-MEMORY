import {
  DEFAULT_RETRIEVAL_HYBRID_WEIGHTS,
  DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS,
} from '../constants.js';
import type { DebugRepository } from '../storage/debugRepo.js';
import type { MemoryRepository } from '../storage/memoryRepo.js';
import type { SemanticRepository } from '../storage/semanticRepo.js';
import type {
  MemoryDataClass,
  MemoryItem,
  MemoryLifecycle,
  MemoryType,
  RecallForIntentRequest,
  RecallRequest,
  RecallResult,
  RetrievalHybridWeights,
  RetrievalKeywordWeights,
  RetrievalMode,
} from '../types.js';
import { rankKeywordRecall } from './keyword.js';

interface RetrievalServiceOptions {
  semanticEnabled?: boolean;
  semanticRepo?: SemanticRepository;
  semanticCandidateLimit?: number;
  semanticMinScore?: number;
  maxRecall?: number;
  keywordWeights?: Partial<RetrievalKeywordWeights>;
  hybridWeights?: Partial<RetrievalHybridWeights>;
}

type ProjectRecallRouteKind =
  | 'none'
  | 'project_progress'
  | 'current_stage'
  | 'next_step'
  | 'last_decision';

interface RecallExecutionMeta {
  routeKind: ProjectRecallRouteKind;
  routeApplied: boolean;
  projectOriented: boolean;
  routeReason: 'none' | 'project_signal' | 'scope_project' | 'intent_project' | 'pattern_without_project_context';
  routeScore: number;
  routeProjectSignal: boolean;
  hasProjectScope: boolean;
  intentProjectOriented: boolean;
}

interface CandidatePolicyStats {
  initialCandidates: number;
  filteredCandidates: number;
  suppressedTestCandidates: number;
  retainedTestCandidates: number;
  suppressedLowValueCandidates: number;
  retainedLowValueCandidates: number;
  filterMode: 'default' | 'project_strict';
  dataClassCounts: Record<MemoryDataClass, number>;
}

interface RecallSelectionStats {
  duplicateItemsRemoved: number;
  highValueItemsSelected: number;
  routeAnchorItemsSelected: number;
  selectedTypeCounts: Partial<Record<MemoryType, number>>;
}

interface ProjectRouteDetection {
  routeKind: ProjectRecallRouteKind;
  routeApplied: boolean;
  routeScore: number;
  routeReason: RecallExecutionMeta['routeReason'];
  projectSignal: boolean;
}

interface ScoredRecallItem {
  memory: MemoryItem;
  score: number;
  keywordScore: number;
  semanticScore: number;
  baseScore: number;
  projectPriority: number;
  dataQuality: number;
  dataClass: MemoryDataClass;
}

const DEFAULT_RECALL_LIMIT = 8;

const DEEP_QUERY_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'then', 'into', 'about', 'please', 'help',
  '之前', '上次', '一下', '继续', '我们', '你们', '这个', '那个', '请',
  '结合', '推进', '下一', '一步', '保持', '并且', '然后',
]);

const DEEP_QUERY_PRIORITY_TERMS = [
  '项目', '计划', '里程碑', '阶段', '任务', '约束', '决策', '风险', '质量', '回滚', '门禁',
  'project', 'plan', 'milestone', 'phase', 'task', 'constraint', 'decision', 'risk', 'quality', 'rollback',
] as const;

const PROJECT_PROGRESS_PATTERNS = [
  /\b(project progress|latest progress|progress update|status update|where are we|how far)\b/i,
  /(项目进展|项目进度|当前进展|最近进展|进度|目前进展|到哪了|到哪里了|现在到哪一步了|刚才说到哪了|汇报)/,
];

const CURRENT_STAGE_PATTERNS = [
  /\b(current stage|current phase|which phase|what stage|stage now|phase now)\b/i,
  /(当前阶段|现在阶段|当前处于哪个阶段|现在到哪个阶段|第几阶段|阶段状态|phase\s*\d+|phase)/i,
];

const NEXT_STEP_PATTERNS = [
  /\b(next step|what next|next action|follow\s*up|next milestone)\b/i,
  /(下一步|下一步计划|下一步安排|接下来|接下来做什么|后续动作|后续计划|下一阶段|下一项)/,
];

const LAST_DECISION_PATTERNS = [
  /\b(last decision|latest decision|what did we decide|why did we decide)\b/i,
  /(最近决策|最近决定|最后决策|上次决定|上次决策|最终决定|为什么这样决定|为什么这么决定|为什么这么做)/,
];

const PROJECT_ORIENTED_INTENTS = new Set(['planning', 'status_update']);
const PROJECT_ORIENTED_QUERY_PATTERNS = [
  /(\bproject\b|\bphase\b|\bmilestone\b|\broadmap\b|\bbatch\b|\bprogress\b|\bstage\b|\bstatus\b)/i,
  /(项目|阶段|里程碑|路线图|批次|进展|状态)/,
];

const PROJECT_ROUTE_KIND_PRIORITY: Record<Exclude<ProjectRecallRouteKind, 'none'>, number> = {
  last_decision: 4,
  next_step: 3,
  current_stage: 2,
  project_progress: 1,
};

const PROJECT_ROUTE_PATTERNS: Record<Exclude<ProjectRecallRouteKind, 'none'>, RegExp[]> = {
  project_progress: PROJECT_PROGRESS_PATTERNS,
  current_stage: CURRENT_STAGE_PATTERNS,
  next_step: NEXT_STEP_PATTERNS,
  last_decision: LAST_DECISION_PATTERNS,
};

const PROJECT_ROUTE_TYPE_PRIORITY: Record<Exclude<ProjectRecallRouteKind, 'none'>, MemoryType[]> = {
  project_progress: ['summary', 'project', 'decision', 'commitment', 'constraint', 'task'],
  current_stage: ['summary', 'project', 'decision', 'commitment', 'constraint', 'task'],
  next_step: ['commitment', 'decision', 'summary', 'project', 'task', 'constraint'],
  last_decision: ['decision', 'summary', 'project', 'constraint', 'commitment'],
};

const PROJECT_ROUTE_ANCHOR_PRIORITY: Record<Exclude<ProjectRecallRouteKind, 'none'>, MemoryType[]> = {
  project_progress: ['summary', 'project', 'decision'],
  current_stage: ['summary', 'project', 'decision'],
  next_step: ['commitment', 'decision', 'summary'],
  last_decision: ['decision', 'summary', 'project'],
};

const PROJECT_ROUTE_QUERY: Record<Exclude<ProjectRecallRouteKind, 'none'>, string> = {
  project_progress: '项目进展 项目连续性摘要 项目状态 最近决策 下一步',
  current_stage: '当前阶段 阶段状态 项目状态 最近决策',
  next_step: '下一步 后续动作 commitment 最近决策',
  last_decision: '最近决策 最终决定 decision 原因',
};

const PROJECT_ROUTE_MAX_LIMIT: Record<Exclude<ProjectRecallRouteKind, 'none'>, number> = {
  project_progress: 4,
  current_stage: 4,
  next_step: 3,
  last_decision: 3,
};

const TEST_TAG_PATTERNS = [
  /(^|[-_])(e2e|smoke|fixture|test_sample|test_data|mock)([-_]|$)/i,
];

const TEST_CONTENT_PATTERNS = [
  /\bopenclaw-smoke\b/i,
  /\bE2E-[\w-]+\b/i,
  /AGENTS\.md instructions/i,
  /skills store policy \(operator configured\)/i,
  /\b(smoke\s*test|test\s*sample|fixture\s*data|shared-scope\s*test)\b/i,
];

const LOW_VALUE_CONTENT_PATTERNS = [
  /skills store policy \(operator configured\)/i,
  /AGENTS\.md instructions/i,
  /do not claim exclusivity/i,
  /\b(call|调用)\s*(evermemory_store|evermemory_recall|evermemory_status)\b/i,
  /openclaw system event/i,
  /\[\[reply_to_current\]\]/i,
];

const LOW_VALUE_TAG_PATTERNS = [
  /(^|[-_])(sample|fixture|noise|boilerplate)([-_]|$)/i,
];

const RUNTIME_SOURCE_KINDS = new Set([
  'runtime_user',
  'runtime_project',
  'reflection_derived',
  'message',
  'summary',
  'inference',
]);

const RUNTIME_TAG_PREFIXES = ['auto_capture', 'project_state', 'project_continuity', 'active_project_summary', 'next_step'];

function sanitizeInputText(rawText: string): string {
  return rawText
    .replace(/^\[[^\]]+\]\s*/u, '')
    .trim();
}

function isNoisyNumericToken(token: string): boolean {
  if (!token) {
    return true;
  }
  if (/^\d+$/.test(token)) {
    return true;
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(token)) {
    return true;
  }
  if (/^\d{1,2}:\d{2}$/.test(token)) {
    return true;
  }
  return false;
}

function buildDeepQuery(rawText: string): string {
  const normalized = sanitizeInputText(rawText)
    .toLowerCase()
    .replace(/[^a-z0-9_\u4e00-\u9fff]+/g, ' ')
    .trim();
  if (!normalized) {
    return '';
  }

  for (const term of DEEP_QUERY_PRIORITY_TERMS) {
    if (normalized.includes(term)) {
      return term;
    }
  }

  const rawTerms = normalized.split(/\s+/g).filter((term) => term.length > 0);
  const terms: string[] = [];
  for (const rawTerm of rawTerms) {
    if (isNoisyNumericToken(rawTerm)) {
      continue;
    }

    if (DEEP_QUERY_STOPWORDS.has(rawTerm)) {
      continue;
    }

    if (/^[\u4e00-\u9fff]+$/.test(rawTerm) && rawTerm.length > 6) {
      for (let index = 0; index < rawTerm.length; index += 3) {
        const chunk = rawTerm.slice(index, index + 3);
        if (chunk.length >= 2 && !DEEP_QUERY_STOPWORDS.has(chunk)) {
          terms.push(chunk);
        }
      }
      continue;
    }

    if (rawTerm.length >= 2) {
      terms.push(rawTerm);
    }
  }

  const uniqueTerms: string[] = [];
  const seen = new Set<string>();
  for (const term of terms) {
    if (seen.has(term)) {
      continue;
    }
    seen.add(term);
    uniqueTerms.push(term);
    if (uniqueTerms.length >= 6) {
      break;
    }
  }

  if (uniqueTerms.length === 0) {
    return sanitizeInputText(rawText).slice(0, 48);
  }

  return uniqueTerms.sort((left, right) => right.length - left.length)[0] ?? sanitizeInputText(rawText).slice(0, 48);
}

function pickIntentQuery(rawText: string, memoryNeed: RecallForIntentRequest['intent']['signals']['memoryNeed']): string {
  const trimmed = sanitizeInputText(rawText);
  if (!trimmed) {
    return '';
  }

  if (memoryNeed === 'deep') {
    return buildDeepQuery(trimmed);
  }

  if (trimmed.length > 24) {
    return '';
  }

  return trimmed;
}

function buildCandidateSeedQuery(rawQuery: string): string | undefined {
  const trimmed = sanitizeInputText(rawQuery);
  if (!trimmed) {
    return undefined;
  }

  const normalized = trimmed
    .replace(/[^a-z0-9_\u4e00-\u9fff\s]+/gi, ' ')
    .trim();
  if (normalized.includes('项目')) {
    return '项目';
  }
  if (/\bproject\b/i.test(normalized)) {
    return 'project';
  }
  const firstToken = normalized.split(/\s+/g).find((part) => part.length >= 2);
  if (firstToken) {
    if (firstToken.includes('下一步')) {
      return '下一步';
    }
    if (firstToken.includes('决策')) {
      return '决策';
    }
    if (firstToken.includes('阶段')) {
      return '阶段';
    }
    if (firstToken.includes('进展')) {
      return '进展';
    }
    if (firstToken.length > 8 && /^[\u4e00-\u9fff]+$/.test(firstToken)) {
      return firstToken.slice(0, 4);
    }
    return firstToken;
  }

  const deepSeed = buildDeepQuery(trimmed);
  if (deepSeed) {
    return deepSeed;
  }

  const token = trimmed.split(/\s+/g).find((part) => part.length >= 2);
  return token;
}

function normalizeDedupKey(content: string): string {
  return content
    .replace(/^(项目状态更新：|关键约束：|最近决策：|下一步：|项目连续性摘要（[^）]+）：)\s*/u, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function routeScore(text: string, patterns: RegExp[]): number {
  let score = 0;
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      score += 1;
    }
  }
  return score;
}

function hasProjectSignal(text: string): boolean {
  return PROJECT_ORIENTED_QUERY_PATTERNS.some((pattern) => pattern.test(text));
}

function detectProjectRoute(
  text: string,
  options: { hasProjectScope?: boolean; intentProjectOriented?: boolean } = {},
): ProjectRouteDetection {
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
      kind: kind as Exclude<ProjectRecallRouteKind, 'none'>,
      score: routeScore(normalized, patterns),
      priority: PROJECT_ROUTE_KIND_PRIORITY[kind as Exclude<ProjectRecallRouteKind, 'none'>],
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

function mergeOrderedTypes(primary: MemoryType[], secondary: MemoryType[]): MemoryType[] {
  const output: MemoryType[] = [];
  const seen = new Set<MemoryType>();
  for (const type of [...primary, ...secondary]) {
    if (seen.has(type)) {
      continue;
    }
    seen.add(type);
    output.push(type);
  }
  return output;
}

function resolvePositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function resolveRecallLimit(value: number | undefined, maxRecall: number): number {
  const requested = resolvePositiveInteger(value, DEFAULT_RECALL_LIMIT);
  return Math.min(requested, maxRecall);
}

function resolveWeightNumber(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return fallback;
  }
  return value;
}

function normalizeWeights<T extends Record<string, number>>(weights: T, fallback: T): T {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    return { ...fallback };
  }

  return Object.fromEntries(
    Object.entries(weights).map(([key, weight]) => [key, weight / total]),
  ) as T;
}

function resolveKeywordWeights(
  weights: Partial<RetrievalKeywordWeights> | undefined,
): RetrievalKeywordWeights {
  const merged = {
    keyword: resolveWeightNumber(weights?.keyword, DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.keyword),
    recency: resolveWeightNumber(weights?.recency, DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.recency),
    importance: resolveWeightNumber(weights?.importance, DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.importance),
    confidence: resolveWeightNumber(weights?.confidence, DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.confidence),
    explicitness: resolveWeightNumber(weights?.explicitness, DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.explicitness),
    scopeMatch: resolveWeightNumber(weights?.scopeMatch, DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.scopeMatch),
    typePriority: resolveWeightNumber(weights?.typePriority, DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.typePriority),
    lifecyclePriority: resolveWeightNumber(
      weights?.lifecyclePriority,
      DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.lifecyclePriority,
    ),
  };

  return normalizeWeights(merged, { ...DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS });
}

function resolveHybridWeights(weights: Partial<RetrievalHybridWeights> | undefined): RetrievalHybridWeights {
  const merged = {
    keyword: resolveWeightNumber(weights?.keyword, DEFAULT_RETRIEVAL_HYBRID_WEIGHTS.keyword),
    semantic: resolveWeightNumber(weights?.semantic, DEFAULT_RETRIEVAL_HYBRID_WEIGHTS.semantic),
    base: resolveWeightNumber(weights?.base, DEFAULT_RETRIEVAL_HYBRID_WEIGHTS.base),
  };

  return normalizeWeights(merged, { ...DEFAULT_RETRIEVAL_HYBRID_WEIGHTS });
}

export class RetrievalService {
  private readonly semanticEnabled: boolean;
  private readonly semanticRepo?: SemanticRepository;
  private readonly semanticCandidateLimit: number;
  private readonly semanticMinScore: number;
  private readonly maxRecall: number;
  private readonly keywordWeights: RetrievalKeywordWeights;
  private readonly hybridWeights: RetrievalHybridWeights;

  constructor(
    private readonly memoryRepo: MemoryRepository,
    private readonly debugRepo?: DebugRepository,
    options: RetrievalServiceOptions = {},
  ) {
    this.semanticEnabled = options.semanticEnabled ?? false;
    this.semanticRepo = options.semanticRepo;
    this.semanticCandidateLimit = options.semanticCandidateLimit ?? 200;
    this.semanticMinScore = options.semanticMinScore ?? 0.15;
    this.maxRecall = resolvePositiveInteger(options.maxRecall, DEFAULT_RECALL_LIMIT);
    this.keywordWeights = resolveKeywordWeights(options.keywordWeights);
    this.hybridWeights = resolveHybridWeights(options.hybridWeights);
  }

  recall(request: RecallRequest, meta?: RecallExecutionMeta): RecallResult {
    const executionMeta = meta ?? this.deriveExecutionMeta(request);
    const requestedMode = request.mode;
    const mode = this.resolveMode(request.mode);
    const limit = resolveRecallLimit(request.limit, this.maxRecall);
    const { ranked, candidates, semanticHitCount, candidatePolicy } = this.rankByMode(mode, request, limit, executionMeta);
    const { top, selectionStats } = this.selectTopRanked(ranked, limit, executionMeta);
    const items = top.map((entry) => entry.memory);

    if (items.length > 0) {
      this.memoryRepo.incrementRetrieval(items.map((item) => item.id));
    }

    this.debugRepo?.log('retrieval_executed', undefined, {
      query: request.query,
      requestedMode: requestedMode ?? 'keyword',
      mode,
      fallback: requestedMode === 'hybrid' && mode !== 'hybrid',
      semanticEnabled: this.semanticEnabled,
      semanticHits: semanticHitCount,
      returned: items.length,
      limit,
      maxRecall: this.maxRecall,
      weights: {
        keyword: this.keywordWeights,
        hybrid: this.hybridWeights,
      },
      routeKind: executionMeta.routeKind,
      routeApplied: executionMeta.routeApplied,
      projectOriented: executionMeta.projectOriented,
      routeReason: executionMeta.routeReason,
      routeScore: executionMeta.routeScore,
      routeProjectSignal: executionMeta.routeProjectSignal,
      hasProjectScope: executionMeta.hasProjectScope,
      intentProjectOriented: executionMeta.intentProjectOriented,
      candidates: candidates.length,
      candidatePolicy,
      recallOptimization: selectionStats,
      topScores: top.slice(0, 3).map((entry) => ({
        id: entry.memory.id,
        score: Number(entry.score.toFixed(4)),
        keyword: Number(entry.keywordScore.toFixed(3)),
        semantic: Number(entry.semanticScore.toFixed(3)),
        base: Number(entry.baseScore.toFixed(3)),
        projectPriority: Number(entry.projectPriority.toFixed(3)),
        dataQuality: Number(entry.dataQuality.toFixed(3)),
        dataClass: entry.dataClass,
      })),
    });

    return {
      items,
      total: items.length,
      limit,
    };
  }

  recallForIntent(request: RecallForIntentRequest): RecallResult {
    const memoryNeed = request.intent.signals.memoryNeed;
    if (memoryNeed === 'none') {
      return {
        items: [],
        total: 0,
        limit: request.limit === undefined ? 0 : resolveRecallLimit(request.limit, this.maxRecall),
      };
    }

    const rawText = request.query?.trim() || request.intent.rawText;
    const intentProjectOriented = PROJECT_ORIENTED_INTENTS.has(request.intent.intent.type);
    const route = detectProjectRoute(rawText, {
      hasProjectScope: Boolean(request.scope?.project),
      intentProjectOriented,
    });
    const routeKind = route.routeKind;
    const routeApplied = route.routeApplied;
    const projectOriented = routeApplied || intentProjectOriented || route.projectSignal;

    const hintedTypes = request.intent.retrievalHints.preferredTypes;
    const routeTypes = routeApplied ? PROJECT_ROUTE_TYPE_PRIORITY[routeKind as Exclude<ProjectRecallRouteKind, 'none'>] : [];
    const preferredTypes = mergeOrderedTypes(routeTypes, hintedTypes);

    const limit = (() => {
      const requested = resolvePositiveInteger(request.limit, DEFAULT_RECALL_LIMIT);
      const byNeed = (() => {
        if (memoryNeed === 'light') {
          return Math.min(requested, 4);
        }
        if (memoryNeed === 'targeted') {
          return Math.max(4, Math.min(requested, 8));
        }
        return Math.max(8, Math.min(requested, 12));
      })();

      const routed = routeApplied
        ? Math.min(byNeed, PROJECT_ROUTE_MAX_LIMIT[routeKind as Exclude<ProjectRecallRouteKind, 'none'>])
        : byNeed;

      return Math.min(routed, this.maxRecall);
    })();

    const lifecycles: MemoryLifecycle[] | undefined = projectOriented
      ? ['semantic', 'episodic']
      : memoryNeed === 'deep'
        ? ['semantic', 'episodic']
        : memoryNeed === 'targeted'
          ? ['semantic']
          : undefined;

    const mode: RetrievalMode = request.mode
      ?? (memoryNeed === 'deep' ? 'hybrid' : 'keyword');

    const baseQuery = pickIntentQuery(rawText, memoryNeed);
    const query = routeApplied
      ? [baseQuery, PROJECT_ROUTE_QUERY[routeKind as Exclude<ProjectRecallRouteKind, 'none'>], request.scope?.project]
        .filter((part): part is string => Boolean(part && part.trim()))
        .join(' ')
      : baseQuery;

    return this.recall({
      query,
      scope: request.scope,
      types: preferredTypes.length > 0 ? preferredTypes : undefined,
      lifecycles,
      mode,
      limit,
    }, {
      routeKind,
      routeApplied,
      projectOriented,
      routeReason: route.routeReason,
      routeScore: route.routeScore,
      routeProjectSignal: route.projectSignal,
      hasProjectScope: Boolean(request.scope?.project),
      intentProjectOriented,
    });
  }

  private deriveExecutionMeta(request: RecallRequest): RecallExecutionMeta {
    const route = detectProjectRoute(request.query, {
      hasProjectScope: Boolean(request.scope?.project),
      intentProjectOriented: false,
    });
    const routeKind = route.routeKind;
    const routeApplied = route.routeApplied;
    const projectOriented = routeApplied || route.projectSignal;

    return {
      routeKind,
      routeApplied,
      projectOriented,
      routeReason: route.routeReason,
      routeScore: route.routeScore,
      routeProjectSignal: route.projectSignal,
      hasProjectScope: Boolean(request.scope?.project),
      intentProjectOriented: false,
    };
  }

  private resolveMode(mode: RetrievalMode | undefined): RetrievalMode {
    if (!mode) {
      return 'keyword';
    }

    if (mode === 'hybrid' && (!this.semanticEnabled || !this.semanticRepo)) {
      return 'keyword';
    }

    return mode;
  }

  private classifyMemoryData(memory: MemoryItem): MemoryDataClass {
    const sourceKind = memory.source.kind;
    const tags = memory.tags.map((tag) => tag.toLowerCase());
    const lowerContent = memory.content.toLowerCase();

    const tagLooksTest = tags.some((tag) => TEST_TAG_PATTERNS.some((pattern) => pattern.test(tag)));
    const contentLooksTest = TEST_CONTENT_PATTERNS.some((pattern) => pattern.test(lowerContent));
    if (sourceKind === 'test' || tagLooksTest || contentLooksTest) {
      return 'test';
    }

    const runtimeBySource = RUNTIME_SOURCE_KINDS.has(sourceKind);
    const runtimeByTag = tags.some((tag) => RUNTIME_TAG_PREFIXES.some((prefix) => tag.includes(prefix)));
    if (runtimeBySource || runtimeByTag) {
      return 'runtime';
    }

    return 'unknown';
  }

  private isLowValueNoise(memory: MemoryItem): boolean {
    const lowerContent = memory.content.toLowerCase();
    const lowerTags = memory.tags.map((tag) => tag.toLowerCase());
    if (LOW_VALUE_CONTENT_PATTERNS.some((pattern) => pattern.test(lowerContent))) {
      return true;
    }
    if (lowerTags.some((tag) => LOW_VALUE_TAG_PATTERNS.some((pattern) => pattern.test(tag)))) {
      return true;
    }
    return false;
  }

  private projectPriority(memory: MemoryItem): number {
    if (memory.type === 'summary' && (memory.tags.includes('active_project_summary') || memory.tags.includes('project_continuity'))) {
      return 1;
    }
    if (memory.type === 'project' && memory.tags.includes('project_state')) {
      return 0.95;
    }
    if (memory.type === 'decision') {
      return 0.92;
    }
    if (memory.type === 'commitment' && memory.tags.includes('next_step')) {
      return 0.88;
    }
    if (memory.type === 'project') {
      return 0.84;
    }
    if (memory.type === 'constraint') {
      return 0.72;
    }
    return 0.45;
  }

  private dataQuality(memory: MemoryItem): { dataClass: MemoryDataClass; quality: number } {
    const dataClass = this.classifyMemoryData(memory);
    if (dataClass === 'runtime') {
      if (this.isLowValueNoise(memory)) {
        return { dataClass, quality: 0.48 };
      }
      return { dataClass, quality: 1 };
    }
    if (dataClass === 'test') {
      return { dataClass, quality: 0.2 };
    }
    if (this.isLowValueNoise(memory)) {
      return { dataClass, quality: 0.4 };
    }
    return { dataClass, quality: 0.72 };
  }

  private applyRecallPolicyScore(
    memory: MemoryItem,
    baseScore: number,
    meta: RecallExecutionMeta,
  ): {
      score: number;
      projectPriority: number;
      dataQuality: number;
      dataClass: MemoryDataClass;
    } {
    const projectPriority = this.projectPriority(memory);
    const dataPolicy = this.dataQuality(memory);

    const score = meta.projectOriented
      ? (baseScore * 0.76 + projectPriority * 0.16 + dataPolicy.quality * 0.08)
      : (baseScore * 0.9 + dataPolicy.quality * 0.1);

    return {
      score,
      projectPriority,
      dataQuality: dataPolicy.quality,
      dataClass: dataPolicy.dataClass,
    };
  }

  private applyCandidatePolicy(
    candidates: MemoryItem[],
    limit: number,
    meta: RecallExecutionMeta,
  ): { candidates: MemoryItem[]; stats: CandidatePolicyStats } {
    const classCounts: Record<MemoryDataClass, number> = {
      runtime: 0,
      test: 0,
      unknown: 0,
    };

    const primaryCandidates: MemoryItem[] = [];
    const tests: MemoryItem[] = [];
    const lowValue: MemoryItem[] = [];

    for (const candidate of candidates) {
      const dataClass = this.classifyMemoryData(candidate);
      classCounts[dataClass] += 1;
      if (dataClass === 'test') {
        tests.push(candidate);
      } else if (this.isLowValueNoise(candidate)) {
        lowValue.push(candidate);
      } else {
        primaryCandidates.push(candidate);
      }
    }

    const strictProjectMode = meta.projectOriented || meta.routeApplied;
    const maxLowValueCandidates = strictProjectMode
      ? (primaryCandidates.length >= Math.max(2, limit - 1) ? 0 : 1)
      : (primaryCandidates.length >= limit ? 0 : 1);
    const maxTestCandidates = strictProjectMode
      ? (primaryCandidates.length > 0 ? 0 : 1)
      : primaryCandidates.length >= limit
        ? 0
        : Math.max(1, Math.floor(limit / 2));

    const retainedLowValue = maxLowValueCandidates > 0 ? lowValue.slice(0, maxLowValueCandidates) : [];
    const retainedTests = maxTestCandidates > 0 ? tests.slice(0, maxTestCandidates) : [];
    const filteredCandidates = [...primaryCandidates, ...retainedLowValue, ...retainedTests];

    return {
      candidates: filteredCandidates,
      stats: {
        initialCandidates: candidates.length,
        filteredCandidates: filteredCandidates.length,
        suppressedTestCandidates: tests.length - retainedTests.length,
        retainedTestCandidates: retainedTests.length,
        suppressedLowValueCandidates: lowValue.length - retainedLowValue.length,
        retainedLowValueCandidates: retainedLowValue.length,
        filterMode: strictProjectMode ? 'project_strict' : 'default',
        dataClassCounts: classCounts,
      },
    };
  }

  private selectTopRanked(
    ranked: ScoredRecallItem[],
    limit: number,
    meta: RecallExecutionMeta,
  ): { top: ScoredRecallItem[]; selectionStats: RecallSelectionStats } {
    const highValue = meta.projectOriented
      ? ranked.filter((entry) => entry.projectPriority >= 0.84)
      : [];
    const fallback = meta.projectOriented
      ? ranked.filter((entry) => entry.projectPriority < 0.84)
      : ranked;

    const ordered = meta.projectOriented ? [...highValue, ...fallback] : ranked;

    const selected: ScoredRecallItem[] = [];
    const selectedIds = new Set<string>();
    const seenKeys = new Set<string>();
    let duplicateItemsRemoved = 0;
    let routeAnchorItemsSelected = 0;

    const trySelect = (entry: ScoredRecallItem): boolean => {
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
      const anchorTypes = PROJECT_ROUTE_ANCHOR_PRIORITY[meta.routeKind as Exclude<ProjectRecallRouteKind, 'none'>];
      for (const type of anchorTypes) {
        const candidate = ordered.find((entry) => entry.memory.type === type && !selectedIds.has(entry.memory.id));
        if (!candidate) {
          continue;
        }
        if (trySelect(candidate)) {
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

    const selectedTypeCounts = selected.reduce((acc, entry) => {
      acc[entry.memory.type] = (acc[entry.memory.type] ?? 0) + 1;
      return acc;
    }, {} as Partial<Record<MemoryType, number>>);

    return {
      top: selected,
      selectionStats: {
        duplicateItemsRemoved,
        highValueItemsSelected: selected.filter((entry) => entry.projectPriority >= 0.84).length,
        routeAnchorItemsSelected,
        selectedTypeCounts,
      },
    };
  }

  private loadCandidates(request: RecallRequest, limit: number, queryEnabled: boolean): MemoryItem[] {
    const candidateLimit = queryEnabled
      ? Math.max(limit * 5, limit)
      : Math.max(limit * 8, this.semanticCandidateLimit);
    const seededQuery = queryEnabled ? buildCandidateSeedQuery(request.query) : undefined;

    return this.memoryRepo.search({
      query: seededQuery,
      scope: request.scope,
      types: request.types,
      lifecycles: request.lifecycles,
      activeOnly: true,
      archived: false,
      limit: candidateLimit,
    });
  }

  private rankByMode(
    mode: RetrievalMode,
    request: RecallRequest,
    limit: number,
    meta: RecallExecutionMeta,
  ): { ranked: ScoredRecallItem[]; candidates: MemoryItem[]; semanticHitCount: number; candidatePolicy: CandidatePolicyStats } {
    if (mode === 'structured') {
      const loaded = this.loadCandidates(request, limit, false);
      const candidateResult = this.applyCandidatePolicy(loaded, limit, meta);
      const candidates = candidateResult.candidates;
      const ranked = rankKeywordRecall(
        candidates,
        { ...request, query: '' },
        { weights: this.keywordWeights },
      ).map((entry) => {
        const policyScore = this.applyRecallPolicyScore(entry.memory, entry.score, meta);
        return {
          memory: entry.memory,
          score: policyScore.score,
          keywordScore: 0,
          semanticScore: 0,
          baseScore: entry.score,
          projectPriority: policyScore.projectPriority,
          dataQuality: policyScore.dataQuality,
          dataClass: policyScore.dataClass,
        };
      });

      return {
        ranked,
        candidates,
        semanticHitCount: 0,
        candidatePolicy: candidateResult.stats,
      };
    }

    if (mode === 'keyword') {
      const loaded = this.loadCandidates(request, limit, true);
      const candidateResult = this.applyCandidatePolicy(loaded, limit, meta);
      const candidates = candidateResult.candidates;
      const ranked = rankKeywordRecall(candidates, request, { weights: this.keywordWeights }).map((entry) => {
        const policyScore = this.applyRecallPolicyScore(entry.memory, entry.score, meta);
        return {
          memory: entry.memory,
          score: policyScore.score,
          keywordScore: entry.factors.keyword,
          semanticScore: 0,
          baseScore: entry.score,
          projectPriority: policyScore.projectPriority,
          dataQuality: policyScore.dataQuality,
          dataClass: policyScore.dataClass,
        };
      });

      return {
        ranked,
        candidates,
        semanticHitCount: 0,
        candidatePolicy: candidateResult.stats,
      };
    }

    return this.rankHybrid(request, limit, meta);
  }

  private rankHybrid(
    request: RecallRequest,
    limit: number,
    meta: RecallExecutionMeta,
  ): { ranked: ScoredRecallItem[]; candidates: MemoryItem[]; semanticHitCount: number; candidatePolicy: CandidatePolicyStats } {
    const loaded = this.loadCandidates(request, limit, false);
    const candidateResult = this.applyCandidatePolicy(loaded, limit, meta);
    const candidates = candidateResult.candidates;
    const candidateMap = new Map(candidates.map((item) => [item.id, item]));

    const keywordRanked = rankKeywordRecall(candidates, request, { weights: this.keywordWeights });
    const baseRanked = rankKeywordRecall(candidates, { ...request, query: '' }, { weights: this.keywordWeights });
    const keywordScoreById = new Map(keywordRanked.map((entry) => [entry.memory.id, entry.score]));
    const baseScoreById = new Map(baseRanked.map((entry) => [entry.memory.id, entry.score]));
    const maxKeywordScore = keywordRanked[0]?.score && keywordRanked[0].score > 0
      ? keywordRanked[0].score
      : 1;
    const maxBaseScore = baseRanked[0]?.score && baseRanked[0].score > 0
      ? baseRanked[0].score
      : 1;

    const semanticScoreById = new Map<string, number>();
    if (this.semanticEnabled && this.semanticRepo && request.query.trim().length > 0) {
      const semanticHits = this.semanticRepo.search(request.query, {
        limit: this.semanticCandidateLimit,
        candidateLimit: this.semanticCandidateLimit,
        minScore: this.semanticMinScore,
      });

      for (const hit of semanticHits) {
        if (candidateMap.has(hit.memoryId)) {
          semanticScoreById.set(hit.memoryId, hit.score);
        }
      }
    }

    const selectedIds = new Set<string>([
      ...keywordScoreById.keys(),
      ...semanticScoreById.keys(),
    ]);

    const ranked: ScoredRecallItem[] = [];
    for (const id of selectedIds) {
      const memory = candidateMap.get(id);
      if (!memory) {
        continue;
      }

      const keywordScore = (keywordScoreById.get(id) ?? 0) / maxKeywordScore;
      const semanticScore = semanticScoreById.get(id) ?? 0;
      const baseScore = (baseScoreById.get(id) ?? 0) / maxBaseScore;
      const rawHybridScore = (
        keywordScore * this.hybridWeights.keyword
        + semanticScore * this.hybridWeights.semantic
        + baseScore * this.hybridWeights.base
      );
      const policyScore = this.applyRecallPolicyScore(memory, rawHybridScore, meta);

      ranked.push({
        memory,
        score: policyScore.score,
        keywordScore,
        semanticScore,
        baseScore,
        projectPriority: policyScore.projectPriority,
        dataQuality: policyScore.dataQuality,
        dataClass: policyScore.dataClass,
      });
    }

    ranked.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return right.memory.timestamps.updatedAt.localeCompare(left.memory.timestamps.updatedAt);
    });

    return {
      ranked,
      candidates,
      semanticHitCount: semanticScoreById.size,
      candidatePolicy: candidateResult.stats,
    };
  }
}
