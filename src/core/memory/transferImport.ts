import type { ProfileProjectionService } from '../profile/projection.js';
import type { DebugRepository } from '../../storage/debugRepo.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { SemanticRepository } from '../../storage/semanticRepo.js';
import type {
  EverMemoryImportMode,
  EverMemoryImportToolInput,
  EverMemoryImportToolResult,
} from '../../types.js';
import {
  ImportCandidate,
  MAX_IMPORT_ITEMS,
  SNAPSHOT_FORMAT,
  describeType,
  emptyImportResult,
  formatValue,
  pushRejection,
  sanitizeImportMemory,
  validateImportMemory,
} from './transferShared.js';

interface ImportSnapshotDependencies {
  memoryRepo: MemoryRepository;
  debugRepo?: DebugRepository;
  semanticEnabled: boolean;
  semanticRepo?: SemanticRepository;
  profileService?: ProfileProjectionService;
}

export function importSnapshot(
  deps: ImportSnapshotDependencies,
  input: EverMemoryImportToolInput,
): EverMemoryImportToolResult {
  const mode: EverMemoryImportMode = input.mode ?? 'review';
  const approved = input.approved ?? false;
  const base = emptyImportResult(mode, approved);

  if (!input.snapshot || input.snapshot.format !== SNAPSHOT_FORMAT) {
    pushRejection(base, {
      reason: 'invalid_snapshot_format',
      detail: `snapshot.format=${formatValue(input.snapshot?.format)} is not ${SNAPSHOT_FORMAT}`,
      hint: 'Provide a snapshot exported via evermemoryExport',
    });
    deps.debugRepo?.log('memory_import_reviewed', undefined, {
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
    deps.debugRepo?.log('memory_import_reviewed', undefined, {
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
    const existing = deps.memoryRepo.findById(normalized.id);
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

    deps.debugRepo?.log('memory_import_reviewed', undefined, {
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
      deps.memoryRepo.update(candidate.memory);
      updated += 1;
    } else {
      deps.memoryRepo.insert(candidate.memory);
      imported += 1;
    }

    if (deps.semanticEnabled && deps.semanticRepo) {
      deps.semanticRepo.upsertFromMemory(candidate.memory);
    }

    if (candidate.memory.scope.userId) {
      touchedUsers.add(candidate.memory.scope.userId);
    }
  }

  if (deps.profileService) {
    for (const userId of touchedUsers) {
      deps.profileService.recomputeForUser(userId);
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

  deps.debugRepo?.log('memory_import_applied', undefined, {
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
