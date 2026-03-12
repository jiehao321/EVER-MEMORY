import type { DebugRepository } from '../../storage/debugRepo.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { ConsolidationMode, MemoryItem, MemoryScope } from '../../types.js';

const DEFAULT_DEDUPE_SCAN_LIMIT = 60;
const DEFAULT_STALE_EPISODIC_DAYS = 30;
const DEFAULT_STALE_SCAN_LIMIT = 120;
const NEAR_DUPLICATE_THRESHOLD = 0.9;
const CONSOLIDATION_LIMITS: Record<ConsolidationMode, number> = {
  light: 20,
  daily: 60,
  deep: 120,
};

interface LifecycleMaintenanceOptions {
  dedupeScanLimit?: number;
  staleEpisodicDays?: number;
  staleScanLimit?: number;
}

export interface ConsolidationRequest {
  mode?: ConsolidationMode;
  scope?: MemoryScope;
}

export interface ConsolidationReport {
  mode: ConsolidationMode;
  processed: number;
  merged: number;
  archivedStale: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseTimestamp(iso: string): number {
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : 0;
}

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/[.,!?;:()[\]{}"'`~|\\/，。！？；：、（）【】《》“”‘’]+/g, '')
    .replace(/\s+/g, ' ');
}

function tokenize(normalized: string): string[] {
  const ascii = normalized
    .split(/\s+/g)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const cjkChunks = normalized.match(/[\u4e00-\u9fff]+/g) ?? [];
  const cjkBigrams: string[] = [];

  for (const chunk of cjkChunks) {
    if (chunk.length === 1) {
      cjkBigrams.push(chunk);
      continue;
    }
    for (let index = 0; index < chunk.length - 1; index += 1) {
      cjkBigrams.push(chunk.slice(index, index + 2));
    }
  }

  return Array.from(new Set([...ascii, ...cjkBigrams]));
}

function jaccard(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...leftSet, ...rightSet]).size;
  if (union <= 0) {
    return 0;
  }
  return intersection / union;
}

function nearDuplicateScore(left: string, right: string): number {
  const leftNormalized = normalize(left);
  const rightNormalized = normalize(right);
  if (!leftNormalized || !rightNormalized) {
    return 0;
  }

  if (leftNormalized === rightNormalized) {
    return 1;
  }

  const leftTokens = tokenize(leftNormalized);
  const rightTokens = tokenize(rightNormalized);
  return jaccard(leftTokens, rightTokens);
}

function qualityScore(memory: MemoryItem): number {
  const textWeight = Math.min(1, normalize(memory.content).length / 200);
  return (
    memory.scores.importance * 0.4
    + memory.scores.confidence * 0.3
    + memory.scores.explicitness * 0.2
    + textWeight * 0.1
  );
}

function shouldPreferLeft(left: MemoryItem, right: MemoryItem): boolean {
  const leftQuality = qualityScore(left);
  const rightQuality = qualityScore(right);
  if (Math.abs(leftQuality - rightQuality) > 0.02) {
    return leftQuality > rightQuality;
  }

  return parseTimestamp(left.timestamps.updatedAt) >= parseTimestamp(right.timestamps.updatedAt);
}

function toArchivedMemory(
  memory: MemoryItem,
  updatedAt: string,
  supersededBy?: string,
): MemoryItem {
  return {
    ...memory,
    lifecycle: 'archive',
    timestamps: {
      ...memory.timestamps,
      updatedAt,
    },
    state: {
      ...memory.state,
      active: false,
      archived: true,
      supersededBy,
    },
  };
}

function scopeForMaintenance(scope: MemoryScope): MemoryScope | undefined {
  if (scope.userId || scope.chatId || scope.project || scope.global !== undefined) {
    return scope;
  }
  return undefined;
}

export class MemoryLifecycleService {
  private readonly dedupeScanLimit: number;
  private readonly staleEpisodicDays: number;
  private readonly staleScanLimit: number;

  constructor(
    private readonly memoryRepo: MemoryRepository,
    private readonly debugRepo?: DebugRepository,
    options: LifecycleMaintenanceOptions = {},
  ) {
    this.dedupeScanLimit = options.dedupeScanLimit ?? DEFAULT_DEDUPE_SCAN_LIMIT;
    this.staleEpisodicDays = options.staleEpisodicDays ?? DEFAULT_STALE_EPISODIC_DAYS;
    this.staleScanLimit = options.staleScanLimit ?? DEFAULT_STALE_SCAN_LIMIT;
  }

  maintainForNewMemory(memoryId: string): {
    merged: number;
    archivedStale: number;
  } {
    const memory = this.memoryRepo.findById(memoryId);
    if (!memory || !memory.state.active || memory.state.archived) {
      return {
        merged: 0,
        archivedStale: 0,
      };
    }

    const merged = this.mergeDuplicates(memory);
    const archivedStale = this.archiveStaleEpisodic(memory.scope, memory.id);

    return {
      merged,
      archivedStale,
    };
  }

  consolidate(input: ConsolidationRequest = {}): ConsolidationReport {
    const mode: ConsolidationMode = input.mode ?? 'daily';
    const limit = CONSOLIDATION_LIMITS[mode];
    const scoped = input.scope ? scopeForMaintenance(input.scope) : undefined;
    const candidates = this.memoryRepo.search({
      scope: scoped,
      activeOnly: true,
      archived: false,
      limit,
    });

    let merged = 0;
    let archivedStale = 0;
    for (const item of candidates) {
      const result = this.maintainForNewMemory(item.id);
      merged += result.merged;
      archivedStale += result.archivedStale;
    }

    return {
      mode,
      processed: candidates.length,
      merged,
      archivedStale,
    };
  }

  private mergeDuplicates(memory: MemoryItem): number {
    const scope = scopeForMaintenance(memory.scope);
    const candidates = this.memoryRepo.search({
      scope,
      types: [memory.type],
      activeOnly: true,
      archived: false,
      limit: this.dedupeScanLimit,
    }).filter((item) => item.id !== memory.id);

    let merged = 0;
    let current = memory;

    for (const candidate of candidates) {
      if (!current.state.active || current.state.archived) {
        break;
      }

      const duplicateScore = nearDuplicateScore(current.content, candidate.content);
      if (duplicateScore < NEAR_DUPLICATE_THRESHOLD) {
        continue;
      }

      const keepCurrent = shouldPreferLeft(current, candidate);
      const kept = keepCurrent ? current : candidate;
      const archived = keepCurrent ? candidate : current;
      const updatedAt = nowIso();

      this.memoryRepo.update(toArchivedMemory(archived, updatedAt, kept.id));
      this.debugRepo?.log('memory_merged', kept.id, {
        keptId: kept.id,
        archivedId: archived.id,
        duplicateScore: Number(duplicateScore.toFixed(4)),
      });
      merged += 1;

      if (!keepCurrent) {
        current = toArchivedMemory(current, updatedAt, kept.id);
      }
    }

    return merged;
  }

  private archiveStaleEpisodic(scope: MemoryScope, excludedId?: string): number {
    const scoped = scopeForMaintenance(scope);
    const candidates = this.memoryRepo.search({
      scope: scoped,
      lifecycles: ['episodic'],
      activeOnly: true,
      archived: false,
      limit: this.staleScanLimit,
    });

    if (candidates.length === 0) {
      return 0;
    }

    const thresholdMs = Date.now() - this.staleEpisodicDays * 24 * 60 * 60 * 1000;
    let archivedCount = 0;

    for (const item of candidates) {
      if (excludedId && item.id === excludedId) {
        continue;
      }

      const updatedTs = parseTimestamp(item.timestamps.updatedAt);
      if (updatedTs <= 0 || updatedTs > thresholdMs) {
        continue;
      }

      const updatedAt = nowIso();
      this.memoryRepo.update(toArchivedMemory(item, updatedAt));
      this.debugRepo?.log('memory_archived', item.id, {
        reason: 'stale_episodic',
        previousLifecycle: item.lifecycle,
        updatedAt: item.timestamps.updatedAt,
      });
      archivedCount += 1;
    }

    return archivedCount;
  }
}
