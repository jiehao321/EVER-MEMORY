import type { IntentRepository } from '../../storage/intentRepo.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { MemoryItem, MemoryScope } from '../../types/memory.js';
import type { IntentRecord } from '../../types/intent.js';
import type { IntentMemoryNeed, IntentType, MemoryType } from '../../types/primitives.js';

export interface PredictiveContextResult {
  predictions: PredictedItem[];
  total: number;
  patternsAnalyzed: number;
}

export interface PredictedItem {
  memory: MemoryItem;
  predictedScore: number;
  reason: string;
}

const MAX_RECENT_SESSIONS = 10;
const MAX_PREDICTED_ITEMS = 5;
const MIN_PATTERN_FREQUENCY = 2;

const MEMORY_TYPES_BY_INTENT: Record<IntentType, MemoryType[]> = {
  question: ['fact', 'summary'],
  instruction: ['constraint', 'preference'],
  correction: ['preference', 'constraint'],
  preference: ['preference', 'identity'],
  planning: ['commitment', 'decision', 'project'],
  status_update: ['summary', 'fact'],
  other: ['fact'],
};

const MEMORY_NEED_WEIGHTS: Record<IntentMemoryNeed, number> = {
  none: 0.7,
  light: 0.85,
  targeted: 1,
  deep: 1.15,
};

interface RecentIntentPattern {
  intentType: IntentType;
  memoryNeed: IntentMemoryNeed;
}

interface IntentRepoWithListRecent {
  listRecent(limit?: number): IntentRecord[];
}

export class PredictiveContextService {
  private readonly predictiveCache = new Map<string, PredictedItem[]>();

  constructor(
    private readonly intentRepo: IntentRepository,
    private readonly memoryRepo: MemoryRepository,
  ) {}

  /**
   * Build predictive cache for a new session.
   * Called at session start.
   * Analyzes recent intent patterns to predict what memories will be needed.
   */
  buildPredictiveCache(
    sessionId: string,
    scope?: MemoryScope,
  ): PredictiveContextResult {
    const recentIntents = this.getRecentIntents(MAX_RECENT_SESSIONS);

    if (recentIntents.length === 0) {
      this.predictiveCache.set(sessionId, []);
      return { predictions: [], total: 0, patternsAnalyzed: 0 };
    }

    const frequencyMap = new Map<IntentType, number>();
    const memoryNeedTotals = new Map<IntentType, number>();

    for (const intent of recentIntents) {
      frequencyMap.set(intent.intentType, (frequencyMap.get(intent.intentType) ?? 0) + 1);
      memoryNeedTotals.set(
        intent.intentType,
        (memoryNeedTotals.get(intent.intentType) ?? 0) + MEMORY_NEED_WEIGHTS[intent.memoryNeed],
      );
    }

    const commonTypes = Array.from(frequencyMap.entries())
      .filter(([, count]) => count >= MIN_PATTERN_FREQUENCY)
      .sort((left, right) => {
        const frequencyDelta = right[1] - left[1];
        if (frequencyDelta !== 0) {
          return frequencyDelta;
        }

        const rightNeed = memoryNeedTotals.get(right[0]) ?? 0;
        const leftNeed = memoryNeedTotals.get(left[0]) ?? 0;
        return rightNeed - leftNeed;
      })
      .slice(0, 3)
      .map(([type]) => type);

    if (commonTypes.length === 0) {
      this.predictiveCache.set(sessionId, []);
      return { predictions: [], total: 0, patternsAnalyzed: recentIntents.length };
    }

    const predictions: PredictedItem[] = [];
    const seen = new Set<string>();

    for (const intentType of commonTypes) {
      const targetTypes = MEMORY_TYPES_BY_INTENT[intentType] ?? ['fact'];
      const frequency = frequencyMap.get(intentType) ?? 0;
      const averageNeedWeight = (memoryNeedTotals.get(intentType) ?? frequency) / frequency;
      const patternScore = Math.min((frequency / recentIntents.length) * averageNeedWeight, 1);

      try {
        const memories = this.memoryRepo.search({
          types: targetTypes,
          scope,
          activeOnly: true,
          archived: false,
          limit: 5,
        });

        for (const memory of memories) {
          if (seen.has(memory.id)) {
            continue;
          }

          seen.add(memory.id);
          predictions.push({
            memory,
            predictedScore: Number((patternScore * memory.scores.importance).toFixed(3)),
            reason: `pattern:${intentType}`,
          });
        }
      } catch {
        continue;
      }
    }

    const sorted = predictions
      .sort((left, right) => right.predictedScore - left.predictedScore)
      .slice(0, MAX_PREDICTED_ITEMS);

    this.predictiveCache.set(sessionId, sorted);

    return {
      predictions: sorted,
      total: sorted.length,
      patternsAnalyzed: recentIntents.length,
    };
  }

  getCachedPredictions(sessionId: string): PredictedItem[] {
    return this.predictiveCache.get(sessionId) ?? [];
  }

  clearCache(sessionId: string): void {
    this.predictiveCache.delete(sessionId);
  }

  private getRecentIntents(limit: number): RecentIntentPattern[] {
    try {
      const repo = this.intentRepo as IntentRepository & Partial<IntentRepoWithListRecent>;
      const records = typeof repo.listRecent === 'function' ? repo.listRecent(limit) : [];

      return records.map((record) => ({
        intentType: this.normalizeIntentType(record.intent?.type),
        memoryNeed: this.normalizeMemoryNeed(record.signals?.memoryNeed),
      }));
    } catch {
      return [];
    }
  }

  private normalizeIntentType(value: unknown): IntentType {
    switch (value) {
      case 'question':
      case 'instruction':
      case 'correction':
      case 'preference':
      case 'planning':
      case 'status_update':
        return value;
      default:
        return 'other';
    }
  }

  private normalizeMemoryNeed(value: unknown): IntentMemoryNeed {
    switch (value) {
      case 'light':
      case 'targeted':
      case 'deep':
        return value;
      default:
        return 'none';
    }
  }
}
