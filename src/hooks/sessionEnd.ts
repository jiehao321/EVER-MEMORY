import type { DebugRepository } from '../storage/debugRepo.js';
import type { MemoryRepository } from '../storage/memoryRepo.js';
import type { SemanticRepository } from '../storage/semanticRepo.js';
import type { BehaviorService } from '../core/behavior/service.js';
import type { ProfileProjectionService } from '../core/profile/projection.js';
import type { ExperienceService } from '../core/reflection/experience.js';
import type { ReflectionService } from '../core/reflection/service.js';
import type { MemoryHousekeepingService } from '../core/memory/housekeeping.js';
import type { MemoryService } from '../core/memory/service.js';
import { processAutoCapture } from '../core/memory/autoCapture.js';
import type { AutoCaptureResult } from '../core/memory/autoCapture.js';
import { extractLearningInsights, storeInsights } from '../core/memory/activeLearning.js';
import { autoPromoteRules } from '../core/behavior/autoPromotion.js';
import type { SessionEndInput, SessionEndResult } from '../types.js';
import { clearSessionContext, getInteractionContext } from '../runtime/context.js';
import { withTimeout } from '../util/timeout.js';

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

export async function handleSessionEnd(
  input: SessionEndInput,
  experienceService: ExperienceService,
  reflectionService: ReflectionService,
  behaviorService: BehaviorService,
  memoryService: MemoryService,
  debugRepo?: DebugRepository,
  semanticRepo?: SemanticRepository,
  memoryRepo?: MemoryRepository,
  profileProjection?: ProfileProjectionService,
  housekeepingService?: MemoryHousekeepingService,
): Promise<SessionEndResult> {
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
  const autoPromotionResult = await withTimeout(
    autoPromoteRules(behaviorService),
    5_000,
    'autoPromoteRules',
  ).catch((error: unknown) => {
    debugRepo?.log('session_end_processed', input.sessionId, {
      sessionId: input.sessionId,
      autoPromotionFailed: true,
      error: error instanceof Error ? error.message : String(error),
    });
    return { promoted: 0 };
  });

  const autoCapture = await withTimeout(
    processAutoCapture(
      input,
      {
        intent: interaction?.intent,
        experience,
        reflection: reviewedReflection,
      },
      memoryService,
      semanticRepo,
      memoryRepo,
    ),
    10_000,
    'processAutoCapture',
  ).catch((error: unknown) => {
    debugRepo?.log('session_end_processed', input.sessionId, {
      sessionId: input.sessionId,
      autoCaptureFailed: true,
      error: error instanceof Error ? error.message : String(error),
    });
    return { generated: 0, accepted: 0, rejected: 0, storedIds: [], rejectedReasons: [], generatedByKind: {}, acceptedByKind: {}, acceptedIdsByKind: {} } as AutoCaptureResult;
  });
  const extractedInsights = await withTimeout(
    extractLearningInsights(input, {
      intent: interaction?.intent,
      reflection: reviewedReflection,
    }),
    5_000,
    'extractLearningInsights',
  ).catch(() => []);
  const learningResult = await withTimeout(
    storeInsights(
      extractedInsights,
      input.scope ?? {},
      memoryService,
      semanticRepo,
    ),
    5_000,
    'storeInsights',
  ).catch((error: unknown) => {
    debugRepo?.log('session_end_processed', input.sessionId, {
      sessionId: input.sessionId,
      storeInsightsFailed: true,
      error: error instanceof Error ? error.message : String(error),
    });
    return { storedCount: 0 };
  });
  let profileUpdated = false;
  if (input.scope?.userId && profileProjection) {
    try {
      profileProjection.recomputeForUser(input.scope.userId);
      profileUpdated = true;
    } catch (error) {
      // Profile refresh is best-effort and must never block session teardown.
      debugRepo?.log('profile_recompute_failed', input.sessionId ?? 'unknown', {
        userId: input.scope?.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

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
    autoPromotedRules: autoPromotionResult.promoted,
    learningInsights: learningResult.storedCount,
    autoMemoryGenerated: autoCapture.generated,
    autoMemoryAccepted: autoCapture.accepted,
    autoMemoryRejected: autoCapture.rejected,
    autoMemoryGeneratedByKind: autoCapture.generatedByKind,
    autoMemoryAcceptedByKind: autoCapture.acceptedByKind,
    autoMemoryAcceptedIdsByKind: autoCapture.acceptedIdsByKind,
    autoMemoryRejectedReasons: autoCapture.rejectedReasons,
    projectSummaryGenerated: autoCapture.generatedByKind.project_summary ?? 0,
    projectSummaryAccepted: autoCapture.acceptedByKind.project_summary ?? 0,
    profileUpdated,
  });

  if (housekeepingService && memoryRepo && input.scope && memoryRepo.count({ scope: input.scope }) > 50) {
    const lastRunAt = memoryRepo.search({
      scope: input.scope,
      limit: 1,
    })[0]?.timestamps.updatedAt;
    await withTimeout(
      housekeepingService.runIfNeeded(input.scope, lastRunAt),
      15_000,
      'housekeeping',
    ).catch((error: unknown) => {
      debugRepo?.log('session_end_processed', input.sessionId, {
        sessionId: input.sessionId,
        housekeepingFailed: true,
        housekeepingError: error instanceof Error ? error.message : String(error),
      });
    });
  }

  // Clear session context to prevent memory leak
  clearSessionContext(input.sessionId);

  return {
    sessionId: input.sessionId,
    experience,
    reflection: reviewedReflection,
    promotedRules: promotionResult?.promotedRules,
    learningInsights: learningResult.storedCount,
    autoPromotedRules: autoPromotionResult.promoted,
    profileUpdated,
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
