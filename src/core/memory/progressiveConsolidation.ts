import type { CompressionResult, MemoryCompressionService } from './compression.js';
import type { DebugRepository } from '../../storage/debugRepo.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';

const PROGRESSIVE_INTERVAL = 5; // every 5 messages
const PROGRESSIVE_MIN_MEMORIES = 100; // only when >100 active memories

type CountableMemoryRepository = MemoryRepository & {
  countActive?: () => number;
  count?: (filters?: { activeOnly?: boolean; archived?: boolean }) => number;
};

export class ProgressiveConsolidationService {
  private messageCounter: Map<string, number> = new Map();

  constructor(
    private readonly compressionService: MemoryCompressionService,
    private readonly memoryRepo: MemoryRepository,
    private readonly debugRepo?: DebugRepository,
  ) {}

  /**
   * Called on each messageReceived. Increments counter.
   * Returns true if consolidation was triggered.
   */
  onMessage(sessionId: string): { triggered: boolean; result?: CompressionResult } {
    const count = (this.messageCounter.get(sessionId) ?? 0) + 1;
    this.messageCounter.set(sessionId, count);

    if (count % PROGRESSIVE_INTERVAL !== 0) {
      return { triggered: false };
    }

    // Check if enough active memories to justify consolidation
    const activeCount = (this.memoryRepo as CountableMemoryRepository).countActive?.() ?? this.estimateActiveCount();
    if (activeCount < PROGRESSIVE_MIN_MEMORIES) {
      return { triggered: false };
    }

    try {
      const result = this.compressionService.compress({
        maxClusters: 1, // Light mode - only 1 cluster per run
        minClusterSize: 3,
      });
      return { triggered: true, result };
    } catch (error) {
      this.debugRepo?.log('progressive_consolidation_error', sessionId, {
        error: error instanceof Error ? error.message : String(error),
      });
      return { triggered: false };
    }
  }

  /** Reset counter for a session (on session end) */
  resetSession(sessionId: string): void {
    this.messageCounter.delete(sessionId);
  }

  private estimateActiveCount(): number {
    const repo = this.memoryRepo as CountableMemoryRepository;
    return repo.countActive?.() ?? repo.count?.({ activeOnly: true, archived: false }) ?? 0;
  }
}
