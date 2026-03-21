function normalizeScope(scope) {
    return {
        userId: scope?.userId,
        chatId: scope?.chatId,
        project: scope?.project,
        global: scope?.global,
    };
}
export function evermemoryBriefing(briefingService, input = {}) {
    return briefingService.build(normalizeScope(input.scope), {
        sessionId: input.sessionId,
        tokenTarget: input.tokenTarget,
    });
}
