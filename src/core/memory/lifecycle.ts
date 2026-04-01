import type { DebugRepository } from '../../storage/debugRepo.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { ConsolidationMode, MemoryItem, MemoryLifecycle, MemoryScope } from '../../types.js';
import { nowIso } from '../../util/time.js';
import {
  calculateDecayScore,
  shouldArchive,
  shouldMigrateToEpisodic,
  shouldMigrateToSemantic,
} from './decay.js';
import {
  CONSOLIDATION_LIMITS,
  DEFAULT_DEDUPE_SCAN_LIMIT,
  DEFAULT_STALE_EPISODIC_DAYS,
  DEFAULT_STALE_SCAN_LIMIT,
  LIFECYCLE_MIGRATION_LIMIT_DAILY,
  LIFECYCLE_MIGRATION_LIMIT_DEEP,
  NEAR_DUPLICATE_THRESHOLD,
  QUALITY_TEXT_LENGTH_NORM,
  QUALITY_TIE_THRESHOLD,
  QUALITY_WEIGHT_CONFIDENCE,
  QUALITY_WEIGHT_EXPLICITNESS,
  QUALITY_WEIGHT_IMPORTANCE,
  QUALITY_WEIGHT_TEXT,
} from '../../tuning.js';

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
  migratedToEpisodic: number;
  migratedToSemantic: number;
  archivedByDecay: number;
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
  const textWeight = Math.min(1, normalize(memory.content).length / QUALITY_TEXT_LENGTH_NORM);
  return (
    memory.scores.importance * QUALITY_WEIGHT_IMPORTANCE
    + memory.scores.confidence * QUALITY_WEIGHT_CONFIDENCE
    + memory.scores.explicitness * QUALITY_WEIGHT_EXPLICITNESS
    + textWeight * QUALITY_WEIGHT_TEXT
  );
}

function shouldPreferLeft(left: MemoryItem, right: MemoryItem): boolean {
  const leftQuality = qualityScore(left);
  const rightQuality = qualityScore(right);
  if (Math.abs(leftQuality - rightQuality) > QUALITY_TIE_THRESHOLD) {
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

function toMigratedMemory(
  memory: MemoryItem,
  newLifecycle: MemoryLifecycle,
  updatedAt: string,
): MemoryItem {
  return {
    ...memory,
    lifecycle: newLifecycle,
    timestamps: {
      ...memory.timestamps,
      updatedAt,
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
    let migratedToEpisodic = 0;
    let migratedToSemantic = 0;
    let archivedByDecay = 0;

    for (const item of candidates) {
      const result = this.maintainForNewMemory(item.id);
      merged += result.merged;
      archivedStale += result.archivedStale;
    }

    // Apply lifecycle migrations based on mode
    if (mode === 'daily' || mode === 'deep') {
      const migrationResult = this.applyLifecycleMigrations(scoped, mode);
      migratedToEpisodic = migrationResult.migratedToEpisodic;
      migratedToSemantic = migrationResult.migratedToSemantic;
      archivedByDecay = migrationResult.archivedByDecay;
    }

    return {
      mode,
      processed: candidates.length,
      merged,
      archivedStale,
      migratedToEpisodic,
      migratedToSemantic,
      archivedByDecay,
    };
  }

  scoreNearDuplicate(leftContent: string, rightContent: string): number {
    return nearDuplicateScore(leftContent, rightContent);
  }

  preferMemory(left: MemoryItem, right: MemoryItem): MemoryItem {
    return shouldPreferLeft(left, right) ? left : right;
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

  private applyLifecycleMigrations(
    scope: MemoryScope | undefined,
    mode: ConsolidationMode,
  ): {
      migratedToEpisodic: number;
      migratedToSemantic: number;
      archivedByDecay: number;
    } {
    const limit = mode === 'deep' ? LIFECYCLE_MIGRATION_LIMIT_DEEP : LIFECYCLE_MIGRATION_LIMIT_DAILY;
    const candidates = this.memoryRepo.search({
      scope,
      activeOnly: true,
      archived: false,
      limit,
    });

    let migratedToEpisodic = 0;
    let migratedToSemantic = 0;
    let archivedByDecay = 0;

    for (const memory of candidates) {
      // Check for working → episodic migration
      if (shouldMigrateToEpisodic(memory)) {
        const updatedAt = nowIso();
        this.memoryRepo.update(toMigratedMemory(memory, 'episodic', updatedAt));
        this.debugRepo?.log('memory_archived', memory.id, {
          reason: 'lifecycle_migration',
          previousLifecycle: 'working',
          newLifecycle: 'episodic',
        });
        migratedToEpisodic += 1;
        continue;
      }

      // Check for episodic → semantic migration
      if (shouldMigrateToSemantic(memory)) {
        const updatedAt = nowIso();
        this.memoryRepo.update(toMigratedMemory(memory, 'semantic', updatedAt));
        this.debugRepo?.log('memory_archived', memory.id, {
          reason: 'lifecycle_migration',
          previousLifecycle: 'episodic',
          newLifecycle: 'semantic',
        });
        migratedToSemantic += 1;
        continue;
      }

      // Check for decay-based archiving (only in deep mode)
      if (mode === 'deep') {
        const decayScore = calculateDecayScore(memory);
        if (shouldArchive(decayScore)) {
          const updatedAt = nowIso();
          this.memoryRepo.update(toArchivedMemory(memory, updatedAt));
          this.debugRepo?.log('memory_archived', memory.id, {
            reason: 'decay_threshold',
            previousLifecycle: memory.lifecycle,
            decayScore: Number(decayScore.toFixed(4)),
          });
          archivedByDecay += 1;
        }
      }
    }

    return {
      migratedToEpisodic,
      migratedToSemantic,
      archivedByDecay,
    };
  }
}
