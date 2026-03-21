import { clampLimit, cloneMemory, DEFAULT_EXPORT_LIMIT, nowIso, SNAPSHOT_FORMAT } from './transferShared.js';
export function exportSnapshot(deps, input = {}) {
    const includeArchived = input.includeArchived ?? false;
    const limit = clampLimit(input.limit, DEFAULT_EXPORT_LIMIT);
    const filters = includeArchived
        ? { scope: input.scope, limit }
        : { scope: input.scope, archived: false, limit };
    const items = deps.memoryRepo.search(filters).map(cloneMemory);
    const snapshot = {
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
