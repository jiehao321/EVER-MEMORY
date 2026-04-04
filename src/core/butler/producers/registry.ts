import type { InsightStore } from '../ports/storage.js';
import type { ButlerInsight, ButlerLogger, NewButlerInsight } from '../types.js';

export interface InsightProducer {
  readonly kind: string;
  produce(scope?: Record<string, unknown>): NewButlerInsight[];
}

export class InsightProducerRegistry {
  private readonly producers: InsightProducer[] = [];

  constructor(
    private readonly insightStore: InsightStore,
    private readonly logger?: ButlerLogger,
  ) {}

  register(producer: InsightProducer): void {
    this.producers.push(producer);
  }

  runAll(scope?: Record<string, unknown>): ButlerInsight[] {
    const created: ButlerInsight[] = [];
    for (const producer of this.producers) {
      try {
        const insights = producer.produce(scope);
        for (const insight of insights) {
          const id = this.insightStore.insert(insight);
          const stored = this.insightStore.findById(id);
          if (stored) {
            created.push(stored);
          }
        }
      } catch (error) {
        this.logger?.warn(`InsightProducer ${producer.kind} failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return created;
  }

  getProducerCount(): number {
    return this.producers.length;
  }
}
