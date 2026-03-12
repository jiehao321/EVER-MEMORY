import type { DebugRepository } from '../storage/debugRepo.js';
import type { BehaviorService } from '../core/behavior/service.js';
import type { ExperienceService } from '../core/reflection/experience.js';
import type { ReflectionService } from '../core/reflection/service.js';
import type { SessionEndInput, SessionEndResult } from '../types.js';
import { clearSessionContext } from '../runtime/context.js';

function nowIso(): string {
  return new Date().toISOString();
}

function pickTriggerKind(input: SessionEndInput, correction: boolean, repeat: boolean) {
  if (correction) {
    return 'correction' as const;
  }
  if (repeat) {
    return 'repeat-pattern' as const;
  }
  if (input.forceReflect) {
    return 'manual-review' as const;
  }
  return null;
}

export function handleSessionEnd(
  input: SessionEndInput,
  experienceService: ExperienceService,
  reflectionService: ReflectionService,
  behaviorService: BehaviorService,
  debugRepo?: DebugRepository,
): SessionEndResult {
  const experience = experienceService.log({
    sessionId: input.sessionId,
    messageId: input.messageId,
    inputText: input.inputText,
    actionSummary: input.actionSummary,
    outcomeSummary: input.outcomeSummary,
    evidenceRefs: input.evidenceRefs,
  });

  const triggerKind = pickTriggerKind(
    input,
    experience.indicators.userCorrection,
    experience.indicators.repeatMistakeSignal,
  );

  const reflection = triggerKind
    ? reflectionService.reflect({
        triggerKind,
        sessionId: input.sessionId,
        experienceIds: [experience.id],
        mode: 'light',
      }).reflection ?? undefined
    : undefined;
  const promotionResult = reflection
    ? behaviorService.promoteFromReflection({
        reflectionId: reflection.id,
        appliesTo: {
          userId: input.scope?.userId,
        },
      })
    : undefined;
  const reviewedReflection = reflection
    ? {
        ...reflection,
        state: {
          ...reflection.state,
          promoted: reflection.state.promoted || (promotionResult?.promotedRules.length ?? 0) > 0,
          rejected: (promotionResult?.promotedRules.length ?? 0) === 0,
          reviewedAt: promotionResult ? nowIso() : reflection.state.reviewedAt,
        },
      }
    : undefined;

  debugRepo?.log('session_end_processed', input.sessionId, {
    sessionId: input.sessionId,
    experienceId: experience.id,
    reflectionId: reviewedReflection?.id,
    reflected: Boolean(reviewedReflection),
    promotedRules: promotionResult?.promotedRules.length ?? 0,
  });

  // Clear session context to prevent memory leak
  clearSessionContext(input.sessionId);

  return {
    sessionId: input.sessionId,
    experience,
    reflection: reviewedReflection,
    promotedRules: promotionResult?.promotedRules,
    rejectedRules: promotionResult?.rejected,
  };
}
