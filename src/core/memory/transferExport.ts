import type { DebugRepository } from '../../storage/debugRepo.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { EverMemoryExportToolInput, EverMemoryExportToolResult, EverMemorySnapshotV1 } from '../../types.js';
import { clampLimit, cloneMemory, DEFAULT_EXPORT_LIMIT, nowIso, SNAPSHOT_FORMAT } from './transferShared.js';

interface ExportSnapshotDependencies {
  memoryRepo: MemoryRepository;
  debugRepo?: DebugRepository;
}

export function exportSnapshot(
  deps: ExportSnapshotDependencies,
  input: EverMemoryExportToolInput = {},
): EverMemoryExportToolResult {
  const includeArchived = input.includeArchived ?? false;
  const limit = clampLimit(input.limit, DEFAULT_EXPORT_LIMIT);
  const filters = includeArchived
    ? { scope: input.scope, limit }
    : { scope: input.scope, archived: false as const, limit };
  const items = deps.memoryRepo.search(filters).map(cloneMemory);

  const snapshot: EverMemorySnapshotV1 = {
    format: SNAPSHOT_FORMAT,
    generatedAt: nowIso(),
    total: items.length,
    items,
  };

  deps.debugRepo?.log('memory_exported', undefined, {
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
