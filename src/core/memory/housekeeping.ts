import type { MemoryLifecycleService } from './lifecycle.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { MemoryItem, MemoryScope } from '../../types.js';

export interface HousekeepingConfig {
  readonly staleThresholdDays: number;
  readonly highFrequencyThreshold: number;
  readonly mergeSimThreshold: number;
  readonly maxMergePerRun: number;
}

export interface HousekeepingResult {
  readonly mergedCount: number;
  readonly archivedCount: number;
  readonly reinforcedCount: number;
  readonly durationMs: number;
}

export const DEFAULT_CONFIG: HousekeepingConfig = {
  staleThresholdDays: 30,
  highFrequencyThreshold: 5,
  mergeSimThreshold: 0.88,
  maxMergePerRun: 10,
};

function nowIso(): string {
  return new Date().toISOString();
}

function parseIso(value?: string): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toArchived(memory: MemoryItem, updatedAt: string, supersededBy?: string): MemoryItem {
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

function reinforce(memory: MemoryItem, updatedAt: string): MemoryItem {
  return {
    ...memory,
    scores: {
      ...memory.scores,
      importance: Math.min(1, Number((memory.scores.importance + 0.1).toFixed(4))),
    },
    timestamps: {
      ...memory.timestamps,
      updatedAt,
    },
  };
}

export class MemoryHousekeepingService {
  constructor(
    private readonly memoryRepo: MemoryRepository,
    private readonly lifecycleService: MemoryLifecycleService,
    private readonly config: HousekeepingConfig = DEFAULT_CONFIG,
  ) {}

  async run(scope: MemoryScope): Promise<HousekeepingResult> {
    const startedAt = Date.now();
    const candidates = this.memoryRepo.search({
      scope,
      activeOnly: true,
      archived: false,
      limit: 500,
    });

    const mergedCount = this.mergeNearDuplicates(candidates);
    const archivedCount = this.archiveStale(scope);
    const reinforcedCount = this.reinforceHighFrequency(scope);

    return {
      mergedCount,
      archivedCount,
      reinforcedCount,
      durationMs: Date.now() - startedAt,
    };
  }

  async runIfNeeded(scope: MemoryScope, lastRunAt?: string): Promise<HousekeepingResult | null> {
    const lastRunTs = parseIso(lastRunAt);
    if (lastRunTs > 0 && (Date.now() - lastRunTs) < 24 * 60 * 60 * 1000) {
      return null;
    }
    return this.run(scope);
  }

  private mergeNearDuplicates(candidates: readonly MemoryItem[]): number {
    let merged = 0;
    const seenArchived = new Set<string>();

    for (let index = 0; index < candidates.length; index += 1) {
      const current = candidates[index];
      if (!current || seenArchived.has(current.id) || merged >= this.config.maxMergePerRun) {
        continue;
      }

      for (let offset = index + 1; offset < candidates.length; offset += 1) {
        const candidate = candidates[offset];
        if (!candidate || seenArchived.has(candidate.id) || current.type !== candidate.type) {
          continue;
        }

        const score = this.lifecycleService.scoreNearDuplicate(current.content, candidate.content);
        if (score < this.config.mergeSimThreshold) {
          continue;
        }

        const kept = this.lifecycleService.preferMemory(current, candidate);
        const archived = kept.id === current.id ? candidate : current;
        this.memoryRepo.update(toArchived(archived, nowIso(), kept.id));
        seenArchived.add(archived.id);
        merged += 1;
        break;
      }
    }

    return merged;
  }

  private archiveStale(scope: MemoryScope): number {
    const cutoff = Date.now() - this.config.staleThresholdDays * 24 * 60 * 60 * 1000;
    const candidates = this.memoryRepo.search({
      scope,
      activeOnly: true,
      archived: false,
      limit: 500,
    });
    let archived = 0;

    for (const memory of candidates) {
      const lastTouchedAt = parseIso(memory.timestamps.lastAccessedAt ?? memory.timestamps.updatedAt);
      if (lastTouchedAt <= 0 || lastTouchedAt > cutoff || memory.stats.accessCount >= 2) {
        continue;
      }

      this.memoryRepo.update(toArchived(memory, nowIso()));
      archived += 1;
    }

    return archived;
  }

  private reinforceHighFrequency(scope: MemoryScope): number {
    const candidates = this.memoryRepo.search({
      scope,
      activeOnly: true,
      archived: false,
      limit: 500,
    });
    let reinforced = 0;

    for (const memory of candidates) {
      if (memory.stats.accessCount < this.config.highFrequencyThreshold || memory.scores.importance >= 1) {
        continue;
      }

      this.memoryRepo.update(reinforce(memory, nowIso()));
      reinforced += 1;
    }

    return reinforced;
  }
}
