import { processAutoCapture } from '../core/memory/autoCapture.js';
import { extractLearningInsights, storeInsights } from '../core/memory/activeLearning.js';
import { autoPromoteRules } from '../core/behavior/autoPromotion.js';
import { sanitizeContent } from '../core/policy/sanitize.js';
import { clearSessionContext, getInteractionContext } from '../runtime/context.js';
import { withTimeout } from '../util/timeout.js';
function nowIso() {
    return new Date().toISOString();
}
function pickTriggerKind(input, correction, repeat) {
    if (correction) {
        return 'correction';
    }
    if (repeat) {
        return 'repeat-pattern';
    }
    if (input.forceReflect) {
        return 'manual-review';
    }
    return null;
}
function sanitizeOptionalText(value) {
    if (!value) {
        return value;
    }
    const cleaned = sanitizeContent(value).cleaned;
    return cleaned || undefined;
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function isTimeoutError(error) {
    return error instanceof Error && error.message.includes('timed out');
}
export async function handleSessionEnd(input, experienceService, reflectionService, behaviorService, memoryService, debugRepo, semanticRepo, memoryRepo, profileProjection, housekeepingService) {
    const sanitizedInput = {
        ...input,
        inputText: sanitizeOptionalText(input.inputText),
        actionSummary: sanitizeOptionalText(input.actionSummary),
        outcomeSummary: sanitizeOptionalText(input.outcomeSummary),
    };
    const interaction = getInteractionContext(input.sessionId);
    const experience = experienceService.log({
        sessionId: sanitizedInput.sessionId,
        messageId: sanitizedInput.messageId,
        inputText: sanitizedInput.inputText,
        actionSummary: sanitizedInput.actionSummary,
        outcomeSummary: sanitizedInput.outcomeSummary,
        intent: interaction?.intent,
        evidenceRefs: sanitizedInput.evidenceRefs,
    });
    const triggerKind = pickTriggerKind(sanitizedInput, experience.indicators.userCorrection, experience.indicators.repeatMistakeSignal);
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
    const autoPromotionResult = await withTimeout(autoPromoteRules(behaviorService), 5_000, 'autoPromoteRules').catch((error) => {
        debugRepo?.log('session_end_processed', input.sessionId, {
            sessionId: input.sessionId,
            autoPromotionFailed: true,
            error: error instanceof Error ? error.message : String(error),
        });
        return { promoted: 0 };
    });
    // RC4: Demote stale emerging rules (applyCount=0 after EMERGING_AUTO_DEMOTE_DAYS days)
    const staleDemoted = behaviorService.demoteStaleEmergingRules();
    const expiredEphemeralRules = behaviorService.freezeRulesByDuration({
        duration: 'ephemeral',
        reason: 'session_expired',
        userId: input.scope?.userId,
        channel: input.channel,
    });
    const autoCapture = await withTimeout(processAutoCapture(sanitizedInput, {
        intent: interaction?.intent,
        experience,
        reflection: reviewedReflection,
    }, memoryService, profileProjection, semanticRepo, memoryRepo), 10_000, 'processAutoCapture').catch((error) => {
        debugRepo?.log('session_end_processed', input.sessionId, {
            sessionId: input.sessionId,
            autoCaptureFailed: true,
            error: error instanceof Error ? error.message : String(error),
        });
        return { generated: 0, accepted: 0, rejected: 0, storedIds: [], rejectedReasons: [], generatedByKind: {}, acceptedByKind: {}, acceptedIdsByKind: {} };
    });
    const extractedInsights = await withTimeout(extractLearningInsights(sanitizedInput, {
        intent: interaction?.intent,
        reflection: reviewedReflection,
    }), 5_000, 'extractLearningInsights').catch(() => []);
    const learningResult = await withTimeout(storeInsights(extractedInsights, sanitizedInput.scope ?? {}, memoryService, semanticRepo), 5_000, 'storeInsights').catch((error) => {
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
            await withTimeout(Promise.resolve(profileProjection.recomputeForUser(input.scope.userId)), 3_000, 'recomputeForUser');
            profileUpdated = true;
        }
        catch (error) {
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
    if (housekeepingService && memoryRepo && input.scope && memoryRepo.count({ scope: input.scope }) > 50) {
        const lastRunAt = memoryRepo.search({
            scope: input.scope,
            limit: 1,
        })[0]?.timestamps.updatedAt;
        try {
            await withTimeout(housekeepingService.runIfNeeded(input.scope, lastRunAt), 8_000, 'housekeeping');
        }
        catch (error) {
            debugRepo?.log('housekeeping_error', input.sessionId, {
                sessionId: input.sessionId,
                reason: isTimeoutError(error) ? 'timeout' : 'failed',
                error: getErrorMessage(error),
            });
        }
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
