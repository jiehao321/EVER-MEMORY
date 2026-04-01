import type { DebugRepository } from '../storage/debugRepo.js';
import type { MemoryRepository } from '../storage/memoryRepo.js';
import type { SemanticRepository } from '../storage/semanticRepo.js';
import type { BehaviorService } from '../core/behavior/service.js';
import type { ProfileProjectionService } from '../core/profile/projection.js';
import type { ExperienceService } from '../core/reflection/experience.js';
import type { ReflectionService } from '../core/reflection/service.js';
import type { MemoryHousekeepingService } from '../core/memory/housekeeping.js';
import type { PredictiveContextService } from '../core/memory/predictiveContext.js';
import type { ProgressiveConsolidationService } from '../core/memory/progressiveConsolidation.js';
import type { ContradictionMonitor } from '../core/memory/contradictionMonitor.js';
import type { MemoryService } from '../core/memory/service.js';
import type { RelationDetectionService } from '../core/memory/relationDetection.js';
import type { SelfTuningDecayService } from '../core/memory/selfTuningDecay.js';
import type { DriftDetectionService } from '../core/profile/driftDetection.js';
import { processAutoCapture } from '../core/memory/autoCapture.js';
import type { AutoCaptureResult } from '../core/memory/autoCapture.js';
import { extractLearningInsights, storeInsights } from '../core/memory/activeLearning.js';
import { autoPromoteRules } from '../core/behavior/autoPromotion.js';
import { sanitizeContent } from '../core/policy/sanitize.js';
import type { SessionEndInput, SessionEndResult } from '../types.js';
import { clearSessionContext, getInteractionContext } from '../runtime/context.js';
import { withTimeout } from '../util/timeout.js';
import { nowIso } from '../util/time.js';
import type { ProfileRepository } from '../storage/profileRepo.js';

const SESSION_END_TOTAL_BUDGET_MS = 60_000;

export interface SessionEndContext {
  experienceService: ExperienceService;
  reflectionService: ReflectionService;
  behaviorService: BehaviorService;
  memoryService: MemoryService;
  debugRepo?: DebugRepository;
  semanticRepo?: SemanticRepository;
  memoryRepo?: MemoryRepository;
  profileProjection?: ProfileProjectionService;
  housekeepingService?: MemoryHousekeepingService;
  profileRepo?: ProfileRepository;
  selfTuningDecayService?: SelfTuningDecayService;
  driftDetectionService?: DriftDetectionService;
  progressiveConsolidationService?: ProgressiveConsolidationService;
  predictiveContextService?: PredictiveContextService;
  contradictionMonitor?: ContradictionMonitor;
  relationDetectionService?: RelationDetectionService;
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

function sanitizeOptionalText(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }
  const cleaned = sanitizeContent(value).cleaned;
  return cleaned || undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('timed out');
}

export async function handleSessionEnd(
  input: SessionEndInput,
  ctx: SessionEndContext,
): Promise<SessionEndResult> {
  const deadline = Date.now() + SESSION_END_TOTAL_BUDGET_MS;
  function budgetRemaining(): number {
    return Math.max(0, deadline - Date.now());
  }
  function hasBudget(minMs = 1_000): boolean {
    return budgetRemaining() >= minMs;
  }

  const sanitizedInput: SessionEndInput = {
    ...input,
    inputText: sanitizeOptionalText(input.inputText),
    actionSummary: sanitizeOptionalText(input.actionSummary),
    outcomeSummary: sanitizeOptionalText(input.outcomeSummary),
  };
  const interaction = getInteractionContext(input.sessionId);
  const experience = ctx.experienceService.log({
    sessionId: sanitizedInput.sessionId,
    messageId: sanitizedInput.messageId,
    inputText: sanitizedInput.inputText,
    actionSummary: sanitizedInput.actionSummary,
    outcomeSummary: sanitizedInput.outcomeSummary,
    intent: interaction?.intent,
    evidenceRefs: sanitizedInput.evidenceRefs,
  });

  const triggerKind = pickTriggerKind(
    sanitizedInput,
    experience.indicators.userCorrection,
    experience.indicators.repeatMistakeSignal,
  );

  const reflectionOutput = triggerKind
    ? await withTimeout(
      Promise.resolve(ctx.reflectionService.reflect({
        triggerKind,
        sessionId: input.sessionId,
        experienceIds: [experience.id],
        mode: 'light',
      })),
      10_000,
      'reflection',
    ).catch((error: unknown) => {
      ctx.debugRepo?.log('reflection_timeout', input.sessionId, {
        error: error instanceof Error ? error.message : String(error),
      });
      return { reflection: undefined };
    })
    : { reflection: undefined };
  const reflection = reflectionOutput?.reflection ?? undefined;
  const promotionResult = reflection
    ? ctx.behaviorService.promoteFromReflection({
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
    autoPromoteRules(ctx.behaviorService),
    5_000,
    'autoPromoteRules',
  ).catch((error: unknown) => {
    ctx.debugRepo?.log('session_end_processed', input.sessionId, {
      sessionId: input.sessionId,
      autoPromotionFailed: true,
      error: error instanceof Error ? error.message : String(error),
    });
    return { promoted: 0 };
  });
  // RC4: Demote stale emerging rules (applyCount=0 after EMERGING_AUTO_DEMOTE_DAYS days)
  const staleDemoted = ctx.behaviorService.demoteStaleEmergingRules();

  const expiredEphemeralRules = ctx.behaviorService.freezeRulesByDuration({
    duration: 'ephemeral',
    reason: 'session_expired',
    userId: input.scope?.userId,
    channel: input.channel,
  });

  const emptyAutoCaptureResult: AutoCaptureResult = {
    generated: 0,
    accepted: 0,
    rejected: 0,
    storedIds: [],
    rejectedReasons: [],
    generatedByKind: {},
    acceptedByKind: {},
    acceptedIdsByKind: {},
  };
  const autoCapture = hasBudget(2_000)
    ? await withTimeout(
      processAutoCapture(
        sanitizedInput,
        {
          intent: interaction?.intent,
          experience,
          reflection: reviewedReflection,
        },
        ctx.memoryService,
        ctx.profileProjection,
        ctx.semanticRepo,
        ctx.memoryRepo,
      ),
      10_000,
      'processAutoCapture',
    ).catch((error: unknown) => {
      ctx.debugRepo?.log('session_end_processed', input.sessionId, {
        sessionId: input.sessionId,
        autoCaptureFailed: true,
        error: error instanceof Error ? error.message : String(error),
      });
      return emptyAutoCaptureResult;
    })
    : (() => {
      ctx.debugRepo?.log('session_end_budget_skip', input.sessionId, {
        skipped: 'processAutoCapture',
        budgetRemainingMs: budgetRemaining(),
      });
      return emptyAutoCaptureResult;
    })();
  const extractedInsights = hasBudget(1_000)
    ? await withTimeout(
      extractLearningInsights(sanitizedInput, {
        intent: interaction?.intent,
        reflection: reviewedReflection,
      }),
      5_000,
      'extractLearningInsights',
    ).catch(() => [])
    : (() => {
      ctx.debugRepo?.log('session_end_budget_skip', input.sessionId, {
        skipped: 'extractLearningInsights',
        budgetRemainingMs: budgetRemaining(),
      });
      return [];
    })();
  const learningResult = hasBudget(1_000)
    ? await withTimeout(
      storeInsights(
        extractedInsights,
        sanitizedInput.scope ?? {},
        ctx.memoryService,
        ctx.semanticRepo,
      ),
      5_000,
      'storeInsights',
    ).catch((error: unknown) => {
      ctx.debugRepo?.log('session_end_processed', input.sessionId, {
        sessionId: input.sessionId,
        storeInsightsFailed: true,
        error: error instanceof Error ? error.message : String(error),
      });
      return { storedCount: 0 };
    })
    : (() => {
      ctx.debugRepo?.log('session_end_budget_skip', input.sessionId, {
        skipped: 'storeInsights',
        budgetRemainingMs: budgetRemaining(),
      });
      return { storedCount: 0 };
    })();
  let profileUpdated = false;
  let previousProfile = input.scope?.userId && ctx.profileRepo
    ? ctx.profileRepo.getByUserId(input.scope.userId)
    : null;
  if (input.scope?.userId && ctx.profileProjection) {
    if (!hasBudget(1_000)) {
      ctx.debugRepo?.log('session_end_budget_skip', input.sessionId, {
        skipped: 'profileProjection',
        budgetRemainingMs: budgetRemaining(),
      });
    } else {
    try {
      const nextProfile = await withTimeout(
        Promise.resolve(ctx.profileProjection.recomputeForUser(input.scope.userId)),
        3_000,
        'recomputeForUser',
      );
      profileUpdated = true;
      if (ctx.driftDetectionService && nextProfile) {
        try {
          ctx.driftDetectionService.detectDrift(previousProfile, nextProfile, input.scope.userId);
        } catch {
          // Best-effort drift detection must not block session teardown
        }
      }
    } catch (error) {
      // Profile refresh is best-effort and must never block session teardown.
      ctx.debugRepo?.log('profile_recompute_failed', input.sessionId ?? 'unknown', {
        userId: input.scope?.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    }
  }

  ctx.debugRepo?.log('session_end_processed', input.sessionId, {
    sessionId: input.sessionId,
    scopeUserId: input.scope?.userId,
    scopeChatId: input.scope?.chatId,
    scopeProject: input.scope?.project,
    channel: input.channel,
    experienceId: experience.id,
    reflectionId: reviewedReflection?.id,
    reflected: Boolean(reviewedReflection),
    promotedRules: promotionResult?.promotedRules.length ?? 0,
    expiredEphemeralRules: expiredEphemeralRules.length,
    autoPromotedRules: autoPromotionResult.promoted,
    staleDemotedRules: staleDemoted,
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

  if (ctx.housekeepingService && ctx.memoryRepo && input.scope && ctx.memoryRepo.count({ scope: input.scope }) > 50) {
    if (!hasBudget(2_000)) {
      ctx.debugRepo?.log('session_end_budget_skip', input.sessionId, {
        skipped: 'housekeeping',
        budgetRemainingMs: budgetRemaining(),
      });
    } else {
      const lastRunAt = ctx.memoryRepo.search({
        scope: input.scope,
        limit: 1,
      })[0]?.timestamps.updatedAt;
      try {
        await withTimeout(
          ctx.housekeepingService.runIfNeeded(input.scope, lastRunAt),
          8_000,
          'housekeeping',
        );
      } catch (error) {
        ctx.debugRepo?.log('housekeeping_error', input.sessionId, {
          sessionId: input.sessionId,
          reason: isTimeoutError(error) ? 'timeout' : 'failed',
          error: getErrorMessage(error),
        });
      }
    }
  }

  if (ctx.selfTuningDecayService?.shouldRecompute()) {
    try {
      ctx.selfTuningDecayService.recompute();
    } catch {
      // Best-effort tuning must not block session teardown
    }
  }

  if (ctx.progressiveConsolidationService) {
    try {
      ctx.progressiveConsolidationService.resetSession(input.sessionId);
    } catch {
      // Best-effort cleanup must not block session teardown
    }
  }

  if (ctx.predictiveContextService) {
    try {
      ctx.predictiveContextService.clearCache(input.sessionId);
    } catch {
      // Best-effort cleanup must not block session teardown
    }
  }

  if (ctx.contradictionMonitor) {
    try {
      ctx.contradictionMonitor.clearSession(input.sessionId);
    } catch {
      // Best-effort cleanup must not block session teardown
    }
  }

  if (ctx.relationDetectionService && ctx.memoryRepo) {
    let memoriesScanned = 0;
    let relationsDiscovered = 0;
    let timedOut = false;

    if (!hasBudget(1_000)) {
      ctx.debugRepo?.log('session_end_budget_skip', input.sessionId, {
        skipped: 'relationDiscovery',
        budgetRemainingMs: budgetRemaining(),
      });
    } else {
      try {
        await withTimeout((async () => {
          const recentMemories = ctx.memoryRepo!.search({
            scope: input.scope,
            activeOnly: true,
            archived: false,
            limit: 50,
          });

          memoriesScanned = recentMemories.length;
          for (const memory of recentMemories) {
            const result = await ctx.relationDetectionService!.detectRelations(memory);
            relationsDiscovered += result.detected + result.inferred;
          }
        })(), 2_000, 'offlineRelationDiscovery');
      } catch {
        timedOut = true;
      }
    }

    ctx.debugRepo?.log('offline_relation_discovery', input.sessionId, {
      sessionId: input.sessionId,
      memoriesScanned,
      relationsDiscovered,
      timedOut,
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
    staleDemotedRules: staleDemoted,
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
