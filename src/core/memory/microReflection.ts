import { randomUUID } from 'node:crypto';
import type { FeedbackRepository } from '../../storage/feedbackRepo.js';
import type { RetrievalFactor, RetrievalFeedback } from '../../types/feedback.js';
import type { RecallResult } from '../../types/memory.js';

interface RecallHistoryEntry {
  memoryId: string;
  query: string;
  strategy: string;
  rank: number;
  score: number;
  markedUsed: boolean;
  content: string;
  topFactors: RetrievalFactor[];
}

function extractKeywords(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2),
  );
}

function keywordOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const word of a) {
    if (b.has(word)) {
      overlap += 1;
    }
  }

  return overlap / Math.min(a.size, b.size);
}

function nowIso(): string {
  return new Date().toISOString();
}

export class MicroReflectionService {
  // In-memory session tracking (not persisted across restarts)
  private sessionRecallHistory: Map<string, RecallHistoryEntry[]> = new Map();

  constructor(private readonly feedbackRepo: FeedbackRepository) {}

  /**
   * Record recall results for a session.
   * Called after each recall in messageReceived.
   */
  recordRecall(sessionId: string, query: string, result: RecallResult): void {
    const existingEntries = this.sessionRecallHistory.get(sessionId) ?? [];
    const entriesByMemoryId = new Map(existingEntries.map((entry) => [entry.memoryId, entry]));

    result.items.forEach((item, index) => {
      const existingEntry = entriesByMemoryId.get(item.id);
      if (existingEntry) {
        existingEntry.query = query;
        existingEntry.strategy = result.strategyUsed ?? 'unknown';
        existingEntry.rank = index + 1;
        existingEntry.score = item.metadata?.semanticScore ?? 0;
        existingEntry.content = item.content;
        existingEntry.topFactors = item.metadata?.topFactors ?? [];
        return;
      }

      const entry: RecallHistoryEntry = {
        memoryId: item.id,
        query,
        strategy: result.strategyUsed ?? 'unknown',
        rank: index + 1,
        score: item.metadata?.semanticScore ?? 0,
        markedUsed: false,
        content: item.content,
        topFactors: item.metadata?.topFactors ?? [],
      };

      existingEntries.push(entry);
      entriesByMemoryId.set(item.id, entry);

      const feedback: RetrievalFeedback = {
        id: randomUUID(),
        sessionId,
        memoryId: item.id,
        query,
        strategy: entry.strategy,
        recallRank: entry.rank,
        score: entry.score,
        signal: 'unknown',
        // The current schema requires a source even before a real signal is known.
        signalSource: 'explicit',
        createdAt: nowIso(),
        topFactors: entry.topFactors,
      };
      this.feedbackRepo.insert(feedback);
    });

    this.sessionRecallHistory.set(sessionId, existingEntries);
  }

  /**
   * Check if a store operation references any recalled memories.
   * Called from tools/store.ts after storing.
   * Uses simple keyword overlap between new content and recalled memory content.
   */
  checkStoreReference(sessionId: string, storedContent: string): number {
    const entries = this.sessionRecallHistory.get(sessionId);
    if (!entries || entries.length === 0) {
      return 0;
    }

    const storedKeywords = extractKeywords(storedContent);
    let markedCount = 0;

    for (const entry of entries) {
      if (entry.markedUsed) {
        continue;
      }

      const overlap = keywordOverlap(extractKeywords(entry.content), storedKeywords);
      if (overlap <= 0.3) {
        continue;
      }

      entry.markedUsed = true;
      this.feedbackRepo.updateSignalBySessionMemory(
        sessionId,
        entry.memoryId,
        'used',
        'store_reference',
      );
      markedCount += 1;
    }

    return markedCount;
  }

  /**
   * Check if an edit operation references recalled memories.
   * Called from tools/edit.ts.
   */
  checkEditReference(sessionId: string, editedMemoryId: string): number {
    const entries = this.sessionRecallHistory.get(sessionId);
    if (!entries || entries.length === 0) {
      return 0;
    }

    let markedCount = 0;
    for (const entry of entries) {
      if (entry.markedUsed || entry.memoryId !== editedMemoryId) {
        continue;
      }

      entry.markedUsed = true;
      this.feedbackRepo.updateSignalBySessionMemory(
        sessionId,
        entry.memoryId,
        'used',
        'edit_reference',
      );
      markedCount += 1;
    }

    return markedCount;
  }

  /**
   * Mark all remaining unknown entries as 'ignored' at session end.
   * Called from hooks/sessionEnd.ts.
   */
  finalizeSession(sessionId: string): { used: number; ignored: number } {
    const entries = this.sessionRecallHistory.get(sessionId) ?? [];
    let used = 0;
    let ignored = 0;

    for (const entry of entries) {
      if (entry.markedUsed) {
        used += 1;
        continue;
      }

      this.feedbackRepo.updateSignalBySessionMemory(
        sessionId,
        entry.memoryId,
        'ignored',
        'session_end_implicit',
      );
      ignored += 1;
    }

    this.sessionRecallHistory.delete(sessionId);
    return { used, ignored };
  }

  /**
   * Get current session stats (for debug/status).
   */
  getSessionStats(sessionId: string): { total: number; used: number; unknown: number } {
    const entries = this.sessionRecallHistory.get(sessionId) ?? [];
    const used = entries.filter((entry) => entry.markedUsed).length;
    return { total: entries.length, used, unknown: entries.length - used };
  }
}
