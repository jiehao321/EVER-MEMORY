import type { DebugRepository } from '../storage/debugRepo.js';
import type { BehaviorService } from '../core/behavior/service.js';
import type { ExperienceService } from '../core/reflection/experience.js';
import type { ReflectionService } from '../core/reflection/service.js';
import type { MemoryService } from '../core/memory/service.js';
import { processAutoCapture } from '../core/memory/autoCapture.js';
import type { SessionEndInput, SessionEndResult } from '../types.js';
import { clearSessionContext, getInteractionContext } from '../runtime/context.js';

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
  memoryService: MemoryService,
  debugRepo?: DebugRepository,
): SessionEndResult {
  const interaction = getInteractionContext(input.sessionId);
  const experience = experienceService.log({
    sessionId: input.sessionId,
    messageId: input.messageId,
    inputText: input.inputText,
    actionSummary: input.actionSummary,
    outcomeSummary: input.outcomeSummary,
    intent: interaction?.intent,
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

  const autoCapture = processAutoCapture(
    input,
    {
      intent: interaction?.intent,
      experience,
      reflection: reviewedReflection,
    },
    memoryService,
  );

  debugRepo?.log('session_end_processed', input.sessionId, {
    sessionId: input.sessionId,
    scopeUserId: input.scope?.userId,
    scopeChatId: input.scope?.chatId,
    scopeProject: input.scope?.project,
    channel: input.channel,
    experienceId: experience.id,
    reflectionId: reviewedReflection?.id,
    reflected: Boolean(reviewedReflection),
    promotedRules: promotionResult?.promotedRules.length ?? 0,
    autoMemoryGenerated: autoCapture.generated,
    autoMemoryAccepted: autoCapture.accepted,
    autoMemoryRejected: autoCapture.rejected,
    autoMemoryGeneratedByKind: autoCapture.generatedByKind,
    autoMemoryAcceptedByKind: autoCapture.acceptedByKind,
    autoMemoryAcceptedIdsByKind: autoCapture.acceptedIdsByKind,
    projectSummaryGenerated: autoCapture.generatedByKind.project_summary ?? 0,
    projectSummaryAccepted: autoCapture.acceptedByKind.project_summary ?? 0,
  });

  // Clear session context to prevent memory leak
  clearSessionContext(input.sessionId);

  return {
    sessionId: input.sessionId,
    experience,
    reflection: reviewedReflection,
    promotedRules: promotionResult?.promotedRules,
    autoMemory: {
      generated: autoCapture.generated,
      accepted: autoCapture.accepted,
      rejected: autoCapture.rejected,
      storedIds: autoCapture.storedIds,
      rejectedReasons: autoCapture.rejectedReasons,
      generatedByKind: autoCapture.generatedByKind,
      acceptedByKind: autoCapture.acceptedByKind,
    },
    rejectedRules: promotionResult?.rejected,
  };
}
