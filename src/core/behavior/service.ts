import { randomUUID } from 'node:crypto';
import { evaluatePromotionCandidate } from './promotion.js';
import { rankBehaviorRules } from './ranking.js';
import type { DebugRepository } from '../../storage/debugRepo.js';
import type { BehaviorRepository } from '../../storage/behaviorRepo.js';
import type { ReflectionRepository } from '../../storage/reflectionRepo.js';
import type {
  BehaviorRule,
  BehaviorRuleLookupInput,
  PromoteFromReflectionInput,
  PromoteFromReflectionResult,
  ReflectionRecord,
} from '../../types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function withReviewState(reflection: ReflectionRecord, promotedCount: number): ReflectionRecord {
  return {
    ...reflection,
    state: {
      ...reflection.state,
      promoted: reflection.state.promoted || promotedCount > 0,
      rejected: promotedCount === 0,
      reviewedAt: nowIso(),
    },
  };
}

export class BehaviorService {
  constructor(
    private readonly behaviorRepo: BehaviorRepository,
    private readonly reflectionRepo: ReflectionRepository,
    private readonly debugRepo?: DebugRepository,
  ) {}

  promoteFromReflection(input: PromoteFromReflectionInput): PromoteFromReflectionResult {
    const reflection = this.reflectionRepo.findById(input.reflectionId);
    if (!reflection) {
      // Return empty result instead of throwing to prevent session end interruption
      return {
        reflectionId: input.reflectionId,
        promotedRules: [],
        rejected: [],
        error: `Reflection not found: ${input.reflectionId}`,
      };
    }

    const existingRules = this.behaviorRepo.listActiveCandidates({
      userId: input.appliesTo?.userId,
      channel: input.appliesTo?.channel,
      limit: 200,
    });

    const promotedRules: BehaviorRule[] = [];
    const rejected: PromoteFromReflectionResult['rejected'] = [];

    for (const candidate of reflection.candidateRules) {
      const decision = evaluatePromotionCandidate({
        statement: candidate,
        reflection,
        existingRules: [...existingRules, ...promotedRules],
      });

      if (!decision.accepted || !decision.category || !decision.priority) {
        rejected.push({
          statement: decision.statement,
          reason: decision.reason,
        });
        this.debugRepo?.log('rule_rejected', reflection.id, {
          reflectionId: reflection.id,
          statement: decision.statement,
          reason: decision.reason,
        });
        continue;
      }

      const timestamp = nowIso();
      const rule: BehaviorRule = {
        id: randomUUID(),
        statement: decision.statement,
        createdAt: timestamp,
        updatedAt: timestamp,
        appliesTo: {
          userId: input.appliesTo?.userId,
          channel: input.appliesTo?.channel,
          intentTypes: input.appliesTo?.intentTypes ?? [],
          contexts: input.appliesTo?.contexts ?? [],
        },
        category: decision.category,
        priority: decision.priority,
        evidence: {
          reflectionIds: [reflection.id],
          memoryIds: [],
          confidence: reflection.evidence.confidence,
          recurrenceCount: reflection.evidence.recurrenceCount,
        },
        state: {
          active: true,
          deprecated: false,
        },
      };

      this.behaviorRepo.insert(rule);
      promotedRules.push(rule);

      this.debugRepo?.log('rule_promoted', rule.id, {
        reflectionId: reflection.id,
        category: rule.category,
        priority: rule.priority,
        confidence: rule.evidence.confidence,
      });
    }

    this.reflectionRepo.insert(withReviewState(reflection, promotedRules.length));

    return {
      reflectionId: reflection.id,
      promotedRules,
      rejected,
    };
  }

  getActiveRules(input: BehaviorRuleLookupInput = {}): BehaviorRule[] {
    const limit = input.limit ?? 8;
    const candidates = this.behaviorRepo.listActiveCandidates({
      userId: input.scope?.userId,
      channel: input.channel,
      limit: Math.max(60, limit * 5),
    });

    const ranked = rankBehaviorRules(candidates, input);
    return ranked.slice(0, limit).map((item) => item.rule);
  }

  listRecentRules(limit = 20): BehaviorRule[] {
    return this.behaviorRepo.listRecent(limit);
  }

  countActiveRules(userId?: string): number {
    return this.behaviorRepo.countActive(userId);
  }
}
