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

function validateImportMemory(memory: MemoryItem): string | null {
  if (!memory.id || memory.id.trim().length === 0) {
    return 'invalid_id';
  }

  if (!memory.content || memory.content.trim().length < 3) {
    return 'invalid_content';
  }

  if (!MEMORY_TYPES.includes(memory.type)) {
    return 'invalid_type';
  }

  if (!MEMORY_LIFECYCLES.includes(memory.lifecycle)) {
    return 'invalid_lifecycle';
  }

  if (!ALLOWED_SOURCE_KINDS.includes(memory.source.kind)) {
    return 'invalid_source_kind';
  }

  if (memory.source.actor && !ALLOWED_SOURCE_ACTORS.includes(memory.source.actor)) {
    return 'invalid_source_actor';
  }

  if (!isFiniteNumber(memory.scores.confidence) || !isFiniteNumber(memory.scores.importance) || !isFiniteNumber(memory.scores.explicitness)) {
    return 'invalid_scores';
  }

  if (!isValidIso(memory.timestamps.createdAt) || !isValidIso(memory.timestamps.updatedAt)) {
    return 'invalid_timestamps';
  }

  if (memory.timestamps.lastAccessedAt && !isValidIso(memory.timestamps.lastAccessedAt)) {
    return 'invalid_last_accessed_at';
  }

  if (!isFiniteNumber(memory.stats.accessCount) || !isFiniteNumber(memory.stats.retrievalCount)) {
    return 'invalid_stats';
  }

  if (!Array.isArray(memory.tags) || !memory.tags.every((item) => typeof item === 'string')) {
    return 'invalid_tags';
  }

  if (!Array.isArray(memory.relatedEntities) || !memory.relatedEntities.every((item) => typeof item === 'string')) {
    return 'invalid_related_entities';
  }

  if (!Array.isArray(memory.evidence.references ?? []) || !(memory.evidence.references ?? []).every((item) => typeof item === 'string')) {
    return 'invalid_evidence_references';
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
      base.rejected.push({ reason: 'invalid_snapshot_format' });
      this.debugRepo?.log('memory_import_reviewed', undefined, {
        mode,
        approved,
        applied: false,
        reason: 'invalid_snapshot_format',
      });
      return base;
    }

    if (!Array.isArray(input.snapshot.items)) {
      base.rejected.push({ reason: 'invalid_snapshot_items' });
      this.debugRepo?.log('memory_import_reviewed', undefined, {
        mode,
        approved,
        applied: false,
        reason: 'invalid_snapshot_items',
      });
      return base;
    }

    const rawItems = input.snapshot.items.slice(0, MAX_IMPORT_ITEMS);
    if (input.snapshot.items.length > MAX_IMPORT_ITEMS) {
      base.rejected.push({ reason: 'snapshot_truncated_by_limit' });
    }

    const allowOverwrite = input.allowOverwrite ?? false;
    const candidates: ImportCandidate[] = [];
    for (const raw of rawItems) {
      const normalized = sanitizeImportMemory(raw, input.scopeOverride);
      const invalidReason = validateImportMemory(normalized);
      if (invalidReason) {
        base.rejected.push({
          id: raw.id,
          reason: invalidReason,
        });
        continue;
      }

      const existing = this.memoryRepo.findById(normalized.id);
      if (existing && !allowOverwrite) {
        base.rejected.push({
          id: normalized.id,
          reason: 'duplicate_id',
        });
        continue;
      }

      candidates.push({
        memory: normalized,
        exists: Boolean(existing),
      });
    }

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
      };

      if (mode === 'apply' && !approved) {
        result.rejected = [
          ...result.rejected,
          { reason: 'approval_required_for_apply' },
        ];
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
