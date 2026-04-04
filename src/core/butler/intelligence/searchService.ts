import type { ClockPort } from '../ports/clock.js';
import type { HostPort } from '../ports/host.js';
import type { MemoryQueryPort, MemorySearchQuery } from '../ports/memory.js';
import type { ButlerLogger } from '../types.js';
import type { SearchResult } from './types.js';

export class KnowledgeSearchService {
  constructor(
    private readonly host: HostPort,
    private readonly memory: MemoryQueryPort,
    private readonly clock: ClockPort,
    private readonly logger?: ButlerLogger,
  ) {}

  async search(query: string, context?: { scope?: Record<string, unknown> }): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const memories = this.memory.search({
      scope: context?.scope as MemorySearchQuery['scope'],
      query,
      activeOnly: true,
      archived: false,
      limit: 10,
    });
    for (const memory of memories) {
      results.push({
        content: memory.content,
        source: 'memory',
        relevance: memory.scores.importance,
      });
    }
    if (this.host.searchKnowledge) {
      try {
        results.push(...await this.host.searchKnowledge(query));
      } catch (error) {
        this.logger?.warn('KnowledgeSearchService external search failed', {
          at: this.clock.isoNow(),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return results.sort((a, b) => b.relevance - a.relevance);
  }
}
