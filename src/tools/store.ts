import type { MemoryService } from '../core/memory/service.js';
import type { EverMemoryStoreToolInput, EverMemoryStoreToolResult, MemoryScope, MemorySource } from '../types.js';

const DEFAULT_SOURCE: MemorySource = {
  kind: 'tool',
  actor: 'system',
};

function normalizeScope(scope?: MemoryScope): MemoryScope | undefined {
  if (!scope) {
    return undefined;
  }

  return {
    userId: scope.userId,
    chatId: scope.chatId,
    project: scope.project,
    global: scope.global,
  };
}

export function evermemoryStore(
  memoryService: MemoryService,
  input: EverMemoryStoreToolInput,
): EverMemoryStoreToolResult {
  return memoryService.store(
    {
      content: input.content,
      type: input.type,
      lifecycle: input.lifecycle,
      scope: normalizeScope(input.scope),
      source: input.source ?? DEFAULT_SOURCE,
      tags: input.tags ?? [],
      relatedEntities: input.relatedEntities ?? [],
    },
  );
}
