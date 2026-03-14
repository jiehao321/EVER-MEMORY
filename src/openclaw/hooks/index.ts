import type { OpenClawRegistrationContext } from '../shared.js';
import {
  asOptionalString,
  buildInjectedContext,
  extractLastExchange,
  isRecord,
  registerHook,
  syncSessionStartScope,
  upsertScopeState,
} from '../shared.js';

export function registerHooks({ api, evermemory, sessionScopes }: OpenClawRegistrationContext): void {
  registerHook(api, 'session_start', (event: unknown, context: unknown) => {
    const sessionId = (
      (isRecord(event) ? asOptionalString(event.sessionId) : undefined)
      ?? (isRecord(context) ? asOptionalString(context.sessionId) : undefined)
    );
    if (!sessionId) {
      return;
    }

    const scopeState = upsertScopeState(sessionScopes, sessionId, event, context);
    syncSessionStartScope(evermemory, sessionId, scopeState);
  });

  registerHook(api, 'before_agent_start', async (event: unknown, context: unknown) => {
    if (!isRecord(context)) {
      return undefined;
    }
    const prompt = isRecord(event) ? asOptionalString(event.prompt) : undefined;
    const sessionId = asOptionalString(context.sessionId)
      ?? (isRecord(event) ? asOptionalString(event.sessionId) : undefined);
    if (!prompt || !sessionId) {
      return undefined;
    }

    const scopeState = upsertScopeState(sessionScopes, sessionId, event, context);
    const scopeRebound = syncSessionStartScope(evermemory, sessionId, scopeState);
    const runId = asOptionalString(context.runId);

    const result = await evermemory.messageReceived({
      sessionId,
      messageId: runId,
      text: prompt,
      scope: scopeState.scope,
      channel: scopeState.channel,
    });

    const injected = buildInjectedContext(result.recall.items, result.behaviorRules);
    evermemory.debugRepo.log('interaction_processed', runId, {
      sessionId,
      source: 'before_agent_start_injection',
      scopeUserId: scopeState.scope.userId,
      scopeChatId: scopeState.scope.chatId,
      scopeProject: scopeState.scope.project,
      scopeChannel: scopeState.channel,
      scopeSessionKey: scopeState.sessionKey,
      scopeSessionStartRebound: scopeRebound,
      routeIntentType: result.intent.intent.type,
      recalled: result.recall.total,
      ...injected.stats,
    });
    return injected.prependContext ? { prependContext: injected.prependContext } : undefined;
  });

  registerHook(api, 'agent_end', (event: unknown, context: unknown) => {
    const sessionId = (
      (isRecord(context) ? asOptionalString(context.sessionId) : undefined)
      ?? (isRecord(event) ? asOptionalString(event.sessionId) : undefined)
    );
    if (!sessionId) {
      return;
    }
    const scopeState = upsertScopeState(sessionScopes, sessionId, event, context);
    syncSessionStartScope(evermemory, sessionId, scopeState);

    const messages = isRecord(event) && Array.isArray(event.messages) ? event.messages : [];
    const exchange = extractLastExchange(messages);

    evermemory.sessionEnd({
      sessionId,
      messageId: isRecord(context) ? asOptionalString(context.runId) : undefined,
      scope: scopeState.scope,
      channel: scopeState.channel,
      inputText: exchange.userText,
      actionSummary: exchange.assistantText,
      outcomeSummary: isRecord(event) && event.success === true ? 'run_success' : 'run_failed',
    });
  });

  registerHook(api, 'session_end', (event: unknown, context: unknown) => {
    const sessionId = (
      (isRecord(event) ? asOptionalString(event.sessionId) : undefined)
      ?? (isRecord(context) ? asOptionalString(context.sessionId) : undefined)
    );
    if (!sessionId) {
      return;
    }
    sessionScopes.delete(sessionId);
  });
}
