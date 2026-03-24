import {
  DEFAULT_BOOT_TOKEN_BUDGET,
  DEFAULT_DATABASE_PATH,
  DEFAULT_INTENT_FALLBACK_HEURISTICS,
  DEFAULT_INTENT_USE_LLM,
  DEFAULT_MAX_RECALL,
  DEFAULT_RETRIEVAL_HYBRID_WEIGHTS,
  DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS,
  DEFAULT_SEMANTIC_SIDECAR_ENABLED,
  DEFAULT_SEMANTIC_SIDECAR_MAX_CANDIDATES,
  DEFAULT_SEMANTIC_SIDECAR_MIN_SCORE,
} from './constants.js';
import type { EverMemoryConfig } from './types.js';

export interface EverMemoryConfigInput {
  enabled?: unknown;
  databasePath?: unknown;
  bootTokenBudget?: unknown;
  maxRecall?: unknown;
  debugEnabled?: unknown;
  semantic?: unknown;
  intent?: unknown;
  retrieval?: unknown;
  butler?: unknown;
}

function readBoolean(value: unknown, field: string, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'boolean') {
    throw new Error(`Invalid evermemory config: ${field} must be a boolean.`);
  }

  return value;
}

function readString(value: unknown, field: string, fallback: string): string {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid evermemory config: ${field} must be a non-empty string.`);
  }

  return value;
}

function readPositiveInteger(value: unknown, field: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid evermemory config: ${field} must be a positive integer.`);
  }

  return value;
}

function readUnitInterval(value: unknown, field: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1) {
    throw new Error(`Invalid evermemory config: ${field} must be a number between 0 and 1.`);
  }

  return value;
}

function readNonNegativeNumber(value: unknown, field: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    throw new Error(`Invalid evermemory config: ${field} must be a non-negative number.`);
  }

  return value;
}

function readObject(value: unknown, field: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid evermemory config: ${field} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function readEnum<T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T,
  fallback: T[number],
): T[number] {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new Error(`Invalid evermemory config: ${field} must be one of ${allowed.join(', ')}.`);
  }
  return value as T[number];
}

function normalizeWeights<T extends Record<string, number>>(weights: T, field: string): T {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) {
    throw new Error(`Invalid evermemory config: ${field} must have a total weight greater than 0.`);
  }

  return Object.fromEntries(
    Object.entries(weights).map(([key, weight]) => [key, Number((weight / total).toFixed(6))]),
  ) as T;
}

export function loadConfig(input: EverMemoryConfigInput = {}): EverMemoryConfig {
  const intentInput = readObject(input.intent, 'intent');
  const semanticInput = readObject(input.semantic, 'semantic');
  const retrievalInput = readObject(input.retrieval, 'retrieval');
  const butlerInput = readObject(input.butler, 'butler');
  const keywordWeightsInput = readObject(retrievalInput?.keywordWeights, 'retrieval.keywordWeights');
  const hybridWeightsInput = readObject(retrievalInput?.hybridWeights, 'retrieval.hybridWeights');
  const butlerCognitionInput = readObject(butlerInput?.cognition, 'butler.cognition');
  const butlerTimeBudgetsInput = readObject(butlerInput?.timeBudgets, 'butler.timeBudgets');
  const butlerAttentionInput = readObject(butlerInput?.attention, 'butler.attention');
  const butlerWorkersInput = readObject(butlerInput?.workers, 'butler.workers');

  const keywordWeights = normalizeWeights({
    keyword: readNonNegativeNumber(
      keywordWeightsInput?.keyword,
      'retrieval.keywordWeights.keyword',
      DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.keyword,
    ),
    recency: readNonNegativeNumber(
      keywordWeightsInput?.recency,
      'retrieval.keywordWeights.recency',
      DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.recency,
    ),
    importance: readNonNegativeNumber(
      keywordWeightsInput?.importance,
      'retrieval.keywordWeights.importance',
      DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.importance,
    ),
    confidence: readNonNegativeNumber(
      keywordWeightsInput?.confidence,
      'retrieval.keywordWeights.confidence',
      DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.confidence,
    ),
    explicitness: readNonNegativeNumber(
      keywordWeightsInput?.explicitness,
      'retrieval.keywordWeights.explicitness',
      DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.explicitness,
    ),
    scopeMatch: readNonNegativeNumber(
      keywordWeightsInput?.scopeMatch,
      'retrieval.keywordWeights.scopeMatch',
      DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.scopeMatch,
    ),
    typePriority: readNonNegativeNumber(
      keywordWeightsInput?.typePriority,
      'retrieval.keywordWeights.typePriority',
      DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.typePriority,
    ),
    lifecyclePriority: readNonNegativeNumber(
      keywordWeightsInput?.lifecyclePriority,
      'retrieval.keywordWeights.lifecyclePriority',
      DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS.lifecyclePriority,
    ),
  }, 'retrieval.keywordWeights');

  const hybridWeights = normalizeWeights({
    keyword: readNonNegativeNumber(
      hybridWeightsInput?.keyword,
      'retrieval.hybridWeights.keyword',
      DEFAULT_RETRIEVAL_HYBRID_WEIGHTS.keyword,
    ),
    semantic: readNonNegativeNumber(
      hybridWeightsInput?.semantic,
      'retrieval.hybridWeights.semantic',
      DEFAULT_RETRIEVAL_HYBRID_WEIGHTS.semantic,
    ),
    base: readNonNegativeNumber(
      hybridWeightsInput?.base,
      'retrieval.hybridWeights.base',
      DEFAULT_RETRIEVAL_HYBRID_WEIGHTS.base,
    ),
  }, 'retrieval.hybridWeights');

  return {
    enabled: readBoolean(input.enabled, 'enabled', true),
    databasePath: readString(input.databasePath, 'databasePath', DEFAULT_DATABASE_PATH),
    bootTokenBudget: readPositiveInteger(
      input.bootTokenBudget,
      'bootTokenBudget',
      DEFAULT_BOOT_TOKEN_BUDGET,
    ),
    maxRecall: readPositiveInteger(input.maxRecall, 'maxRecall', DEFAULT_MAX_RECALL),
    debugEnabled: readBoolean(input.debugEnabled, 'debugEnabled', true),
    semantic: {
      enabled: readBoolean(
        semanticInput?.enabled,
        'semantic.enabled',
        DEFAULT_SEMANTIC_SIDECAR_ENABLED,
      ),
      maxCandidates: readPositiveInteger(
        semanticInput?.maxCandidates,
        'semantic.maxCandidates',
        DEFAULT_SEMANTIC_SIDECAR_MAX_CANDIDATES,
      ),
      minScore: readUnitInterval(
        semanticInput?.minScore,
        'semantic.minScore',
        DEFAULT_SEMANTIC_SIDECAR_MIN_SCORE,
      ),
    },
    intent: {
      useLLM: readBoolean(intentInput?.useLLM, 'intent.useLLM', DEFAULT_INTENT_USE_LLM),
      fallbackHeuristics: readBoolean(
        intentInput?.fallbackHeuristics,
        'intent.fallbackHeuristics',
        DEFAULT_INTENT_FALLBACK_HEURISTICS,
      ),
    },
    retrieval: {
      keywordWeights,
      hybridWeights,
    },
    butler: {
      enabled: readBoolean(butlerInput?.enabled, 'butler.enabled', true),
      mode: readEnum(butlerInput?.mode, 'butler.mode', ['steward', 'reduced'] as const, 'reduced'),
      cognition: {
        dailyTokenBudget: readPositiveInteger(
          butlerCognitionInput?.dailyTokenBudget,
          'butler.cognition.dailyTokenBudget',
          50000,
        ),
        sessionTokenBudget: readPositiveInteger(
          butlerCognitionInput?.sessionTokenBudget,
          'butler.cognition.sessionTokenBudget',
          10000,
        ),
        taskTimeoutMs: readPositiveInteger(
          butlerCognitionInput?.taskTimeoutMs,
          'butler.cognition.taskTimeoutMs',
          15000,
        ),
        fallbackToHeuristics: readBoolean(
          butlerCognitionInput?.fallbackToHeuristics,
          'butler.cognition.fallbackToHeuristics',
          true,
        ),
      },
      timeBudgets: {
        sessionStartMs: readPositiveInteger(
          butlerTimeBudgetsInput?.sessionStartMs,
          'butler.timeBudgets.sessionStartMs',
          3000,
        ),
        beforeAgentMs: readPositiveInteger(
          butlerTimeBudgetsInput?.beforeAgentMs,
          'butler.timeBudgets.beforeAgentMs',
          2000,
        ),
        agentEndMs: readPositiveInteger(
          butlerTimeBudgetsInput?.agentEndMs,
          'butler.timeBudgets.agentEndMs',
          2000,
        ),
      },
      attention: {
        maxInsightsPerBriefing: readPositiveInteger(
          butlerAttentionInput?.maxInsightsPerBriefing,
          'butler.attention.maxInsightsPerBriefing',
          3,
        ),
        tokenBudgetPercent: readUnitInterval(
          butlerAttentionInput?.tokenBudgetPercent,
          'butler.attention.tokenBudgetPercent',
          0.2,
        ),
        minConfidence: readUnitInterval(
          butlerAttentionInput?.minConfidence,
          'butler.attention.minConfidence',
          0.4,
        ),
      },
      workers: {
        enabled: readBoolean(butlerWorkersInput?.enabled, 'butler.workers.enabled', false),
        maxWorkers: readPositiveInteger(
          butlerWorkersInput?.maxWorkers,
          'butler.workers.maxWorkers',
          2,
        ),
        taskTimeoutMs: readPositiveInteger(
          butlerWorkersInput?.taskTimeoutMs,
          'butler.workers.taskTimeoutMs',
          10000,
        ),
      },
    },
  };
}

export function getDefaultConfig(): EverMemoryConfig {
  return loadConfig();
}
