const WARNING_PATTERN = /注意|小心|警告|danger|warning|careful/iu;
const SUCCESS_PATTERN = /有效|成功|顺利|通过|认可|approved|worked/iu;
function clip(value, max = 180) {
    const normalized = (value ?? '').trim().replace(/\s+/g, ' ');
    if (!normalized) {
        return '';
    }
    return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1)}…`;
}
function dedupeInsights(insights) {
    const seen = new Set();
    return insights.filter((insight) => {
        const key = `${insight.kind}:${insight.content}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
function buildEvidence(input, context) {
    return clip(context.intent?.rawText
        || input.inputText
        || input.outcomeSummary
        || input.actionSummary
        || context.reflection?.analysis.nextTimeRecommendation);
}
function formatInsight(insight) {
    if (insight.kind === 'lesson') {
        return insight.content.startsWith('[踩坑]') ? insight.content : `[踩坑] ${insight.content}`;
    }
    if (insight.kind === 'pattern') {
        return insight.content.startsWith('[有效模式]') ? insight.content : `[有效模式] ${insight.content}`;
    }
    if (insight.kind === 'warning') {
        return insight.content.startsWith('[警告]') ? insight.content : `[警告] ${insight.content}`;
    }
    return insight.content.startsWith('[洞察]') ? insight.content : `[洞察] ${insight.content}`;
}
async function isDuplicateInsight(content, semanticRepo) {
    if (!semanticRepo) {
        return false;
    }
    const hits = semanticRepo.search(content, { limit: 3, minScore: 0.88 });
    return hits.some((hit) => hit.score > 0.88);
}
export async function extractLearningInsights(input, context) {
    const evidenceText = buildEvidence(input, context);
    const combined = [input.inputText, input.actionSummary, input.outcomeSummary].filter(Boolean).join(' ');
    const insights = [];
    if (context.intent?.intent.type === 'correction' || (context.intent?.signals.correctionSignal ?? 0) >= 0.8) {
        const cause = clip(input.actionSummary || input.outcomeSummary || '执行方式偏离了用户预期');
        const fix = clip(input.inputText
            || context.reflection?.analysis.nextTimeRecommendation
            || '先复述修正点并确认，再继续执行');
        insights.push({
            content: `踩坑：${cause}；修正：${fix}`,
            kind: 'lesson',
            confidence: 0.92,
            trigger: 'correction',
            evidenceText,
        });
    }
    if ((context.reflection?.evidence.recurrenceCount ?? 0) >= 2 && SUCCESS_PATTERN.test(combined)) {
        const pattern = clip(context.reflection?.analysis.whatWorked
            || input.outcomeSummary
            || input.actionSummary
            || '当前做法在重复场景中表现稳定');
        insights.push({
            content: `有效模式：${pattern}`,
            kind: 'pattern',
            confidence: 0.86,
            trigger: 'repeated_pattern',
            evidenceText,
        });
    }
    const recommendation = clip(context.reflection?.analysis.nextTimeRecommendation);
    if (recommendation) {
        insights.push({
            content: recommendation,
            kind: 'insight',
            confidence: Math.max(0.7, context.reflection?.evidence.confidence ?? 0.7),
            trigger: context.reflection?.trigger.kind === 'success' ? 'success' : 'explicit',
            evidenceText,
        });
    }
    if (WARNING_PATTERN.test(combined)) {
        insights.push({
            content: clip(input.inputText || input.outcomeSummary || combined),
            kind: 'warning',
            confidence: 0.9,
            trigger: 'explicit',
            evidenceText,
        });
    }
    return dedupeInsights(insights);
}
export async function storeInsights(insights, scope, memoryService, semanticRepo) {
    const stored = [];
    let skippedCount = 0;
    for (const insight of insights) {
        const content = formatInsight(insight);
        if (await isDuplicateInsight(content, semanticRepo)) {
            skippedCount += 1;
            continue;
        }
        const memory = {
            content,
            type: insight.kind === 'pattern' ? 'decision' : insight.kind === 'insight' ? 'fact' : 'constraint',
            lifecycle: 'semantic',
            scope,
            source: {
                kind: 'reflection_derived',
                actor: 'system',
            },
            evidence: {
                excerpt: insight.evidenceText,
            },
            confidence: insight.confidence,
            importance: insight.kind === 'warning' || insight.kind === 'lesson' ? 0.9 : 0.75,
            explicitness: 0.8,
            tags: ['learning_insight', insight.kind, insight.trigger],
        };
        const result = memoryService.store(memory, scope);
        if (result.accepted) {
            stored.push(insight);
            continue;
        }
        skippedCount += 1;
    }
    return {
        insights: stored,
        storedCount: stored.length,
        skippedCount,
    };
}
