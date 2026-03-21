export function evermemoryReview(archiveService, behaviorService, input = {}) {
    const archived = archiveService.reviewArchived(input);
    const ruleReview = input.ruleId ? behaviorService.reviewRule(input.ruleId) ?? undefined : undefined;
    return {
        ...archived,
        ruleReview,
    };
}
