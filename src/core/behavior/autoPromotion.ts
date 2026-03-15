import type { BehaviorService } from './service.js';

export interface AutoPromotionConfig {
  readonly confidenceThreshold: number;
  readonly evidenceCountMin: number;
  readonly maxPerSession: number;
}

const DEFAULT_CONFIG: AutoPromotionConfig = {
  confidenceThreshold: 0.85,
  evidenceCountMin: 2,
  maxPerSession: 3,
};

export async function autoPromoteRules(
  behaviorService: BehaviorService,
  config: Partial<AutoPromotionConfig> = {},
): Promise<{ promoted: number; skipped: number }> {
  if (typeof (behaviorService as Partial<BehaviorService>).listPendingReflections !== 'function'
    || typeof behaviorService.promoteFromReflection !== 'function') {
    return { promoted: 0, skipped: 0 };
  }
  const resolved = { ...DEFAULT_CONFIG, ...config };
  const candidates = behaviorService.listPendingReflections(resolved.maxPerSession * 4);
  let promoted = 0;
  let skipped = 0;

  for (const reflection of candidates) {
    if (promoted >= resolved.maxPerSession) {
      skipped += 1;
      continue;
    }
    if (reflection.evidence.confidence < resolved.confidenceThreshold
      || reflection.evidence.recurrenceCount < resolved.evidenceCountMin
      || reflection.candidateRules.length === 0) {
      skipped += 1;
      continue;
    }

    const result = behaviorService.promoteFromReflection({
      reflectionId: reflection.id,
      tags: ['auto_promoted'],
    });
    if (result.promotedRules.length > 0) {
      const newCount = result.promotedRules.length;
      const remainingBudget = resolved.maxPerSession - promoted;
      const countToAdd = Math.min(newCount, remainingBudget);
      promoted += countToAdd;
      skipped += newCount - countToAdd;
      if (promoted >= resolved.maxPerSession) {
        break;
      }
    } else {
      skipped += 1;
    }
  }

  return { promoted, skipped };
}
