import type { ClockPort } from '../ports/clock.js';
import type { MemoryQueryPort } from '../ports/memory.js';
import type { NewButlerInsight } from '../types.js';
import type { InsightProducer } from './registry.js';

export class AnomalyDetector implements InsightProducer {
  readonly kind = 'anomaly';

  constructor(
    private readonly memory: MemoryQueryPort,
    private readonly clock: ClockPort,
  ) {}

  produce(scope?: Record<string, unknown>): NewButlerInsight[] {
    const memories = this.memory.search({
      scope: scope as { userId?: string; chatId?: string; project?: string } | undefined,
      activeOnly: true,
      archived: false,
      limit: 100,
    });
    const insights: NewButlerInsight[] = [];
    for (const memory of memories) {
      if (memory.scores.importance >= 0.7 && memory.scores.confidence < 0.3) {
        insights.push({
          kind: 'anomaly',
          scope,
          title: `Low-confidence critical memory: "${memory.content.slice(0, 50)}..."`,
          summary: `Memory has importance=${memory.scores.importance.toFixed(2)} but confidence=${memory.scores.confidence.toFixed(2)}. Consider verifying.`,
          confidence: 0.6,
          importance: 0.7,
          freshUntil: new Date(this.clock.now() + 72 * 60 * 60 * 1000).toISOString(),
          sourceRefs: [memory.id],
        });
      }
    }
    return insights.slice(0, 3);
  }
}
