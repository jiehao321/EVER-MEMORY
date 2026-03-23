import type { ButlerAgent } from '../../core/butler/agent.js';
import type { AttentionService } from '../../core/butler/attention/service.js';
import { compileOverlay } from '../../core/butler/strategy/compiler.js';
import type { StrategicOverlayGenerator } from '../../core/butler/strategy/overlay.js';
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

interface ButlerHookContext {
  agent: ButlerAgent;
  overlayGenerator: StrategicOverlayGenerator;
  attentionService: AttentionService;
}

function logButlerFailure(
  context: OpenClawRegistrationContext,
  stage: string,
  error: unknown,
): void {
  context.api.logger.warn(`EverMemory Butler ${stage} failed: ${error instanceof Error ? error.message : String(error)}`);
}

function runButlerCycle(
  context: OpenClawRegistrationContext,
  butler: ButlerHookContext | undefined,
  stage: string,
  trigger: Parameters<ButlerAgent['runCycle']>[0],
): void {
  if (!butler) {
    return;
  }
  void butler.agent.runCycle(trigger).catch((error) => {
    logButlerFailure(context, stage, error);
  });
}

function mergePrependContext(current: string | undefined, overlayXml: string): { prependContext: string } {
  return {
    prependContext: [current, overlayXml].filter((value): value is string => Boolean(value)).join('\n\n'),
  };
}

export function registerHooks(
  registrationContext: OpenClawRegistrationContext,
  butler?: ButlerHookContext,
): void {
  const { api, evermemory, sessionScopes } = registrationContext;
  registerHook(api, 'session_start', (event: unknown, hookContext: unknown) => {
    const sessionId = (
      (isRecord(event) ? asOptionalString(event.sessionId) : undefined)
      ?? (isRecord(hookContext) ? asOptionalString(hookContext.sessionId) : undefined)
    );
    if (!sessionId) {
      return;
    }

    const scopeState = upsertScopeState(sessionScopes, sessionId, event, hookContext);
    syncSessionStartScope(evermemory, sessionId, scopeState);
    runButlerCycle(registrationContext, butler, 'session_start', {
      type: 'session_started',
      sessionId,
      scope: scopeState.scope,
    });
  });

  registerHook(api, 'before_agent_start', async (event: unknown, hookContext: unknown) => {
    if (!isRecord(hookContext)) {
      return undefined;
    }
    const prompt = isRecord(event) ? asOptionalString(event.prompt) : undefined;
    const sessionId = asOptionalString(hookContext.sessionId)
      ?? (isRecord(event) ? asOptionalString(event.sessionId) : undefined);
    if (!prompt || !sessionId) {
      return undefined;
    }

    const scopeState = upsertScopeState(sessionScopes, sessionId, event, hookContext);
    const scopeRebound = syncSessionStartScope(evermemory, sessionId, scopeState);
    const runId = asOptionalString(hookContext.runId);

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
    if (!butler) {
      return injected.prependContext ? { prependContext: injected.prependContext } : undefined;
    }
    try {
      await butler.agent.runCycle({
        type: 'message_received',
        sessionId,
        scope: scopeState.scope,
        payload: { prompt },
      });
      const state = butler.agent.getState();
      if (!state) {
        return injected.prependContext ? { prependContext: injected.prependContext } : undefined;
      }
      const topInsights = butler.attentionService.getTopInsights();
      const overlay = await butler.overlayGenerator.generateOverlay(state, {
        recentMessages: [prompt],
        scope: scopeState.scope,
      });
      return mergePrependContext(injected.prependContext, compileOverlay(overlay, topInsights));
    } catch (error) {
      logButlerFailure(registrationContext, 'before_agent_start', error);
      return injected.prependContext ? { prependContext: injected.prependContext } : undefined;
    }
  });

  registerHook(api, 'agent_end', async (event: unknown, hookContext: unknown) => {
    const sessionId = (
      (isRecord(hookContext) ? asOptionalString(hookContext.sessionId) : undefined)
      ?? (isRecord(event) ? asOptionalString(event.sessionId) : undefined)
    );
    if (!sessionId) {
      return;
    }
    const scopeState = upsertScopeState(sessionScopes, sessionId, event, hookContext);
    syncSessionStartScope(evermemory, sessionId, scopeState);

    const messages = isRecord(event) && Array.isArray(event.messages) ? event.messages : [];
    const exchange = extractLastExchange(messages);

    await evermemory.sessionEnd({
      sessionId,
      messageId: isRecord(hookContext) ? asOptionalString(hookContext.runId) : undefined,
      scope: scopeState.scope,
      channel: scopeState.channel,
      inputText: exchange.userText,
      actionSummary: exchange.assistantText,
      outcomeSummary: isRecord(event) && event.success === true ? 'run_success' : 'run_failed',
    });
    runButlerCycle(registrationContext, butler, 'agent_end', {
      type: 'agent_ended',
      sessionId,
      scope: scopeState.scope,
      payload: { success: isRecord(event) && event.success === true },
    });
  });

  registerHook(api, 'session_end', (event: unknown, hookContext: unknown) => {
    const sessionId = (
      (isRecord(event) ? asOptionalString(event.sessionId) : undefined)
      ?? (isRecord(hookContext) ? asOptionalString(hookContext.sessionId) : undefined)
    );
    if (!sessionId) {
      return;
    }
    sessionScopes.delete(sessionId);
    runButlerCycle(registrationContext, butler, 'session_end', {
      type: 'session_ended',
      sessionId,
    });
  });
}
