import { detectConflicts, resolveConflict } from '../core/memory/conflict.js';
import type { MemoryService } from '../core/memory/service.js';
import type { MemoryRepository } from '../storage/memoryRepo.js';
import type { SemanticRepository } from '../storage/semanticRepo.js';
import type { EverMemoryConsolidateToolInput, EverMemoryConsolidateToolResult } from '../types.js';

const CONFLICT_SCAN_LIMIT = 20;
const MAX_AUTO_RESOLVE = 5;
const DEFAULT_CONSOLIDATION_MODE = 'daily';

type ConflictSample = { memoryA: string; memoryB: string; reason: string };

async function scanConflicts(
  memoryRepo: MemoryRepository,
  semanticRepo: SemanticRepository | undefined,
  scope: EverMemoryConsolidateToolInput['scope'],
): Promise<{
  processed: number;
  conflicts?: {
    count: number;
    samples: ConflictSample[];
    pairs: Awaited<ReturnType<typeof detectConflicts>>;
  };
}> {
  const candidates = memoryRepo.search({
    scope,
    activeOnly: true,
    archived: false,
    limit: CONFLICT_SCAN_LIMIT,
  });

  if (!semanticRepo) {
    return { processed: candidates.length };
  }

  const allConflicts: Array<Awaited<ReturnType<typeof detectConflicts>>[number]> = [];
  for (const memory of candidates) {
    const pairs = await detectConflicts(memory.id, memory.content, semanticRepo, memoryRepo);
    allConflicts.push(...pairs);
  }

  const seen = new Set<string>();
  const dedupedPairs: Array<Awaited<ReturnType<typeof detectConflicts>>[number]> = [];
  const samples: ConflictSample[] = [];
  for (const pair of allConflicts) {
    const key = [pair.memoryA.id, pair.memoryB.id].sort().join('\x00');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    dedupedPairs.push(pair);
    samples.push({
      memoryA: pair.memoryA.content,
      memoryB: pair.memoryB.content,
      reason: `similarity=${pair.similarity.toFixed(3)}, conflictScore=${pair.conflictScore.toFixed(3)}`,
    });
  }

  return {
    processed: candidates.length,
    conflicts: {
      count: dedupedPairs.length,
      samples: samples.slice(0, 5),
      pairs: dedupedPairs,
    },
  };
}

export async function evermemoryConsolidate(
  memoryService: MemoryService,
  memoryRepo: MemoryRepository,
  semanticRepo: SemanticRepository | undefined,
  input: EverMemoryConsolidateToolInput = {},
): Promise<EverMemoryConsolidateToolResult> {
  const isDryRun = input.dryRun === true;
  const mode = input.mode ?? DEFAULT_CONSOLIDATION_MODE;
  const report = isDryRun
    ? null
    : memoryService.consolidate({
        mode: input.mode,
        scope: input.scope,
      });
  const scan = await scanConflicts(memoryRepo, semanticRepo, input.scope);

  const base: EverMemoryConsolidateToolResult = {
    mode: report?.mode ?? mode,
    processed: report?.processed ?? scan.processed,
    merged: report?.merged ?? 0,
    archivedStale: report?.archivedStale ?? 0,
    dryRun: isDryRun || undefined,
  };

  if (!scan.conflicts) {
    return base;
  }

  let resolvedCount = 0;
  if (!isDryRun && input.autoResolveConflicts === true) {
    for (const pair of scan.conflicts.pairs) {
      if (resolvedCount >= MAX_AUTO_RESOLVE) break;
      await resolveConflict(pair, memoryRepo);
      resolvedCount += 1;
    }
  }

  return {
    ...base,
    resolvedCount: resolvedCount > 0 ? resolvedCount : undefined,
    detectedConflicts: {
      count: scan.conflicts.count,
      samples: scan.conflicts.samples,
    },
  };
}
