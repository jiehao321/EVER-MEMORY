const sessionContexts = new Map();
export function setSessionContext(context) {
    sessionContexts.set(context.sessionId, context);
    return context;
}
export function getSessionContext(sessionId) {
    return sessionContexts.get(sessionId);
}
export function setInteractionContext(interaction) {
    const previous = sessionContexts.get(interaction.sessionId);
    const next = previous
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
export function getInteractionContext(sessionId) {
    return sessionContexts.get(sessionId)?.interaction;
}
export function clearSessionContext(sessionId) {
    sessionContexts.delete(sessionId);
}
