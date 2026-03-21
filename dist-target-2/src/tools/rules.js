export function evermemoryRules(behaviorService, input = {}) {
    const limit = input.limit ?? 8;
    const mutation = input.action && input.ruleId
        ? behaviorService.mutateRule({
            action: input.action,
            ruleId: input.ruleId,
            reason: input.reason,
            reflectionId: input.reflectionId,
            replacementRuleId: input.replacementRuleId,
        })
        : undefined;
    const rules = behaviorService.getActiveRules({
        scope: input.scope,
        intentType: input.intentType,
        channel: input.channel,
        contexts: input.contexts,
        limit,
        includeInactive: input.includeInactive,
        includeDeprecated: input.includeDeprecated,
        includeFrozen: input.includeFrozen,
    });
    const rulesWithCounts = rules.map((rule) => ({
        ...rule,
        appliedCount: rule.lifecycle.applyCount,
    }));
    return {
        rules: rulesWithCounts,
        total: rulesWithCounts.length,
        filters: {
            userId: input.scope?.userId,
            intentType: input.intentType,
            channel: input.channel,
            contexts: input.contexts,
            limit,
            includeInactive: input.includeInactive,
            includeDeprecated: input.includeDeprecated,
            includeFrozen: input.includeFrozen,
        },
        governance: {
            levels: Array.from(new Set(rules.map((rule) => rule.lifecycle.level))),
            maturities: Array.from(new Set(rules.map((rule) => rule.lifecycle.maturity))),
            frozenCount: rules.filter((rule) => rule.state.frozen || rule.lifecycle.maturity === 'frozen').length,
            staleCount: rules.filter((rule) => rule.lifecycle.stale).length,
            maxDecayScore: rules.reduce((max, rule) => Math.max(max, rule.lifecycle.decayScore), 0),
        },
        mutation: mutation
            ? {
                action: mutation.action,
                changed: mutation.changed,
                reason: mutation.reason,
                rule: mutation.rule,
                rolledBack: mutation.rolledBack,
            }
            : undefined,
    };
}
