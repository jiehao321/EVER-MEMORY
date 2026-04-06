import type { ClockPort } from '../ports/clock.js';
import type { MemoryQueryPort, MemorySearchQuery } from '../ports/memory.js';
import type { GoalStore, InsightStore } from '../ports/storage.js';
import type { KnowledgeGap } from './types.js';

const STALE_MEMORY_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000;
const INCOMPLETE_COMMITMENT_THRESHOLD_DAYS = 7;

export class KnowledgeGapDetector {
  constructor(
    private readonly memory: MemoryQueryPort,
    private readonly insights: InsightStore,
    private readonly goals: GoalStore | undefined,
    private readonly clock: ClockPort,
  ) {}

  detectGaps(scope?: Record<string, unknown>): KnowledgeGap[] {
    return [
      ...this.detectStaleMemories(scope),
      ...this.detectIncompleteCommitments(scope),
      ...this.detectUnresolvedContradictions(scope),
    ].sort((a, b) => b.importance - a.importance);
  }

  detectStaleMemories(scope?: Record<string, unknown>): KnowledgeGap[] {
    const gaps: KnowledgeGap[] = [];
    const memories = this.memory.search({
      scope: scope as MemorySearchQuery['scope'],
      activeOnly: true,
      archived: false,
      limit: 50,
    });
    const now = this.clock.now();
    for (const memory of memories) {
      const updatedMs = Date.parse(memory.timestamps.updatedAt);
      const isStale = !Number.isNaN(updatedMs) && now - updatedMs > STALE_MEMORY_THRESHOLD_MS;
      if (!isStale || memory.scores.importance < 0.6) {
        continue;
      }
      gaps.push({
        type: 'stale',
        description: `High-importance memory "${memory.content.slice(0, 60)}..." not updated for ${Math.floor((now - updatedMs) / (24 * 60 * 60 * 1000))} days`,
        suggestedQuestion: `Is this still accurate: "${memory.content.slice(0, 80)}"?`,
        importance: memory.scores.importance * 0.8,
        memoryIds: [memory.id],
      });
    }
    return gaps;
  }

  detectIncompleteCommitments(_scope?: Record<string, unknown>): KnowledgeGap[] {
    const gaps: KnowledgeGap[] = [];
    const commitments = this.insights.findByKind('commitment', 20);
    for (const insight of commitments) {
      if (insight.importance < 0.5) {
        continue;
      }
      const ageDays = (this.clock.now() - Date.parse(insight.createdAt)) / (24 * 60 * 60 * 1000);
      if (ageDays <= INCOMPLETE_COMMITMENT_THRESHOLD_DAYS) {
        continue;
      }
      gaps.push({
        type: 'incomplete',
        description: `Commitment "${insight.title}" unresolved for ${Math.floor(ageDays)} days`,
        suggestedQuestion: `What's the status of: "${insight.title}"?`,
        importance: insight.importance * 0.7,
      });
    }
    return gaps;
  }

  detectUnresolvedContradictions(scope?: Record<string, unknown>): KnowledgeGap[] {
    const gaps: KnowledgeGap[] = [];
    const contradictions = this.memory.search({
      scope: scope as MemorySearchQuery['scope'],
      query: 'contradiction_pending',
      activeOnly: true,
      archived: false,
      limit: 10,
    });
    for (const memory of contradictions) {
      if (!memory.tags.includes('contradiction_pending')) {
        continue;
      }
      gaps.push({
        type: 'unresolved_contradiction',
        description: `Contradiction pending on memory: "${memory.content.slice(0, 60)}..."`,
        suggestedQuestion: `Can you clarify this contradiction: "${memory.content.slice(0, 80)}"?`,
        importance: 0.8,
        memoryIds: [memory.id],
      });
    }
    return gaps;
  }
}
