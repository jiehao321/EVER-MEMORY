import type { ClockPort } from '../ports/clock.js';
import type { MemoryQueryPort } from '../ports/memory.js';
import type { NewButlerInsight } from '../types.js';
import type { InsightProducer } from './registry.js';

export class ThemeExtractor implements InsightProducer {
  readonly kind = 'theme';

  constructor(
    private readonly memory: MemoryQueryPort,
    private readonly clock: ClockPort,
  ) {}

  produce(scope?: Record<string, unknown>): NewButlerInsight[] {
    const memories = this.memory.search({
      scope: scope as { userId?: string; chatId?: string; project?: string } | undefined,
      activeOnly: true,
      archived: false,
      limit: 50,
    });
    const typeCounts = new Map<string, number>();
    for (const memory of memories) {
      typeCounts.set(memory.type, (typeCounts.get(memory.type) ?? 0) + 1);
    }

    const insights: NewButlerInsight[] = [];
    for (const [type, count] of typeCounts) {
      if (count >= 5) {
        insights.push({
          kind: 'theme',
          scope,
          title: `Recurring theme: ${type} (${count} memories)`,
          summary: `Memory type "${type}" appears ${count} times in recent activity, suggesting a recurring focus area.`,
          confidence: Math.min(0.9, 0.5 + count * 0.05),
          importance: Math.min(0.8, 0.4 + count * 0.04),
          freshUntil: new Date(this.clock.now() + 48 * 60 * 60 * 1000).toISOString(),
        });
      }
    }
    return insights;
  }
}
