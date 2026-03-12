import type { IntentService } from '../core/intent/service.js';
import type { BehaviorService } from '../core/behavior/service.js';
import type { RetrievalService } from '../retrieval/service.js';
import { setInteractionContext } from '../runtime/context.js';
import type { DebugRepository } from '../storage/debugRepo.js';
import type { InteractionRuntimeContext, MessageReceivedInput, MessageReceivedResult } from '../types.js';

function nowIso(): string {
  return new Date().toISOString();
}

export function handleMessageReceived(
  input: MessageReceivedInput,
  intentService: IntentService,
  behaviorService: BehaviorService,
  retrievalService: RetrievalService,
  debugRepo?: DebugRepository,
): MessageReceivedResult {
  const intent = intentService.analyze({
    text: input.text,
    sessionId: input.sessionId,
    messageId: input.messageId,
    scope: input.scope,
  });

  const recall = retrievalService.recallForIntent({
    intent,
    scope: input.scope,
    query: input.text,
    limit: input.recallLimit,
  });
  const behaviorRules = behaviorService.getActiveRules({
    scope: input.scope,
    intentType: intent.intent.type,
    channel: input.channel,
    contexts: input.contexts,
    limit: 6,
  });

  const interaction: InteractionRuntimeContext = {
    sessionId: input.sessionId,
    messageId: input.messageId,
    scope: input.scope ?? {},
    intent,
    recalledItems: recall.items,
    appliedBehaviorRules: behaviorRules,
    updatedAt: nowIso(),
  };

  setInteractionContext(interaction);
  debugRepo?.log('rules_loaded', input.messageId, {
    sessionId: input.sessionId,
    messageId: input.messageId,
    source: 'messageReceived',
    rules: behaviorRules.length,
    intentType: intent.intent.type,
  });

  debugRepo?.log('interaction_processed', input.messageId, {
    sessionId: input.sessionId,
    messageId: input.messageId,
    memoryNeed: intent.signals.memoryNeed,
    recalled: recall.total,
    rules: behaviorRules.length,
  });

  return {
    sessionId: input.sessionId,
    messageId: input.messageId,
    intent,
    recall,
    behaviorRules,
  };
}
