import type { ClockPort } from '../ports/clock.js';
import type { NarrativeStore } from '../ports/storage.js';
import type { NewButlerInsight } from '../types.js';
import type { InsightProducer } from './registry.js';

export class ContinuityAnalyzer implements InsightProducer {
  readonly kind = 'continuity';

  constructor(
    private readonly narratives: NarrativeStore | undefined,
    private readonly clock: ClockPort,
  ) {}

  produce(scope?: Record<string, unknown>): NewButlerInsight[] {
    if (!this.narratives) {
      return [];
    }
    const activeThreads = this.narratives.findActive(scope);
    const results: NewButlerInsight[] = [];
    const now = this.clock.now();
    for (const thread of activeThreads) {
      if (thread.momentum !== 'stalling' && thread.momentum !== 'blocked') {
        continue;
      }
      const staleDays = (now - Date.parse(thread.updatedAt)) / (24 * 60 * 60 * 1000);
      if (staleDays > 2) {
        const blockers = thread.blockers.length > 0
          ? `Blockers: ${thread.blockers.join(', ')}`
          : 'No blockers recorded.';
        results.push({
          kind: 'continuity',
          scope,
          title: `${thread.momentum === 'blocked' ? 'Blocked' : 'Stalling'} thread: "${thread.theme}"`,
          summary: `Narrative thread "${thread.theme}" has been ${thread.momentum} for ${Math.floor(staleDays)} days. ${blockers}`,
          confidence: 0.7,
          importance: thread.strategicImportance * 0.8,
          freshUntil: new Date(now + 48 * 60 * 60 * 1000).toISOString(),
        });
      }
    }
    return results.slice(0, 3);
  }
}
