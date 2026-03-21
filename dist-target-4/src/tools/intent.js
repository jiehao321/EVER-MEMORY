export function evermemoryIntent(intentService, input) {
    return intentService.analyze({
        text: input.message,
        sessionId: input.sessionId,
        messageId: input.messageId,
        scope: input.scope,
    });
}
