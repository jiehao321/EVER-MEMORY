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
  });

  return {
    sessionId: input.sessionId,
    scope,
    briefing,
    behaviorRules,
  };
}
