import crypto from 'node:crypto';
import type { ButlerAgent } from '../../core/butler/agent.js';
import type { AttentionService } from '../../core/butler/attention/service.js';
import type { ButlerGoalService } from '../../core/butler/goals/service.js';
import { compileOverlay, compileSessionWatchlist } from '../../core/butler/strategy/compiler.js';
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
  upsertScopeStateFromCtx,
} from '../shared.js';

interface ButlerHookContext {
  agent: ButlerAgent;
  overlayGenerator: StrategicOverlayGenerator;
  attentionService: AttentionService;
  goalService?: ButlerGoalService;
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

export function registerHooks(
  registrationContext: OpenClawRegistrationContext,
  butler?: ButlerHookContext,
): void {
  const { api, evermemory, sessionScopes } = registrationContext;

  // session_start: scope init + Butler cycle only. No return value (new SDK requires void).
  registerHook(api, 'session_start', (event, ctx) => {
    const sessionId = (
      (isRecord(event) ? asOptionalString((event as Record<string, unknown>).sessionId) : undefined)
      ?? (isRecord(ctx) ? asOptionalString((ctx as Record<string, unknown>).sessionId) : undefined)
    );
    if (!sessionId) {
      return;
    }

    const scopeState = upsertScopeState(sessionScopes, sessionId, event, ctx);
    syncSessionStartScope(evermemory, sessionId, scopeState);
    runButlerCycle(registrationContext, butler, 'session_start', {
      type: 'session_started',
      sessionId,
      scope: scopeState.scope,
    });
    // No return value — new SDK session_start is void
  });

  // before_agent_start: memory recall + watchlist + overlay computation.
  // Watchlist is computed here (not cached from session_start).
  registerHook(api, 'before_agent_start', async (event, ctx) => {
    if (!isRecord(ctx)) {
      return undefined;
    }
    const prompt = isRecord(event) ? asOptionalString((event as Record<string, unknown>).prompt) : undefined;
    const sessionId = asOptionalString((ctx as Record<string, unknown>).sessionId)
      ?? (isRecord(event) ? asOptionalString((event as Record<string, unknown>).sessionId) : undefined);
    if (!prompt || !sessionId) {
      return undefined;
    }

    const scopeState = upsertScopeStateFromCtx(sessionScopes, sessionId, event, ctx);
    const scopeRebound = syncSessionStartScope(evermemory, sessionId, scopeState);

    // Self-generate turnId (no longer relies on host runId)
    const turnId = `turn-${sessionId}-${crypto.randomUUID()}`;

    const result = await evermemory.messageReceived({
      sessionId,
      messageId: turnId,
      text: prompt,
      scope: scopeState.scope,
      channel: scopeState.channel,
    });

    const injected = buildInjectedContext(result.recall.items, result.behaviorRules);
    evermemory.debugRepo.log('interaction_processed', turnId, {
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

    // Compute watchlist (per-turn, not cached)
    let watchlistXml: string | undefined;
    if (butler) {
      try {
        const insights = butler.attentionService.getCriticalInsights(3);
        const goals = butler.goalService?.getActiveGoals().slice(0, 3) ?? [];
        watchlistXml = compileSessionWatchlist(insights, goals) ?? undefined;
      } catch (error) {
        logButlerFailure(registrationContext, 'before_agent_start_watchlist', error);
      }
    }

    if (!butler) {
      const parts = [injected.prependContext, watchlistXml].filter(Boolean);
      return parts.length > 0 ? { prependContext: parts.join('\n\n') } : undefined;
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
        const parts = [injected.prependContext, watchlistXml].filter(Boolean);
        return parts.length > 0 ? { prependContext: parts.join('\n\n') } : undefined;
      }
      const topInsights = butler.attentionService.getTopInsights();
      const overlay = await butler.overlayGenerator.generateOverlay(state, {
        recentMessages: [prompt],
        scope: scopeState.scope,
      });
      const overlayXml = compileOverlay(overlay, topInsights);
      const parts = [injected.prependContext, watchlistXml, overlayXml].filter(Boolean);
      return parts.length > 0 ? { prependContext: parts.join('\n\n') } : undefined;
    } catch (error) {
      logButlerFailure(registrationContext, 'before_agent_start', error);
      const parts = [injected.prependContext, watchlistXml].filter(Boolean);
      return parts.length > 0 ? { prependContext: parts.join('\n\n') } : undefined;
    }
  });

  // agent_end: self-generate turnId, no dependency on host runId
  registerHook(api, 'agent_end', async (event, ctx) => {
    const sessionId = (
      (isRecord(ctx) ? asOptionalString((ctx as Record<string, unknown>).sessionId) : undefined)
      ?? (isRecord(event) ? asOptionalString((event as Record<string, unknown>).sessionId) : undefined)
    );
    if (!sessionId) {
      return;
    }
    const scopeState = upsertScopeStateFromCtx(sessionScopes, sessionId, event, ctx);
    syncSessionStartScope(evermemory, sessionId, scopeState);

    const messages = isRecord(event) && Array.isArray((event as Record<string, unknown>).messages)
      ? (event as Record<string, unknown>).messages as unknown[]
      : [];
    const exchange = extractLastExchange(messages);

    const turnId = `turn-${sessionId}-${crypto.randomUUID()}`;

    await evermemory.sessionEnd({
      sessionId,
      messageId: turnId,
      scope: scopeState.scope,
      channel: scopeState.channel,
      inputText: exchange.userText,
      actionSummary: exchange.assistantText,
      outcomeSummary: isRecord(event) && (event as Record<string, unknown>).success === true ? 'run_success' : 'run_failed',
    });
    runButlerCycle(registrationContext, butler, 'agent_end', {
      type: 'agent_ended',
      sessionId,
      scope: scopeState.scope,
      payload: { success: isRecord(event) && (event as Record<string, unknown>).success === true },
    });
  });

  // session_end: simple cleanup
  registerHook(api, 'session_end', (event, ctx) => {
    const sessionId = (
      (isRecord(event) ? asOptionalString((event as Record<string, unknown>).sessionId) : undefined)
      ?? (isRecord(ctx) ? asOptionalString((ctx as Record<string, unknown>).sessionId) : undefined)
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
