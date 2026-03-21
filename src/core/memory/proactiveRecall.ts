import type { RelationRepository } from '../../storage/relationRepo.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { MemoryItem, MemoryScope } from '../../types/memory.js';
import type { MemoryType } from '../../types/primitives.js';
import type { RuntimeUserProfile } from '../../types/runtime.js';

export interface ProactiveItem {
  memory: MemoryItem;
  proactiveScore: number;
  reason: 'graph_connected' | 'expiring_commitment' | 'profile_match';
}

export interface ProactiveRecallResult {
  items: ProactiveItem[];
  total: number;
}

const MAX_PROACTIVE_ITEMS = 3;
const MIN_PROACTIVE_SCORE = 0.5;
const GRAPH_EXPAND_DEPTH = 2;
const GRAPH_EXPAND_LIMIT = 10;
const MAX_GRAPH_SEEDS = 5;
const EXPIRY_DAYS_THRESHOLD = 7;
const COMMITMENT_TYPES: MemoryType[] = ['commitment', 'decision'];

export class ProactiveRecallService {
  constructor(
    private readonly relationRepo: RelationRepository,
    private readonly memoryRepo: MemoryRepository,
  ) {}

  /**
   * Find proactive recall items after a regular recall.
   * Non-blocking, deterministic, no LLM.
   */
  findProactiveItems(
    recalledItems: MemoryItem[],
    userProfile?: RuntimeUserProfile,
    scope?: Pick<MemoryScope, 'userId' | 'project'>,
  ): ProactiveRecallResult {
    const recalledIds = new Set(recalledItems.map((memory) => memory.id));
    const candidates = new Map<string, ProactiveItem>();

    for (const item of recalledItems.slice(0, MAX_GRAPH_SEEDS)) {
      const connected = this.relationRepo.findConnected(item.id, {
        maxDepth: GRAPH_EXPAND_DEPTH,
        types: ['causes', 'supports', 'depends_on'],
        limit: GRAPH_EXPAND_LIMIT,
      });

      for (const node of connected) {
        if (recalledIds.has(node.memoryId) || candidates.has(node.memoryId)) {
          continue;
        }

        const memory = this.memoryRepo.findById(node.memoryId);
        if (!memory || !memory.state.active || memory.state.archived) {
          continue;
        }

        const graphScore = 0.4 * (1 / Math.max(1, node.depth)) + 0.1 * (node.weight ?? 1);
        const importanceBonus = 0.1 * memory.scores.importance;
        const recencyBonus = 0.2 * this.recencyScore(memory);
        const score = graphScore + importanceBonus + recencyBonus;

        if (score >= MIN_PROACTIVE_SCORE) {
          candidates.set(node.memoryId, {
            memory,
            proactiveScore: Number(score.toFixed(3)),
            reason: 'graph_connected',
          });
        }
      }
    }

    for (const item of this.findExpiringCommitments(recalledIds, scope)) {
      this.mergeCandidate(candidates, item);
    }

    if (userProfile) {
      for (const item of this.findProfileMatches(recalledIds, candidates, userProfile, scope)) {
        this.mergeCandidate(candidates, item);
      }
    }

    const items = Array.from(candidates.values())
      .sort((left, right) => right.proactiveScore - left.proactiveScore)
      .slice(0, MAX_PROACTIVE_ITEMS);

    return {
      items,
      total: items.length,
    };
  }

  private mergeCandidate(candidates: Map<string, ProactiveItem>, next: ProactiveItem): void {
    const existing = candidates.get(next.memory.id);
    if (!existing || next.proactiveScore > existing.proactiveScore) {
      candidates.set(next.memory.id, next);
    }
  }

  private recencyScore(memory: MemoryItem): number {
    const updatedAt = new Date(memory.timestamps.updatedAt).getTime();
    if (Number.isNaN(updatedAt)) {
      return 0;
    }

    const daysSince = (Date.now() - updatedAt) / 86_400_000;
    return Math.max(0, 1 - daysSince / 30);
  }

  private findExpiringCommitments(
    excludeIds: Set<string>,
    scope?: Pick<MemoryScope, 'userId' | 'project'>,
  ): ProactiveItem[] {
    try {
      const memories = this.memoryRepo.search({
        types: COMMITMENT_TYPES,
        activeOnly: true,
        archived: false,
        limit: 20,
        scope: this.toSearchScope(scope),
      });
      const now = Date.now();
      const results: ProactiveItem[] = [];

      for (const memory of memories) {
        if (excludeIds.has(memory.id) || memory.state.archived) {
          continue;
        }

        const createdAt = new Date(memory.timestamps.createdAt).getTime();
        if (Number.isNaN(createdAt)) {
          continue;
        }

        const daysSinceCreated = (now - createdAt) / 86_400_000;
        if (daysSinceCreated <= EXPIRY_DAYS_THRESHOLD && memory.scores.importance >= 0.6) {
          results.push({
            memory,
            proactiveScore: Number((0.7 + 0.1 * memory.scores.importance).toFixed(3)),
            reason: 'expiring_commitment',
          });
        }
      }

      return results;
    } catch {
      return [];
    }
  }

  private findProfileMatches(
    excludeIds: Set<string>,
    existingCandidates: Map<string, ProactiveItem>,
    profile: RuntimeUserProfile,
    scope?: Pick<MemoryScope, 'userId' | 'project'>,
  ): ProactiveItem[] {
    if (profile.likelyInterests.length === 0) {
      return [];
    }

    const results = new Map<string, ProactiveItem>();

    for (const interest of profile.likelyInterests.slice(0, 3)) {
      try {
        const memories = this.memoryRepo.search({
          query: interest,
          activeOnly: true,
          archived: false,
          limit: 5,
          scope: this.toSearchScope(scope),
        });

        for (const memory of memories) {
          if (
            excludeIds.has(memory.id)
            || existingCandidates.has(memory.id)
            || memory.state.archived
          ) {
            continue;
          }

          const candidate: ProactiveItem = {
            memory,
            proactiveScore: Number((0.5 + 0.1 * memory.scores.importance).toFixed(3)),
            reason: 'profile_match',
          };
          this.mergeCandidate(results, candidate);
        }
      } catch {
        continue;
      }
    }

    return Array.from(results.values());
  }

  private toSearchScope(
    scope?: Pick<MemoryScope, 'userId' | 'project'>,
  ): Pick<MemoryScope, 'userId' | 'project'> | undefined {
    if (!scope) {
      return undefined;
    }

    const resolvedScope: Pick<MemoryScope, 'userId' | 'project'> = {};
    if (scope.userId) {
      resolvedScope.userId = scope.userId;
    }
    if (scope.project) {
      resolvedScope.project = scope.project;
    }

    return Object.keys(resolvedScope).length > 0 ? resolvedScope : undefined;
  }
}
