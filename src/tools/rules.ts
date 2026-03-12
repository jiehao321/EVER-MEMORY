import type { BehaviorService } from '../core/behavior/service.js';
import type { EverMemoryRulesToolInput, EverMemoryRulesToolResult } from '../types.js';

export function evermemoryRules(
  behaviorService: BehaviorService,
  input: EverMemoryRulesToolInput = {},
): EverMemoryRulesToolResult {
  const limit = input.limit ?? 8;
  const rules = behaviorService.getActiveRules({
    scope: input.scope,
    intentType: input.intentType,
    channel: input.channel,
    contexts: input.contexts,
    limit,
  });

  return {
    rules,
    total: rules.length,
    filters: {
      userId: input.scope?.userId,
      intentType: input.intentType,
      channel: input.channel,
      contexts: input.contexts,
      limit,
    },
  };
}
