import type { BriefingService } from '../core/briefing/service.js';
import type { EverMemoryBriefingToolInput, MemoryScope } from '../types.js';

function normalizeScope(scope?: MemoryScope): MemoryScope {
  return {
    userId: scope?.userId,
    chatId: scope?.chatId,
    project: scope?.project,
    global: scope?.global,
  };
}

export function evermemoryBriefing(
  briefingService: BriefingService,
  input: EverMemoryBriefingToolInput = {},
) {
  return briefingService.build(normalizeScope(input.scope), {
    sessionId: input.sessionId,
    tokenTarget: input.tokenTarget,
  });
}
