import { randomUUID } from 'node:crypto';
import type { DebugRepository } from '../storage/debugRepo.js';
import type { BehaviorService } from '../core/behavior/service.js';
import { normalizeCommunicationStyle, type BriefingService } from '../core/briefing/service.js';
import type { ProfileRepository } from '../storage/profileRepo.js';
import type { PredictiveContextService } from '../core/memory/predictiveContext.js';
import { setSessionContext } from '../runtime/context.js';
import { DEFAULT_BOOT_TOKEN_BUDGET } from '../constants.js';
import type { BootBriefing, MemoryScope, ProjectedProfile, RuntimeUserProfile, SessionStartInput, SessionStartResult } from '../types.js';

function buildScope(input: SessionStartInput): MemoryScope {
  return {
    userId: input.userId,
    chatId: input.chatId,
    project: input.project,
  };
}

function buildUserProfile(profile: ProjectedProfile): RuntimeUserProfile {
  return {
    communicationStyle: profile.derived.communicationStyle?.tendency,
    likelyInterests: profile.derived.likelyInterests.map((item) => item.value),
    workPatterns: profile.derived.workPatterns.map((item) => item.value),
    explicitPreferences: Object.freeze(Object.fromEntries(
      Object.entries(profile.stable.explicitPreferences).map(([key, value]) => [key, value.value]),
    )),
    displayName: profile.stable.displayName?.value,
  };
}

export function handleSessionStart(
  input: SessionStartInput,
  briefingService: BriefingService,
  behaviorService: BehaviorService,
  debugRepo?: DebugRepository,
  profileRepo?: ProfileRepository,
  predictiveContextService?: PredictiveContextService,
): SessionStartResult {
  const scope = buildScope(input);
  const userProfile = profileRepo && input.userId
    ? profileRepo.getByUserId(input.userId) ?? undefined
    : undefined;
  const style = userProfile
    ? normalizeCommunicationStyle(userProfile.derived.communicationStyle?.tendency)
    : undefined;

  // A4b: Wrap briefing generation in try-catch — failure must not crash session startup
  let briefing: BootBriefing;
  try {
    briefing = briefingService.build(scope, {
      sessionId: input.sessionId,
      communicationStyle: style,
    });
  } catch (error) {
    debugRepo?.log('boot_generated', input.sessionId ?? 'unknown', {
      sessionId: input.sessionId,
      userId: input.userId,
      briefingFailed: true,
      error: error instanceof Error ? error.message : String(error),
    });
    // Degraded: empty briefing — session can still proceed
    briefing = {
      id: randomUUID(),
      sessionId: input.sessionId,
      userId: input.userId,
      generatedAt: new Date().toISOString(),
      sections: { identity: [], constraints: [], recentContinuity: [], activeProjects: [] },
      tokenTarget: DEFAULT_BOOT_TOKEN_BUDGET,
      actualApproxTokens: 0,
      optimization: { duplicateBlocksRemoved: 0, tokenPrunedBlocks: 0, highValueBlocksKept: 0 },
    };
  }
  const behaviorRules = behaviorService.getActiveRules({
    scope,
    channel: input.channel,
    limit: 6,
  });
  const runtimeUserProfile = userProfile ? buildUserProfile(userProfile) : undefined;

  setSessionContext({
    sessionId: input.sessionId,
    scope,
    bootBriefing: briefing,
    userProfile: runtimeUserProfile,
    activeBehaviorRules: behaviorRules,
  });

  debugRepo?.log('rules_loaded', input.sessionId, {
    sessionId: input.sessionId,
    source: 'sessionStart',
    rules: behaviorRules.length,
  });

  debugRepo?.log('boot_generated', input.sessionId, {
    sessionId: input.sessionId,
    userId: input.userId,
    chatId: input.chatId,
    briefingId: briefing.id,
    activeRules: behaviorRules.length,
    sectionCounts: {
      identity: briefing.sections.identity.length,
      constraints: briefing.sections.constraints.length,
      recentContinuity: briefing.sections.recentContinuity.length,
      activeProjects: briefing.sections.activeProjects.length,
    },
    projectSummaryCount: briefing.sections.activeProjects.filter((item) => item.includes('项目连续性摘要')).length,
    briefingOptimization: {
      duplicateBlocksRemoved: briefing.optimization?.duplicateBlocksRemoved ?? 0,
      tokenPrunedBlocks: briefing.optimization?.tokenPrunedBlocks ?? 0,
      highValueBlocksKept: briefing.optimization?.highValueBlocksKept
        ?? (briefing.sections.activeProjects.length + briefing.sections.constraints.length),
      tokenTarget: briefing.tokenTarget,
      actualApproxTokens: briefing.actualApproxTokens,
    },
  });

  if (predictiveContextService) {
    try {
      predictiveContextService.buildPredictiveCache(input.sessionId, scope);
    } catch {
      // Best-effort cache warming must not block session startup
    }
  }

  return {
    sessionId: input.sessionId,
    scope,
    briefing,
    userProfile: runtimeUserProfile,
    behaviorRules,
  };
}
