const DEFAULT_SOURCE = {
    kind: 'tool',
    actor: 'system',
};
function normalizeScope(scope) {
    if (!scope) {
        return undefined;
    }
    return {
        userId: scope.userId,
        chatId: scope.chatId,
        project: scope.project,
        global: scope.global,
    };
}
export function evermemoryStore(memoryService, input) {
    return memoryService.store({
        content: input.content,
        type: input.type,
        lifecycle: input.lifecycle,
        scope: normalizeScope(input.scope),
        source: input.source ?? DEFAULT_SOURCE,
        tags: input.tags ?? [],
        relatedEntities: input.relatedEntities ?? [],
        sourceGrade: input.sourceGrade,
        importance: input.importance,
    });
}
