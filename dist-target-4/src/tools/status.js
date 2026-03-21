import { getSchemaVersion } from '../storage/migrations.js';
import { embeddingManager } from '../embedding/manager.js';
function resolveStatusHealth(status) {
    if (status.memoryCount === 0 || status.semanticStatus === 'disabled') {
        return 'critical';
    }
    if ((status.atRiskMemories?.count ?? 0) > 0 || status.semanticStatus === 'degraded') {
        return 'warning';
    }
    return 'healthy';
}
function buildStatusAlerts(status) {
    const alerts = [];
    if (status.memoryCount === 0) {
        alerts.push({ level: 'critical', code: 'memory_empty', message: 'No memories are stored in the current scope.' });
    }
    if (status.semanticStatus === 'disabled') {
        alerts.push({ level: 'critical', code: 'semantic_disabled', message: 'Semantic retrieval is disabled.' });
    }
    if (status.semanticStatus === 'degraded') {
        alerts.push({ level: 'warning', code: 'semantic_degraded', message: 'Semantic retrieval is degraded.' });
    }
    if ((status.atRiskMemories?.count ?? 0) > 0) {
        alerts.push({ level: 'warning', code: 'at_risk_memories', message: `${status.atRiskMemories?.count ?? 0} memories are at risk of archiving.` });
    }
    return alerts.slice(0, 3);
}
function buildStatusSummary(status) {
    return {
        health: resolveStatusHealth(status),
        memoryCount: status.memoryCount,
        semanticStatus: status.semanticStatus ?? 'disabled',
        atRiskCount: status.atRiskMemories?.count ?? 0,
        alerts: buildStatusAlerts(status),
    };
}
export function evermemoryStatus(input) {
    const AUTO_CAPTURE_PREVIEW_LENGTH = 120;
    function toNumber(value) {
        return typeof value === 'number' ? value : undefined;
    }
    function toString(value) {
        return typeof value === 'string' ? value : undefined;
    }
    function toBoolean(value) {
        return typeof value === 'boolean' ? value : undefined;
    }
    function toRecord(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return undefined;
        }
        return value;
    }
    const scopeResolvedFrom = input.userId
        ? 'user'
        : input.sessionId && input.runtimeSession
            ? 'runtime_session'
            : 'global';
    const effectiveScope = input.userId
        ? { userId: input.userId }
        : input.sessionId && input.runtimeSession
            ? input.runtimeSession.scope
            : undefined;
    const effectiveUserId = input.userId ?? input.runtimeSession?.scope.userId;
    const filters = {
        scope: effectiveScope,
    };
    const memoryCount = input.memoryRepo.count(filters);
    const activeMemoryCount = input.memoryRepo.count({
        scope: filters.scope,
        activeOnly: true,
        archived: false,
    });
    const archivedMemoryCount = input.memoryRepo.count({
        scope: filters.scope,
        archived: true,
    });
    const semanticIndexCount = input.semanticRepo.count();
    const countsByType = input.memoryRepo.countByType(filters);
    const countsByLifecycle = input.memoryRepo.countByLifecycle(filters);
    const experienceCount = input.experienceRepo.count(input.sessionId);
    const latestReflection = input.reflectionRepo.listRecent(1)[0];
    const reflectionCount = input.reflectionRepo.count();
    const latestRule = input.behaviorRepo.listRecent(1)[0];
    const activeRuleCount = input.behaviorRepo.countActive(effectiveUserId);
    const scopedProfile = effectiveUserId
        ? input.profileRepo.getByUserId(effectiveUserId) ?? undefined
        : undefined;
    const latestProfile = scopedProfile ?? input.profileRepo.listRecent(1)[0];
    const profileCount = effectiveUserId
        ? (scopedProfile ? 1 : 0)
        : input.profileRepo.count();
    const latestBriefing = effectiveUserId
        ? input.briefingRepo.getLatestByUser(effectiveUserId)
        : input.sessionId
            ? input.briefingRepo.getLatestBySession(input.sessionId)
            : null;
    const schemaVersion = getSchemaVersion(input.database.connection);
    const recentDebug = input.debugRepo.listRecent(undefined, 50);
    const recentDebugEvents = recentDebug.length;
    const recentDebugByKind = recentDebug.reduce((acc, event) => {
        acc[event.kind] = (acc[event.kind] ?? 0) + 1;
        return acc;
    }, {});
    const latestDebugEvents = recentDebug.slice(0, 5).map((event) => ({
        createdAt: event.createdAt,
        kind: event.kind,
        entityId: event.entityId,
    }));
    const latestWriteEvent = recentDebug.find((event) => event.kind === 'memory_write_decision');
    const latestRetrievalEvent = recentDebug.find((event) => event.kind === 'retrieval_executed');
    const latestProfileRecomputeEvent = recentDebug.find((event) => event.kind === 'profile_recomputed');
    const recentSessionEndEvents = input.debugRepo.listRecent('session_end_processed', 120);
    const recentRetrievalEvents = input.debugRepo.listRecent('retrieval_executed', 120);
    let autoMemoryGenerated = 0;
    let autoMemoryAccepted = 0;
    let autoMemoryRejected = 0;
    let projectSummaryGenerated = 0;
    let projectSummaryAccepted = 0;
    const autoMemoryGeneratedByKind = {};
    const autoMemoryAcceptedByKind = {};
    for (const event of recentSessionEndEvents) {
        autoMemoryGenerated += toNumber(event.payload.autoMemoryGenerated) ?? 0;
        autoMemoryAccepted += toNumber(event.payload.autoMemoryAccepted) ?? 0;
        autoMemoryRejected += toNumber(event.payload.autoMemoryRejected) ?? 0;
        projectSummaryGenerated += toNumber(event.payload.projectSummaryGenerated) ?? 0;
        projectSummaryAccepted += toNumber(event.payload.projectSummaryAccepted) ?? 0;
        const generatedByKind = toRecord(event.payload.autoMemoryGeneratedByKind);
        if (generatedByKind) {
            for (const [kind, count] of Object.entries(generatedByKind)) {
                autoMemoryGeneratedByKind[kind] = (autoMemoryGeneratedByKind[kind] ?? 0) + (toNumber(count) ?? 0);
            }
        }
        const acceptedByKind = toRecord(event.payload.autoMemoryAcceptedByKind);
        if (acceptedByKind) {
            for (const [kind, count] of Object.entries(acceptedByKind)) {
                autoMemoryAcceptedByKind[kind] = (autoMemoryAcceptedByKind[kind] ?? 0) + (toNumber(count) ?? 0);
            }
        }
    }
    let suppressedTestCandidates = 0;
    let retainedTestCandidates = 0;
    let projectRoutedExecutions = 0;
    let projectRoutedHits = 0;
    for (const event of recentRetrievalEvents) {
        const candidatePolicy = toRecord(event.payload.candidatePolicy);
        suppressedTestCandidates += toNumber(candidatePolicy?.suppressedTestCandidates) ?? 0;
        retainedTestCandidates += toNumber(candidatePolicy?.retainedTestCandidates) ?? 0;
        const routeKind = toString(event.payload.routeKind);
        const routeApplied = toBoolean(event.payload.routeApplied) === true;
        const projectOriented = toBoolean(event.payload.projectOriented) === true;
        const routed = routeApplied || (routeKind !== undefined && routeKind !== 'none');
        const returned = toNumber(event.payload.returned) ?? 0;
        if (routed && projectOriented) {
            projectRoutedExecutions += 1;
            if (returned > 0) {
                projectRoutedHits += 1;
            }
        }
    }
    const autoMemoryAcceptRate = autoMemoryGenerated > 0 ? autoMemoryAccepted / autoMemoryGenerated : undefined;
    const projectSummaryAcceptRate = projectSummaryGenerated > 0
        ? projectSummaryAccepted / projectSummaryGenerated
        : undefined;
    const projectRouteHitRate = projectRoutedExecutions > 0 ? projectRoutedHits / projectRoutedExecutions : undefined;
    // A1: Surface semantic search status for operators
    const recentSemanticFailed = input.debugRepo.listRecent('semantic_preload_failed', 5);
    const semanticStatus = !input.semanticRepo
        ? 'disabled'
        : embeddingManager.isReady()
            ? 'ready'
            : recentSemanticFailed.length > 0
                ? 'degraded'
                : 'disabled';
    // D4: Compute at-risk memories (ageInDays > 25 && accessCount < 2)
    const atRiskCutoff = Date.now() - 25 * 24 * 60 * 60 * 1000;
    const allActiveMemories = input.memoryRepo.search({
        scope: filters.scope,
        activeOnly: true,
        archived: false,
        limit: 200,
    });
    const atRiskItems = allActiveMemories.filter((m) => {
        const lastTouched = m.timestamps.lastAccessedAt ?? m.timestamps.updatedAt;
        const touchedAt = lastTouched ? Date.parse(lastTouched) : 0;
        return touchedAt > 0 && touchedAt < atRiskCutoff && m.stats.accessCount < 2;
    }).slice(0, 5);
    const healthSample = input.memoryRepo.search({
        scope: filters.scope,
        activeOnly: true,
        archived: false,
        limit: 50,
    });
    const healthSampleCount = healthSample.length || 1;
    const totalMemories = memoryCount || 1;
    const allScopedMemories = input.memoryRepo.search({
        scope: filters.scope,
        limit: memoryCount > 0 ? memoryCount : 1,
    });
    const summaryCount = countsByType.summary ?? 0;
    const inferenceCount = allScopedMemories.filter((memory) => memory.source.kind === 'inference').length;
    const factCount = countsByType.fact ?? 0;
    const avgContentLength = healthSample.reduce((sum, memory) => sum + memory.content.length, 0) / healthSampleCount;
    const avgConfidence = healthSample.reduce((sum, memory) => sum + memory.scores.confidence, 0) / healthSampleCount;
    const pinnedCount = allScopedMemories.filter((memory) => memory.tags.includes('pinned')).length;
    const healthMetrics = {
        summaryToFactRatio: summaryCount / (factCount || 1),
        systemArtifactProportion: (summaryCount + inferenceCount) / totalMemories,
        avgContentLength,
        avgConfidence,
        pinnedCount,
    };
    const recentAutoCaptureItems = input.memoryRepo.search({
        scope: filters.scope,
        activeOnly: true,
        archived: false,
        limit: 200,
    })
        .filter((memory) => memory.tags.includes('auto_capture'))
        .sort((a, b) => b.timestamps.createdAt.localeCompare(a.timestamps.createdAt))
        .slice(0, 5)
        .map((memory) => ({
        id: memory.id,
        content: memory.content.length > AUTO_CAPTURE_PREVIEW_LENGTH
            ? `${memory.content.slice(0, AUTO_CAPTURE_PREVIEW_LENGTH - 1)}…`
            : memory.content,
        kind: memory.tags.find((tag) => tag !== 'auto_capture') ?? memory.type,
        createdAt: memory.timestamps.createdAt,
    }));
    const atRiskMemories = {
        count: atRiskItems.length,
        items: atRiskItems.map((m) => ({
            id: m.id,
            content: m.content.slice(0, 80),
            ageInDays: Math.floor((Date.now() - Date.parse(m.timestamps.updatedAt)) / (24 * 60 * 60 * 1000)),
            accessCount: m.stats.accessCount,
        })),
        nudge: atRiskItems.length > 0
            ? `${atRiskItems.length} memories will be archived soon. Access them or use evermemory_store to refresh.`
            : null,
    };
    const status = {
        schemaVersion,
        databasePath: input.database.path,
        scopeResolvedFrom,
        memoryCount,
        activeMemoryCount,
        archivedMemoryCount,
        semanticIndexCount,
        experienceCount,
        reflectionCount,
        activeRuleCount,
        profileCount,
        countsByType,
        countsByLifecycle,
        latestBriefing: latestBriefing
            ? {
                id: latestBriefing.id,
                generatedAt: latestBriefing.generatedAt,
                userId: latestBriefing.userId,
                sessionId: latestBriefing.sessionId,
            }
            : undefined,
        latestReflection: latestReflection
            ? {
                id: latestReflection.id,
                createdAt: latestReflection.createdAt,
                triggerKind: latestReflection.trigger.kind,
                confidence: latestReflection.evidence.confidence,
            }
            : undefined,
        latestRule: latestRule
            ? {
                id: latestRule.id,
                updatedAt: latestRule.updatedAt,
                category: latestRule.category,
                priority: latestRule.priority,
                confidence: latestRule.evidence.confidence,
            }
            : undefined,
        latestProfile: latestProfile
            ? {
                userId: latestProfile.userId,
                updatedAt: latestProfile.updatedAt,
                stableCanonicalFields: {
                    displayName: latestProfile.stable.displayName,
                    preferredAddress: latestProfile.stable.preferredAddress,
                    timezone: latestProfile.stable.timezone,
                    explicitPreferences: latestProfile.stable.explicitPreferences,
                    explicitConstraints: latestProfile.stable.explicitConstraints,
                },
                derivedWeakHints: {
                    communicationStyle: latestProfile.derived.communicationStyle,
                    likelyInterests: latestProfile.derived.likelyInterests,
                    workPatterns: latestProfile.derived.workPatterns,
                },
            }
            : undefined,
        latestWriteDecision: latestWriteEvent
            ? {
                createdAt: latestWriteEvent.createdAt,
                entityId: latestWriteEvent.entityId,
                accepted: toBoolean(latestWriteEvent.payload.accepted),
                reason: toString(latestWriteEvent.payload.reason),
                merged: toNumber(latestWriteEvent.payload.merged),
                archivedStale: toNumber(latestWriteEvent.payload.archivedStale),
                profileRecomputed: toBoolean(latestWriteEvent.payload.profileRecomputed),
            }
            : undefined,
        latestRetrieval: latestRetrievalEvent
            ? {
                createdAt: latestRetrievalEvent.createdAt,
                query: toString(latestRetrievalEvent.payload.query),
                requestedMode: toString(latestRetrievalEvent.payload.requestedMode),
                mode: toString(latestRetrievalEvent.payload.mode),
                returned: toNumber(latestRetrievalEvent.payload.returned),
                candidates: toNumber(latestRetrievalEvent.payload.candidates),
            }
            : undefined,
        latestProfileRecompute: latestProfileRecomputeEvent
            ? {
                createdAt: latestProfileRecomputeEvent.createdAt,
                userId: toString(latestProfileRecomputeEvent.payload.userId),
                memoryCount: toNumber(latestProfileRecomputeEvent.payload.memoryCount),
                stable: latestProfileRecomputeEvent.payload.stable,
                derived: latestProfileRecomputeEvent.payload.derived,
            }
            : undefined,
        recentDebugByKind,
        latestDebugEvents,
        continuityKpis: {
            sampleWindow: {
                sessionEndEvents: recentSessionEndEvents.length,
                retrievalEvents: recentRetrievalEvents.length,
            },
            autoMemory: {
                generated: autoMemoryGenerated,
                accepted: autoMemoryAccepted,
                rejected: autoMemoryRejected,
                acceptRate: autoMemoryAcceptRate,
                generatedByKind: autoMemoryGeneratedByKind,
                acceptedByKind: autoMemoryAcceptedByKind,
            },
            projectSummary: {
                generated: projectSummaryGenerated,
                accepted: projectSummaryAccepted,
                acceptRate: projectSummaryAcceptRate,
            },
            retrievalPolicy: {
                suppressedTestCandidates,
                retainedTestCandidates,
                projectRoutedExecutions,
                projectRoutedHits,
                projectRouteHitRate,
            },
        },
        runtimeSession: input.runtimeSession,
        recentDebugEvents,
        semanticStatus,
        atRiskMemories,
        // B4: Auto-capture quality feedback — surface lastRun + per-session counts
        autoCapture: {
            lastRun: recentSessionEndEvents[0]?.createdAt ?? null,
            capturedCount: autoMemoryAccepted,
            rejectedCount: autoMemoryRejected,
            topKinds: Object.entries(autoMemoryAcceptedByKind)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 3)
                .map(([kind]) => kind),
            recentItems: recentAutoCaptureItems,
        },
        healthMetrics,
        semanticHealth: {
            embeddingProvider: embeddingManager.providerKind,
            embeddingReady: embeddingManager.isReady(),
            indexedCount: semanticIndexCount,
            embeddingCount: (() => {
                try {
                    const row = input.database.connection.prepare('SELECT COUNT(*) as count FROM embedding_meta').get();
                    return row?.count ?? 0;
                }
                catch {
                    return 0;
                }
            })(),
            recentRetrievalModes: recentRetrievalEvents.slice(0, 5).map((event) => toString(event.payload.mode) ?? 'unknown'),
            recentSemanticHits: recentRetrievalEvents.slice(0, 5).map((event) => toNumber(event.payload.semanticHits) ?? 0),
        },
    };
    return {
        ...status,
        summary: buildStatusSummary(status),
    };
}
export function evermemoryStatusLayered(input) {
    const status = evermemoryStatus(input);
    if ((input.output ?? 'summary') === 'summary') {
        return status.summary ?? buildStatusSummary(status);
    }
    return status;
}
function toPercent(score) {
    return Math.round(Math.max(0, Math.min(1, score)) * 100);
}
function toTrend(trend) {
    if (trend === 'up') {
        return '↑';
    }
    if (trend === 'down') {
        return '↓';
    }
    return '→';
}
export function formatSmartnessReport(summary) {
    const lines = [
        `🧠 智能度评分：${toPercent(summary.overall)}/100`,
        ...summary.dimensions.flatMap((dimension, index) => {
            const prefix = index === summary.dimensions.length - 1 ? '  └─' : '  ├─';
            const mainLine = `${prefix} ${dimension.name}：${String(`${toPercent(dimension.score)}分`).padStart(6, ' ')} (${toTrend(dimension.trend)} ${dimension.description})`;
            if (dimension.score < 0.6 && dimension.advice) {
                const advicePrefix = index === summary.dimensions.length - 1 ? '     ' : '  │  ';
                return [mainLine, `${advicePrefix}  💡 ${dimension.advice}`];
            }
            return [mainLine];
        }),
    ];
    return lines.join('\n');
}
export async function evermemorySmartness(input) {
    const summary = await input.smartnessMetricsService.compute(input.userId);
    return formatSmartnessReport(summary);
}
