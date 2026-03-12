import type { MemoryService } from '../core/memory/service.js';
import type { EverMemoryConsolidateToolInput, EverMemoryConsolidateToolResult } from '../types.js';

export function evermemoryConsolidate(
  memoryService: MemoryService,
  input: EverMemoryConsolidateToolInput = {},
): EverMemoryConsolidateToolResult {
  return memoryService.consolidate({
    mode: input.mode,
    scope: input.scope,
  });
}
