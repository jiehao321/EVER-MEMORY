import type { DebugRepository } from '../storage/debugRepo.js';
import type { BehaviorService } from '../core/behavior/service.js';
import type { BriefingService } from '../core/briefing/service.js';
import { setSessionContext } from '../runtime/context.js';
import type { MemoryScope, SessionStartInput, SessionStartResult } from '../types.js';

function buildScope(input: SessionStartInput): MemoryScope {
  return {
    userId: input.userId,
    chatId: input.chatId,
    project: input.project,
  };
}

export function handleSessionStart(
  input: SessionStartInput,
  briefingService: BriefingService,
  behaviorService: BehaviorService,
  debugRepo?: DebugRepository,
): SessionStartResult {
  const scope = buildScope(input);
  const briefing = briefingService.build(scope, {
    sessionId: input.sessionId,
  });
  const behaviorRules = behaviorService.getActiveRules({
    scope,
    channel: input.channel,
    limit: 6,
  });

  setSessionContext({
    sessionId: input.sessionId,
    scope,
    bootBriefing: briefing,
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

  return {
    sessionId: input.sessionId,
    scope,
    briefing,
    behaviorRules,
  };
}
