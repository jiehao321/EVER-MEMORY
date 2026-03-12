import type { InteractionRuntimeContext, RuntimeSessionContext } from '../types.js';

const sessionContexts = new Map<string, RuntimeSessionContext>();

export function setSessionContext(context: RuntimeSessionContext): RuntimeSessionContext {
  sessionContexts.set(context.sessionId, context);
  return context;
}

export function getSessionContext(sessionId: string): RuntimeSessionContext | undefined {
  return sessionContexts.get(sessionId);
}

export function setInteractionContext(interaction: InteractionRuntimeContext): RuntimeSessionContext {
  const previous = sessionContexts.get(interaction.sessionId);

  const next: RuntimeSessionContext = previous
    ? {
        ...previous,
        scope: interaction.scope,
        interaction,
      }
    : {
        sessionId: interaction.sessionId,
        scope: interaction.scope,
        interaction,
      };

  sessionContexts.set(next.sessionId, next);
  return next;
}

export function getInteractionContext(sessionId: string): InteractionRuntimeContext | undefined {
  return sessionContexts.get(sessionId)?.interaction;
}

export function clearSessionContext(sessionId: string): void {
  sessionContexts.delete(sessionId);
}
