import type { MemoryType } from '../types.js';
import type { MemoryRepository } from '../storage/memoryRepo.js';
import type { MemoryQueryPort, MemorySearchQuery, MemorySnapshot } from '../core/butler/ports/memory.js';

function toSnapshotScope(scope: {
  userId?: string;
  chatId?: string;
  project?: string;
}): MemorySnapshot['scope'] {
  if (!scope.userId && !scope.chatId && !scope.project) {
    return undefined;
  }
  return {
    userId: scope.userId,
    chatId: scope.chatId,
    project: scope.project,
  };
}

function toMemorySnapshot(item: Awaited<ReturnType<MemoryRepository['search']>>[number]): MemorySnapshot {
  return {
    id: item.id,
    content: item.content,
    type: item.type,
    tags: [...item.tags],
    scores: {
      confidence: item.scores.confidence,
      importance: item.scores.importance,
    },
    scope: toSnapshotScope(item.scope),
    timestamps: {
      createdAt: item.timestamps.createdAt,
      updatedAt: item.timestamps.updatedAt,
    },
  };
}

function toMemoryTypes(types: MemorySearchQuery['types']): MemoryType[] | undefined {
  return types ? [...types] as MemoryType[] : undefined;
}

export class MemoryQueryAdapter implements MemoryQueryPort {
  constructor(private readonly memoryRepo: MemoryRepository) {}

  search(query: MemorySearchQuery): MemorySnapshot[] {
    return this.memoryRepo.search({
      scope: query.scope ? { ...query.scope } : undefined,
      types: toMemoryTypes(query.types),
      query: query.query,
      activeOnly: query.activeOnly,
      archived: query.archived,
      limit: query.limit,
    }).map(toMemorySnapshot);
  }
}
