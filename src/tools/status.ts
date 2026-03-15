import type { DatabaseHandle } from '../storage/db.js';
import type { BehaviorRepository } from '../storage/behaviorRepo.js';
import type { BriefingRepository } from '../storage/briefingRepo.js';
import type { DebugRepository } from '../storage/debugRepo.js';
import type { ExperienceRepository } from '../storage/experienceRepo.js';
import type { MemoryRepository } from '../storage/memoryRepo.js';
import type { ProfileRepository } from '../storage/profileRepo.js';
import type { ReflectionRepository } from '../storage/reflectionRepo.js';
import type { SemanticRepository } from '../storage/semanticRepo.js';
import type { SmartnessMetricsService, SmartnessSummary } from '../core/analytics/smartnessMetrics.js';
import { getSchemaVersion } from '../storage/migrations.js';
import type { EverMemoryStatusToolResult, RuntimeSessionContext } from '../types.js';

export function evermemoryStatus(input: {
  database: DatabaseHandle;
  memoryRepo: MemoryRepository;
  briefingRepo: BriefingRepository;
  debugRepo: DebugRepository;
  experienceRepo: ExperienceRepository;
  reflectionRepo: ReflectionRepository;
  behaviorRepo: BehaviorRepository;
  semanticRepo: SemanticRepository;
  profileRepo: ProfileRepository;
  runtimeSession?: RuntimeSessionContext;
  userId?: string;
  sessionId?: string;
}): EverMemoryStatusToolResult {
  function toNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
  }

  function toString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  function toBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  function toRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return value as Record<string, unknown>;
  }

  const effectiveUserId = input.userId ?? input.runtimeSession?.scope.userId;
  const filters = {
    scope: input.userId || input.sessionId
      ? {
          userId: effectiveUserId,
        }
      : undefined,
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
  }, {} as NonNullable<EverMemoryStatusToolResult['recentDebugByKind']>);
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
  const autoMemoryGeneratedByKind: Record<string, number> = {};
  const autoMemoryAcceptedByKind: Record<string, number> = {};

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

  return {
    schemaVersion,
    databasePath: input.database.path,
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
          stable: latestProfileRecomputeEvent.payload.stable as NonNullable<EverMemoryStatusToolResult['latestProfileRecompute']>['stable'],
          derived: latestProfileRecomputeEvent.payload.derived as NonNullable<EverMemoryStatusToolResult['latestProfileRecompute']>['derived'],
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
  };
}

function toPercent(score: number): number {
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}

function toTrend(trend: SmartnessSummary['dimensions'][number]['trend']): string {
  if (trend === 'up') {
    return '↑';
  }
  if (trend === 'down') {
    return '↓';
  }
  return '→';
}

export function formatSmartnessReport(summary: SmartnessSummary): string {
  const lines = [
    `🧠 智能度评分：${toPercent(summary.overall)}/100`,
    ...summary.dimensions.map((dimension, index) => {
      const prefix = index === summary.dimensions.length - 1 ? '  └─' : '  ├─';
      return `${prefix} ${dimension.name}：${String(`${toPercent(dimension.score)}分`).padStart(6, ' ')} (${toTrend(dimension.trend)} ${dimension.description})`;
    }),
  ];
  return lines.join('\n');
}

export async function evermemorySmartness(input: {
  smartnessMetricsService: SmartnessMetricsService;
  userId?: string;
}): Promise<string> {
  const summary = await input.smartnessMetricsService.compute(input.userId);
  return formatSmartnessReport(summary);
}
