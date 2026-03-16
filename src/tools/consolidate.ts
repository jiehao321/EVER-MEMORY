import { detectConflicts } from '../core/memory/conflict.js';
import type { MemoryService } from '../core/memory/service.js';
import type { MemoryRepository } from '../storage/memoryRepo.js';
import type { SemanticRepository } from '../storage/semanticRepo.js';
import type { EverMemoryConsolidateToolInput, EverMemoryConsolidateToolResult } from '../types.js';

const CONFLICT_SCAN_LIMIT = 20;

export async function evermemoryConsolidate(
  memoryService: MemoryService,
  memoryRepo: MemoryRepository,
  semanticRepo: SemanticRepository | undefined,
  input: EverMemoryConsolidateToolInput = {},
): Promise<EverMemoryConsolidateToolResult> {
  const report = memoryService.consolidate({
    mode: input.mode,
    scope: input.scope,
  });

  const base: EverMemoryConsolidateToolResult = {
    mode: report.mode,
    processed: report.processed,
    merged: report.merged,
    archivedStale: report.archivedStale,
  };

  if (!semanticRepo) {
    return base;
  }

  const candidates = memoryRepo.search({
    scope: input.scope,
    activeOnly: true,
    archived: false,
    limit: CONFLICT_SCAN_LIMIT,
  });

  const allConflicts: Array<{ memoryA: string; memoryB: string; reason: string }> = [];

  for (const memory of candidates) {
    const pairs = await detectConflicts(memory.id, memory.content, semanticRepo, memoryRepo);
    for (const pair of pairs) {
      allConflicts.push({
        memoryA: pair.memoryA.content,
        memoryB: pair.memoryB.content,
        reason: `similarity=${pair.similarity.toFixed(3)}, conflictScore=${pair.conflictScore.toFixed(3)}`,
      });
    }
  }

  // Deduplicate by pair identity (order-insensitive)
  const seen = new Set<string>();
  const dedupedConflicts: Array<{ memoryA: string; memoryB: string; reason: string }> = [];
  for (const conflict of allConflicts) {
    const key = [conflict.memoryA, conflict.memoryB].sort().join('\x00');
    if (!seen.has(key)) {
      seen.add(key);
      dedupedConflicts.push(conflict);
    }
  }

  return {
    ...base,
    detectedConflicts: {
      count: dedupedConflicts.length,
      samples: dedupedConflicts.slice(0, 5),
    },
  };
}
