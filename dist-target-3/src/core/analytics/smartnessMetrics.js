const DIVERSITY_KINDS = [
    'project_state',
    'decision',
    'explicit_constraint',
    'user_preference',
    'next_step',
    'lesson',
    'warning',
];
function clamp(score) {
    return Math.max(0, Math.min(1, score));
}
function toTrend(current, previous) {
    if (current > previous) {
        return 'up';
    }
    if (current < previous) {
        return 'down';
    }
    return 'stable';
}
function hasKind(memory, kind) {
    return memory.type === kind || memory.tags.includes(kind);
}
function countByKind(memories, kind) {
    return memories.filter((memory) => hasKind(memory, kind)).length;
}
function byWindow(items, recentStart, previousStart) {
    let recent = 0;
    let previous = 0;
    for (const item of items) {
        if (item.createdAt >= recentStart) {
            recent += 1;
        }
        else if (item.createdAt >= previousStart) {
            previous += 1;
        }
    }
    return [recent, previous];
}
function getRulesCount(event) {
    const value = event?.payload.rules;
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}
export class SmartnessMetricsService {
    memoryRepo;
    debugEventRepo;
    constructor(memoryRepo, debugEventRepo) {
        this.memoryRepo = memoryRepo;
        this.debugEventRepo = debugEventRepo;
    }
    async compute(userId) {
        const scope = userId ? { userId } : undefined;
        const total = this.memoryRepo.count({ scope });
        const memories = total > 0 ? this.memoryRepo.search({ scope, limit: total, archived: false }) : [];
        const now = new Date();
        const recentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const previousStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const createdRows = memories.map((memory) => ({ createdAt: memory.timestamps.createdAt }));
        const [recentAdded, previousAdded] = byWindow(createdRows, recentStart, previousStart);
        const preferenceCount = countByKind(memories, 'user_preference');
        const constraintCount = countByKind(memories, 'explicit_constraint');
        const [recentPreference, previousPreference] = byWindow(memories
            .filter((memory) => hasKind(memory, 'user_preference') || hasKind(memory, 'explicit_constraint'))
            .map((memory) => ({ createdAt: memory.timestamps.createdAt })), recentStart, previousStart);
        const learningCount = countByKind(memories, 'lesson') + countByKind(memories, 'warning');
        const [recentLearning, previousLearning] = byWindow(memories
            .filter((memory) => hasKind(memory, 'lesson') || hasKind(memory, 'warning'))
            .map((memory) => ({ createdAt: memory.timestamps.createdAt })), recentStart, previousStart);
        const uniqueKinds = new Set(DIVERSITY_KINDS.filter((kind) => memories.some((memory) => hasKind(memory, kind)))).size;
        const recentKinds = new Set(DIVERSITY_KINDS.filter((kind) => memories.some((memory) => hasKind(memory, kind) && memory.timestamps.createdAt >= recentStart))).size;
        const previousKinds = new Set(DIVERSITY_KINDS.filter((kind) => memories.some((memory) => hasKind(memory, kind)
            && memory.timestamps.createdAt < recentStart
            && memory.timestamps.createdAt >= previousStart))).size;
        const ruleEvents = this.debugEventRepo.listRecent('rules_loaded', 200);
        const activeRules = getRulesCount(ruleEvents[0]);
        const [recentRuleEvents, previousRuleEvents] = [
            ruleEvents.filter((event) => event.createdAt >= recentStart),
            ruleEvents.filter((event) => event.createdAt < recentStart && event.createdAt >= previousStart),
        ];
        const recentRules = recentRuleEvents.length > 0
            ? Math.round(recentRuleEvents.reduce((sum, event) => sum + getRulesCount(event), 0) / recentRuleEvents.length)
            : 0;
        const previousRules = previousRuleEvents.length > 0
            ? Math.round(previousRuleEvents.reduce((sum, event) => sum + getRulesCount(event), 0) / previousRuleEvents.length)
            : 0;
        const recallAccuracyScore = clamp(total / 100);
        const preferenceScore = clamp((total > 0 ? preferenceCount / total : 0) * 3 + (constraintCount > 0 ? 0.1 : 0));
        const learningScore = clamp(total > 0 ? learningCount / total : 0);
        const ruleScore = clamp(activeRules / 10);
        const diversityScore = clamp(uniqueKinds / DIVERSITY_KINDS.length);
        const dimensions = [
            {
                name: '记忆深度',
                score: recallAccuracyScore,
                trend: toTrend(recentAdded, previousAdded),
                description: `${total} 条记忆，近 7 天新增 ${recentAdded} 条`,
                advice: recallAccuracyScore < 0.6
                    ? 'Try `evermemory_recall` more often to retrieve relevant memories'
                    : undefined,
            },
            {
                name: '偏好精准度',
                score: preferenceScore,
                trend: toTrend(recentPreference, previousPreference),
                description: `${preferenceCount} 条偏好记忆，${constraintCount} 条约束`,
                advice: preferenceScore < 0.6
                    ? 'Run `evermemory_store` to record identity and preference memories'
                    : undefined,
            },
            {
                name: '主动学习密度',
                score: learningScore,
                trend: toTrend(recentLearning, previousLearning),
                description: `${learningCount} 条 lesson/warning 记忆`,
                advice: learningScore < 0.6
                    ? 'Complete more sessions with context — auto-capture improves over time'
                    : undefined,
            },
            {
                name: '行为规则成熟度',
                score: ruleScore,
                trend: toTrend(recentRules, previousRules),
                description: `${activeRules} 条活跃规则`,
                advice: ruleScore < 0.6
                    ? 'Use `evermemory_rules` to review and promote candidate rules'
                    : undefined,
            },
            {
                name: '记忆多样性',
                score: diversityScore,
                trend: toTrend(recentKinds, previousKinds),
                description: `${uniqueKinds}/${DIVERSITY_KINDS.length} 种关键类型覆盖`,
                advice: diversityScore < 0.6
                    ? 'Complete more sessions with context — auto-capture improves over time'
                    : undefined,
            },
        ];
        return {
            overall: clamp(dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length),
            dimensions,
            computedAt: now.toISOString(),
            userId,
        };
    }
}
