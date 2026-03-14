import { MEMORY_LIFECYCLES, MEMORY_TYPES } from '../../constants.js';
import type { ProfileProjectionService } from '../profile/projection.js';
import type { DebugRepository } from '../../storage/debugRepo.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { SemanticRepository } from '../../storage/semanticRepo.js';
import type {
  EverMemoryExportToolInput,
  EverMemoryExportToolResult,
  EverMemoryImportMode,
  EverMemoryImportToolInput,
  EverMemoryImportToolResult,
  EverMemorySnapshotV1,
  MemoryItem,
  MemoryScope,
} from '../../types.js';

const SNAPSHOT_FORMAT = 'evermemory.snapshot.v1' as const;
const DEFAULT_EXPORT_LIMIT = 200;
const MAX_EXPORT_LIMIT = 5000;
const MAX_IMPORT_ITEMS = 5000;
const ALLOWED_SOURCE_KINDS: MemoryItem['source']['kind'][] = [
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
const ALLOWED_SOURCE_ACTORS = ['user', 'assistant', 'system'] as const;

interface MemoryTransferServiceOptions {
  semanticEnabled?: boolean;
  semanticRepo?: SemanticRepository;
  profileService?: ProfileProjectionService;
}

interface ImportCandidate {
  memory: MemoryItem;
  exists: boolean;
}

type ImportRejectedItem = EverMemoryImportToolResult['rejected'][number];

function pushRejection(target: EverMemoryImportToolResult, rejection: ImportRejectedItem): void {
  target.rejected.push(rejection);
  target.summary.rejected += 1;
  target.summary.rejectedByReason[rejection.reason] =
    (target.summary.rejectedByReason[rejection.reason] ?? 0) + 1;
}

function formatValue(value: unknown): string {
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

function describeType(value: unknown): string {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value === null) {
    return 'null';
  }
  return typeof value;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidIso(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  return Number.isFinite(Date.parse(value));
}

function clampScore(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function normalizeScope(scope: MemoryScope): MemoryScope {
  return {
    userId: scope.userId,
    chatId: scope.chatId,
    project: scope.project,
    global: scope.global,
  };
}

function mergeScope(source: MemoryScope, override?: MemoryScope): MemoryScope {
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

function cloneMemory(item: MemoryItem): MemoryItem {
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

type ImportValidationFailure = Omit<ImportRejectedItem, 'id'>;

function validationFailure(reason: string, detail: string, hint?: string): ImportValidationFailure {
  return { reason, detail, hint };
}

function validateScore(name: 'confidence' | 'importance' | 'explicitness', value: unknown): ImportValidationFailure | null {
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

function validateImportMemory(memory: MemoryItem): ImportValidationFailure | null {
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

function sanitizeImportMemory(memory: MemoryItem, scopeOverride?: MemoryScope): MemoryItem {
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

function clampLimit(limit: number | undefined, fallback: number): number {
  if (!isFiniteNumber(limit)) {
    return fallback;
  }
  return Math.max(1, Math.min(Math.floor(limit), MAX_EXPORT_LIMIT));
}

function emptyImportResult(mode: EverMemoryImportMode, approved: boolean): EverMemoryImportToolResult {
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

export class MemoryTransferService {
  private readonly semanticEnabled: boolean;
  private readonly semanticRepo?: SemanticRepository;
  private readonly profileService?: ProfileProjectionService;

  constructor(
    private readonly memoryRepo: MemoryRepository,
    private readonly debugRepo?: DebugRepository,
    options: MemoryTransferServiceOptions = {},
  ) {
    this.semanticEnabled = options.semanticEnabled ?? false;
    this.semanticRepo = options.semanticRepo;
    this.profileService = options.profileService;
  }

  exportSnapshot(input: EverMemoryExportToolInput = {}): EverMemoryExportToolResult {
    const includeArchived = input.includeArchived ?? false;
    const limit = clampLimit(input.limit, DEFAULT_EXPORT_LIMIT);
    const filters = includeArchived
      ? { scope: input.scope, limit }
      : { scope: input.scope, archived: false as const, limit };
    const items = this.memoryRepo.search(filters).map(cloneMemory);

    const snapshot: EverMemorySnapshotV1 = {
      format: SNAPSHOT_FORMAT,
      generatedAt: nowIso(),
      total: items.length,
      items,
    };

    this.debugRepo?.log('memory_exported', undefined, {
      exported: items.length,
      includeArchived,
      scope: input.scope,
      limit,
      generatedAt: snapshot.generatedAt,
    });

    return {
      snapshot,
      summary: {
        exported: items.length,
        includeArchived,
        scope: input.scope,
      },
    };
  }

  importSnapshot(input: EverMemoryImportToolInput): EverMemoryImportToolResult {
    const mode: EverMemoryImportMode = input.mode ?? 'review';
    const approved = input.approved ?? false;
    const base = emptyImportResult(mode, approved);

    if (!input.snapshot || input.snapshot.format !== SNAPSHOT_FORMAT) {
      pushRejection(base, {
        reason: 'invalid_snapshot_format',
        detail: `snapshot.format=${formatValue(input.snapshot?.format)} is not ${SNAPSHOT_FORMAT}`,
        hint: 'Provide a snapshot exported via evermemoryExport',
      });
      this.debugRepo?.log('memory_import_reviewed', undefined, {
        mode,
        approved,
        applied: false,
        reason: 'invalid_snapshot_format',
      });
      return base;
    }

    if (!Array.isArray(input.snapshot.items)) {
      pushRejection(base, {
        reason: 'invalid_snapshot_items',
        detail: `snapshot.items must be an array, received ${describeType(input.snapshot.items)}`,
        hint: 'Ensure the snapshot includes an items array from evermemoryExport',
      });
      this.debugRepo?.log('memory_import_reviewed', undefined, {
        mode,
        approved,
        applied: false,
        reason: 'invalid_snapshot_items',
      });
      return base;
    }

    base.summary.totalRequested = input.snapshot.items.length;
    const rawItems = input.snapshot.items.slice(0, MAX_IMPORT_ITEMS);
    if (input.snapshot.items.length > MAX_IMPORT_ITEMS) {
      pushRejection(base, {
        reason: 'snapshot_truncated_by_limit',
        detail: `snapshot has ${input.snapshot.items.length} items, limit is ${MAX_IMPORT_ITEMS}`,
        hint: `Split the import into batches of at most ${MAX_IMPORT_ITEMS} items`,
      });
    }

    const allowOverwrite = input.allowOverwrite ?? false;
    const candidates: ImportCandidate[] = [];
    const acceptedByTypeCounter: Record<string, number> = {};
    for (const raw of rawItems) {
      const invalidReason = validateImportMemory(raw);
      if (invalidReason) {
        pushRejection(base, {
          id: raw.id,
          ...invalidReason,
        });
        continue;
      }

      const normalized = sanitizeImportMemory(raw, input.scopeOverride);
      const existing = this.memoryRepo.findById(normalized.id);
      if (existing && !allowOverwrite) {
        pushRejection(base, {
          id: normalized.id,
          reason: 'duplicate_id',
          detail: `memory id ${normalized.id} already exists and allowOverwrite=false`,
          hint: 'Enable allowOverwrite or provide unique ids to avoid duplicates',
        });
        continue;
      }

      candidates.push({
        memory: normalized,
        exists: Boolean(existing),
      });
      acceptedByTypeCounter[normalized.type] = (acceptedByTypeCounter[normalized.type] ?? 0) + 1;
    }
    base.summary.accepted = candidates.length;
    base.summary.acceptedByType = acceptedByTypeCounter;

    const toCreate = candidates.filter((item) => !item.exists).length;
    const toUpdate = candidates.filter((item) => item.exists).length;

    if (mode === 'review' || !approved) {
      const result: EverMemoryImportToolResult = {
        mode,
        approved,
        applied: false,
        total: rawItems.length,
        toCreate,
        toUpdate,
        imported: 0,
        updated: 0,
        rejected: base.rejected,
        summary: base.summary,
      };

      if (mode === 'apply' && !approved) {
        pushRejection(result, {
          reason: 'approval_required_for_apply',
          detail: 'mode="apply" requires approved=true',
          hint: 'Run a review first, then re-run in apply mode with approved=true',
        });
      }

      this.debugRepo?.log('memory_import_reviewed', undefined, {
        mode,
        approved,
        applied: false,
        total: result.total,
        toCreate: result.toCreate,
        toUpdate: result.toUpdate,
        rejected: result.rejected.length,
      });
      return result;
    }

    let imported = 0;
    let updated = 0;
    const touchedUsers = new Set<string>();

    for (const candidate of candidates) {
      if (candidate.exists) {
        this.memoryRepo.update(candidate.memory);
        updated += 1;
      } else {
        this.memoryRepo.insert(candidate.memory);
        imported += 1;
      }

      if (this.semanticEnabled && this.semanticRepo) {
        this.semanticRepo.upsertFromMemory(candidate.memory);
      }

      if (candidate.memory.scope.userId) {
        touchedUsers.add(candidate.memory.scope.userId);
      }
    }

    if (this.profileService) {
      for (const userId of touchedUsers) {
        this.profileService.recomputeForUser(userId);
      }
    }

    const result: EverMemoryImportToolResult = {
      mode,
      approved,
      applied: true,
      total: rawItems.length,
      toCreate,
      toUpdate,
      imported,
      updated,
      rejected: base.rejected,
      summary: base.summary,
    };

    this.debugRepo?.log('memory_import_applied', undefined, {
      mode,
      approved,
      total: result.total,
      toCreate: result.toCreate,
      toUpdate: result.toUpdate,
      imported: result.imported,
      updated: result.updated,
      rejected: result.rejected.length,
      allowOverwrite,
    });
    return result;
  }
}
