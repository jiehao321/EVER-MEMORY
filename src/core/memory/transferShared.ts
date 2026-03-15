import { MEMORY_LIFECYCLES, MEMORY_TYPES } from '../../constants.js';
import type {
  EverMemoryImportToolResult,
  EverMemorySnapshotV1,
  MemoryItem,
  MemoryScope,
} from '../../types.js';

export const SNAPSHOT_FORMAT = 'evermemory.snapshot.v1' as const;
export const DEFAULT_EXPORT_LIMIT = 200;
export const MAX_EXPORT_LIMIT = 5000;
export const MAX_IMPORT_ITEMS = 5000;
export const ALLOWED_SOURCE_KINDS: MemoryItem['source']['kind'][] = [
  'message',
  'tool',
  'manual',
  'summary',
  'inference',
  'test',
  'runtime_user',
  'runtime_project',
  'reflection_derived',
  'imported',
];
export const ALLOWED_SOURCE_ACTORS = ['user', 'assistant', 'system'] as const;

export interface ImportCandidate {
  memory: MemoryItem;
  exists: boolean;
}

export type ImportRejectedItem = EverMemoryImportToolResult['rejected'][number];
export type ImportValidationFailure = Omit<ImportRejectedItem, 'id'>;

export function pushRejection(target: EverMemoryImportToolResult, rejection: ImportRejectedItem): void {
  target.rejected.push(rejection);
  target.summary.rejected += 1;
  target.summary.rejectedByReason[rejection.reason] =
    (target.summary.rejectedByReason[rejection.reason] ?? 0) + 1;
}

export function formatValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    const trimmed = value.length > 120 ? `${value.slice(0, 117)}...` : value;
    return `"${trimmed}"`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function describeType(value: unknown): string {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value === null) {
    return 'null';
  }
  return typeof value;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isValidIso(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  return Number.isFinite(Date.parse(value));
}

export function clampScore(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

export function normalizeScope(scope: MemoryScope): MemoryScope {
  return {
    userId: scope.userId,
    chatId: scope.chatId,
    project: scope.project,
    global: scope.global,
  };
}

export function mergeScope(source: MemoryScope, override?: MemoryScope): MemoryScope {
  if (!override) {
    return normalizeScope(source);
  }

  return {
    userId: override.userId ?? source.userId,
    chatId: override.chatId ?? source.chatId,
    project: override.project ?? source.project,
    global: override.global ?? source.global,
  };
}

export function cloneMemory(item: MemoryItem): MemoryItem {
  return {
    ...item,
    source: {
      ...item.source,
    },
    scope: {
      ...item.scope,
    },
    scores: {
      ...item.scores,
    },
    timestamps: {
      ...item.timestamps,
    },
    state: {
      ...item.state,
    },
    evidence: {
      excerpt: item.evidence.excerpt,
      references: [...(item.evidence.references ?? [])],
    },
    tags: [...item.tags],
    relatedEntities: [...item.relatedEntities],
    stats: {
      ...item.stats,
    },
  };
}

export function validationFailure(reason: string, detail: string, hint?: string): ImportValidationFailure {
  return { reason, detail, hint };
}

export function validateScore(
  name: 'confidence' | 'importance' | 'explicitness',
  value: unknown,
): ImportValidationFailure | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return validationFailure(
      'invalid_scores',
      `${name}=${formatValue(value)} is not a finite number`,
      'Provide numeric scores between 0 and 1',
    );
  }

  if (value < 0) {
    return validationFailure(
      'invalid_scores',
      `${name}=${value} is below the allowed range [0,1]`,
      `Clamp ${name} to range 0-1`,
    );
  }

  if (value > 1) {
    return validationFailure(
      'invalid_scores',
      `${name}=${value} exceeds the allowed range [0,1]`,
      `Clamp ${name} to range 0-1`,
    );
  }

  return null;
}

export function validateImportMemory(memory: MemoryItem): ImportValidationFailure | null {
  const trimmedId = memory.id?.trim() ?? '';
  if (trimmedId.length === 0) {
    return validationFailure(
      'invalid_id',
      memory.id ? 'id is empty after trimming whitespace' : 'id is missing',
      'Provide a stable non-empty id for each memory item',
    );
  }

  const trimmedContent = memory.content?.trim() ?? '';
  if (trimmedContent.length < 3) {
    return validationFailure(
      'invalid_content',
      trimmedContent.length === 0
        ? 'content is empty string'
        : `content length ${trimmedContent.length} is shorter than minimum 3 characters`,
      'Provide non-empty content with at least 3 characters',
    );
  }

  if (!MEMORY_TYPES.includes(memory.type)) {
    return validationFailure(
      'invalid_type',
      `type=${formatValue(memory.type)} is not supported`,
      `Use one of: ${MEMORY_TYPES.join(', ')}`,
    );
  }

  if (!MEMORY_LIFECYCLES.includes(memory.lifecycle)) {
    return validationFailure(
      'invalid_lifecycle',
      `lifecycle=${formatValue(memory.lifecycle)} is not supported`,
      `Use one of: ${MEMORY_LIFECYCLES.join(', ')}`,
    );
  }

  if (!ALLOWED_SOURCE_KINDS.includes(memory.source.kind)) {
    return validationFailure(
      'invalid_source_kind',
      `source.kind=${formatValue(memory.source.kind)} is not allowed`,
      `Use one of: ${ALLOWED_SOURCE_KINDS.join(', ')}`,
    );
  }

  if (memory.source.actor && !ALLOWED_SOURCE_ACTORS.includes(memory.source.actor)) {
    return validationFailure(
      'invalid_source_actor',
      `source.actor=${formatValue(memory.source.actor)} must be one of ${ALLOWED_SOURCE_ACTORS.join(', ')}`,
      `Choose actor from: ${ALLOWED_SOURCE_ACTORS.join(', ')}`,
    );
  }

  const invalidScore =
    validateScore('confidence', memory.scores.confidence) ??
    validateScore('importance', memory.scores.importance) ??
    validateScore('explicitness', memory.scores.explicitness);
  if (invalidScore) {
    return invalidScore;
  }

  if (!isValidIso(memory.timestamps.createdAt)) {
    return validationFailure(
      'invalid_timestamps',
      `timestamps.createdAt=${formatValue(memory.timestamps.createdAt)} is not a valid ISO-8601 timestamp`,
      'Provide ISO-8601 timestamps such as 2024-01-01T00:00:00.000Z',
    );
  }

  if (!isValidIso(memory.timestamps.updatedAt)) {
    return validationFailure(
      'invalid_timestamps',
      `timestamps.updatedAt=${formatValue(memory.timestamps.updatedAt)} is not a valid ISO-8601 timestamp`,
      'Provide ISO-8601 timestamps such as 2024-01-01T00:00:00.000Z',
    );
  }

  if (memory.timestamps.lastAccessedAt && !isValidIso(memory.timestamps.lastAccessedAt)) {
    return validationFailure(
      'invalid_last_accessed_at',
      `timestamps.lastAccessedAt=${formatValue(memory.timestamps.lastAccessedAt)} is not a valid ISO-8601 timestamp`,
      'Remove the field or provide a valid ISO-8601 timestamp',
    );
  }

  if (!isFiniteNumber(memory.stats.accessCount)) {
    return validationFailure(
      'invalid_stats',
      `stats.accessCount=${formatValue(memory.stats.accessCount)} is not a finite number`,
      'Provide numeric accessCount values',
    );
  }

  if (!isFiniteNumber(memory.stats.retrievalCount)) {
    return validationFailure(
      'invalid_stats',
      `stats.retrievalCount=${formatValue(memory.stats.retrievalCount)} is not a finite number`,
      'Provide numeric retrievalCount values',
    );
  }

  if (!Array.isArray(memory.tags)) {
    return validationFailure(
      'invalid_tags',
      `tags must be an array, received ${describeType(memory.tags)}`,
      'Provide tags as an array of strings',
    );
  }

  const invalidTagIndex = memory.tags.findIndex((item) => typeof item !== 'string');
  if (invalidTagIndex >= 0) {
    return validationFailure(
      'invalid_tags',
      `tags[${invalidTagIndex}]=${formatValue(memory.tags[invalidTagIndex])} is not a string`,
      'Ensure every tag is a string value',
    );
  }

  if (!Array.isArray(memory.relatedEntities)) {
    return validationFailure(
      'invalid_related_entities',
      `relatedEntities must be an array, received ${describeType(memory.relatedEntities)}`,
      'Provide relatedEntities as an array of strings',
    );
  }

  const invalidEntityIndex = memory.relatedEntities.findIndex((item) => typeof item !== 'string');
  if (invalidEntityIndex >= 0) {
    return validationFailure(
      'invalid_related_entities',
      `relatedEntities[${invalidEntityIndex}]=${formatValue(memory.relatedEntities[invalidEntityIndex])} is not a string`,
      'Ensure every related entity id is a string',
    );
  }

  const references = memory.evidence.references ?? [];
  if (!Array.isArray(references)) {
    return validationFailure(
      'invalid_evidence_references',
      `evidence.references must be an array, received ${describeType(references)}`,
      'Provide evidence references as an array of strings',
    );
  }

  const invalidReferenceIndex = references.findIndex((item) => typeof item !== 'string');
  if (invalidReferenceIndex >= 0) {
    return validationFailure(
      'invalid_evidence_references',
      `evidence.references[${invalidReferenceIndex}]=${formatValue(references[invalidReferenceIndex])} is not a string`,
      'Ensure every evidence reference is a string identifier',
    );
  }

  return null;
}

export function sanitizeImportMemory(memory: MemoryItem, scopeOverride?: MemoryScope): MemoryItem {
  const normalized = cloneMemory(memory);
  normalized.id = normalized.id.trim();
  normalized.content = normalized.content.trim();
  normalized.scope = mergeScope(normalized.scope, scopeOverride);
  normalized.scores = {
    confidence: clampScore(normalized.scores.confidence),
    importance: clampScore(normalized.scores.importance),
    explicitness: clampScore(normalized.scores.explicitness),
  };
  normalized.stats = {
    accessCount: Math.max(0, Math.floor(normalized.stats.accessCount)),
    retrievalCount: Math.max(0, Math.floor(normalized.stats.retrievalCount)),
  };
  normalized.tags = normalized.tags.map((item) => item.trim()).filter((item) => item.length > 0);
  normalized.relatedEntities = normalized.relatedEntities
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  normalized.evidence.references = (normalized.evidence.references ?? [])
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return normalized;
}

export function clampLimit(limit: number | undefined, fallback: number): number {
  if (!isFiniteNumber(limit)) {
    return fallback;
  }
  return Math.max(1, Math.min(Math.floor(limit), MAX_EXPORT_LIMIT));
}

export function emptyImportResult(mode: 'review' | 'apply', approved: boolean): EverMemoryImportToolResult {
  return {
    mode,
    approved,
    applied: false,
    total: 0,
    toCreate: 0,
    toUpdate: 0,
    imported: 0,
    updated: 0,
    rejected: [],
    summary: {
      totalRequested: 0,
      accepted: 0,
      rejected: 0,
      acceptedByType: {},
      rejectedByReason: {},
    },
  };
}

export type SnapshotFormat = typeof SNAPSHOT_FORMAT;
export type Snapshot = EverMemorySnapshotV1;
