import type { DatabaseHandle } from '../storage/db.js';
import type { BehaviorRepository } from '../storage/behaviorRepo.js';
import type { BriefingRepository } from '../storage/briefingRepo.js';
import type { DebugRepository } from '../storage/debugRepo.js';
import type { ExperienceRepository } from '../storage/experienceRepo.js';
import type { MemoryRepository } from '../storage/memoryRepo.js';
import type { ProfileRepository } from '../storage/profileRepo.js';
import type { ReflectionRepository } from '../storage/reflectionRepo.js';
import type { SemanticRepository } from '../storage/semanticRepo.js';
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
        }
      : undefined,
    recentDebugByKind,
    latestDebugEvents,
    runtimeSession: input.runtimeSession,
    recentDebugEvents,
  };
}
