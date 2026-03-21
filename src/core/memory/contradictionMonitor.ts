import type { RelationRepository } from '../../storage/relationRepo.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { DebugRepository } from '../../storage/debugRepo.js';
import type { MemoryItem } from '../../types/memory.js';
import type { ContradictionAlert, MemoryAlert } from '../../types/alert.js';

export class ContradictionMonitor {
  // In-memory queue of pending alerts per session
  private pendingAlerts: Map<string, MemoryAlert[]> = new Map();

  constructor(
    private readonly relationRepo: RelationRepository,
    private readonly memoryRepo: MemoryRepository,
    private readonly debugRepo?: DebugRepository,
  ) {}

  /**
   * Check a newly stored memory for contradictions.
   * Called after relation detection in store flow.
   * If contradictions found, queues alerts.
   */
  checkForContradictions(sessionId: string, memory: MemoryItem): ContradictionAlert[] {
    // Get all 'contradicts' relations for this memory
    const relations = this.relationRepo.findByMemory(memory.id)
      .filter((r) => r.relationType === 'contradicts' && r.active);

    if (relations.length === 0) {
      return [];
    }

    const alerts: ContradictionAlert[] = [];

    for (const rel of relations) {
      const otherId = rel.sourceId === memory.id ? rel.targetId : rel.sourceId;
      const other = this.memoryRepo.findById(otherId);
      if (!other || !other.state.active) {
        continue;
      }

      const alert: ContradictionAlert = {
        type: 'contradiction',
        memoryA: { id: memory.id, content: memory.content, updatedAt: memory.timestamps.updatedAt },
        memoryB: { id: other.id, content: other.content, updatedAt: other.timestamps.updatedAt },
        conflictScore: rel.confidence,
        suggestion: this.suggestResolution(memory, other, rel.confidence),
      };
      alerts.push(alert);
    }

    if (alerts.length > 0) {
      // Add 'contradiction_pending' tag to the memory (via memoryRepo)
      if (!memory.tags.includes('contradiction_pending')) {
        this.memoryRepo.update({
          ...memory,
          tags: [...memory.tags, 'contradiction_pending'],
        });
      }

      // Queue alerts for the session
      const existing = this.pendingAlerts.get(sessionId) ?? [];
      this.pendingAlerts.set(sessionId, [...existing, ...alerts]);

      this.debugRepo?.log('relation_detected', memory.id, {
        event: 'contradiction_alert',
        contradictions: alerts.length,
        sessionId,
      });
    }

    return alerts;
  }

  /**
   * Drain pending alerts for a session.
   * Called from messageReceived to push alerts to the agent.
   */
  drainAlerts(sessionId: string): MemoryAlert[] {
    const alerts = this.pendingAlerts.get(sessionId) ?? [];
    this.pendingAlerts.delete(sessionId);
    return alerts;
  }

  /**
   * Check if there are pending alerts for a session.
   */
  hasPendingAlerts(sessionId: string): boolean {
    return (this.pendingAlerts.get(sessionId)?.length ?? 0) > 0;
  }

  private suggestResolution(
    newer: MemoryItem,
    older: MemoryItem,
    conflictScore: number,
  ): ContradictionAlert['suggestion'] {
    // High conflict with clear temporal ordering -> suggest keep_newer
    if (conflictScore > 0.8 && newer.timestamps.createdAt > older.timestamps.createdAt) {
      return 'keep_newer';
    }
    // Moderate conflict -> keep both but flag
    if (conflictScore > 0.5) {
      return 'keep_both';
    }
    // Low confidence -> ask user
    return 'ask_user';
  }
}
