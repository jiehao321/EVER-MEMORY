import type { MemoryLifecycle, MemoryStoreInput, MemoryType, WriteDecision } from '../../types.js';
import {
  COMMITMENT_PATTERNS,
  IDENTITY_PATTERNS,
  LOW_VALUE_PATTERNS,
  WRITE_CONSTRAINT_PATTERNS as CONSTRAINT_PATTERNS,
  WRITE_DECISION_PATTERNS as DECISION_PATTERNS,
  WRITE_PREFERENCE_PATTERNS as PREFERENCE_PATTERNS,
} from '../../patterns.js';
import {
  WRITE_CONFIDENCE_BY_TYPE,
  WRITE_DEFAULT_EXPLICITNESS,
  WRITE_IMPORTANCE_BY_TYPE,
  WRITE_MAX_CONTENT_LENGTH,
  WRITE_MIN_CONTENT_LENGTH,
} from '../../tuning.js';
import { PolicyError } from '../../errors.js';
import { sanitizeContent } from './sanitize.js';

interface NormalizeResult {
  readonly text: string;
  readonly strippedPatterns: string[];
}

function normalizeText(text: string): NormalizeResult {
  const result = sanitizeContent(text.trim());
  return { text: result.cleaned, strippedPatterns: result.strippedPatterns };
}

function inferType(content: string, fallback?: MemoryType): MemoryType | undefined {
  if (fallback) {
    return fallback;
  }

  if (IDENTITY_PATTERNS.some((pattern) => pattern.test(content))) {
    return 'identity';
  }

  if (PREFERENCE_PATTERNS.some((pattern) => pattern.test(content))) {
    return 'preference';
  }

  if (DECISION_PATTERNS.some((pattern) => pattern.test(content))) {
    return 'decision';
  }

  if (CONSTRAINT_PATTERNS.some((pattern) => pattern.test(content))) {
    return 'constraint';
  }

  if (COMMITMENT_PATTERNS.some((pattern) => pattern.test(content))) {
    return 'commitment';
  }

  return 'fact';
}

function inferLifecycle(type: MemoryType, fallback?: MemoryLifecycle): MemoryLifecycle {
  if (fallback) {
    return fallback;
  }

  if (type === 'identity' || type === 'preference' || type === 'constraint' || type === 'decision') {
    return 'semantic';
  }

  return 'episodic';
}

function inferConfidence(type: MemoryType): number {
  switch (type) {
    case 'identity':
      return WRITE_CONFIDENCE_BY_TYPE.identity;
    case 'preference':
      return WRITE_CONFIDENCE_BY_TYPE.preference;
    case 'constraint':
      return WRITE_CONFIDENCE_BY_TYPE.constraint;
    case 'decision':
      return WRITE_CONFIDENCE_BY_TYPE.decision;
    case 'commitment':
      return WRITE_CONFIDENCE_BY_TYPE.commitment;
    default:
      return WRITE_CONFIDENCE_BY_TYPE.default;
  }
}

function inferImportance(type: MemoryType): number {
  switch (type) {
    case 'constraint':
      return WRITE_IMPORTANCE_BY_TYPE.constraint;
    case 'decision':
      return WRITE_IMPORTANCE_BY_TYPE.decision;
    case 'identity':
      return WRITE_IMPORTANCE_BY_TYPE.identity;
    case 'preference':
      return WRITE_IMPORTANCE_BY_TYPE.preference;
    case 'commitment':
      return WRITE_IMPORTANCE_BY_TYPE.commitment;
    default:
      return WRITE_IMPORTANCE_BY_TYPE.default;
  }
}

function inferExplicitness(content: string): number {
  if (/\bremember\b/i.test(content) || /记住|记一下/.test(content)) {
    return 1;
  }

  return WRITE_DEFAULT_EXPLICITNESS;
}

function resolveScore(
  value: number | undefined,
  fallback: number,
  field: 'confidence' | 'importance' | 'explicitness',
  input: MemoryStoreInput,
): number {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1) {
    throw new PolicyError(`Memory ${field} must be a number between 0 and 1.`, {
      code: `POLICY_INVALID_${field.toUpperCase()}`,
      context: {
        field,
        value,
        contentPreview: input.content.slice(0, 80),
      },
    });
  }
  return value;
}

function addStrippedPatterns(
  decision: WriteDecision,
  strippedPatterns: string[],
  cleanedContent?: string,
): WriteDecision {
  if (strippedPatterns.length === 0 && cleanedContent === undefined) {
    return decision;
  }
  return {
    ...decision,
    strippedPatterns: strippedPatterns.length > 0 ? strippedPatterns : undefined,
    cleanedContent,
  };
}

export function evaluateWrite(input: MemoryStoreInput): WriteDecision {
  const { text: content, strippedPatterns } = normalizeText(input.content);

  if (content.length === 0) {
    return addStrippedPatterns({ accepted: false, reason: 'empty_content' }, strippedPatterns, content);
  }

  if (content.length > WRITE_MAX_CONTENT_LENGTH) {
    return addStrippedPatterns({ accepted: false, reason: 'content_too_long' }, strippedPatterns, content);
  }

  if (content.length < WRITE_MIN_CONTENT_LENGTH || LOW_VALUE_PATTERNS.some((pattern) => pattern.test(content))) {
    return addStrippedPatterns({ accepted: false, reason: 'low_value_chatter' }, strippedPatterns, content);
  }

  const type = inferType(content, input.type);
  if (!type) {
    return addStrippedPatterns({ accepted: false, reason: 'type_not_determined' }, strippedPatterns, content);
  }

  const lifecycle = inferLifecycle(type, input.lifecycle);
  const confidence = resolveScore(input.confidence, inferConfidence(type), 'confidence', input);
  const importance = resolveScore(input.importance, inferImportance(type), 'importance', input);
  const explicitness = resolveScore(input.explicitness, inferExplicitness(content), 'explicitness', input);
  // RC1-1D: Cap importance for derived/inferred sources
  let cappedImportance = importance;
  if (input.sourceGrade === 'derived') {
    cappedImportance = Math.min(importance, 0.6);
  } else if (input.sourceGrade === 'inferred') {
    cappedImportance = Math.min(importance, 0.4);
  }

  return addStrippedPatterns(
    {
      accepted: true,
      reason: 'accepted_by_deterministic_baseline',
      type,
      lifecycle,
      confidence,
      importance: cappedImportance,
      explicitness,
    },
    strippedPatterns,
    content,
  );
}
