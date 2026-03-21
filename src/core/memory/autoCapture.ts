import type {
  ExperienceLog,
  IntentRecord,
  MemoryStoreInput,
  ReflectionRecord,
  SessionEndInput,
} from '../../types.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { SemanticRepository } from '../../storage/semanticRepo.js';
import type { MemoryService } from './service.js';
import type { ProfileProjectionService } from '../profile/projection.js';
import { embeddingManager } from '../../embedding/manager.js';
import { checkSemanticDuplicate } from './dedup.js';
import { detectConflicts, resolveConflict } from './conflict.js';
import {
  buildAutoMemoryCandidates,
  type AutoCaptureContext,
  type AutoMemoryCandidateKind,
  type EvaluatedAutoMemoryCandidate,
} from './autoCaptureEval.js';

export interface AutoCaptureResult {
  generated: number;
  accepted: number;
  rejected: number;
  storedIds: string[];
  rejectedReasons: string[];
  generatedByKind: Partial<Record<AutoMemoryCandidateKind, number>>;
  acceptedByKind: Partial<Record<AutoMemoryCandidateKind, number>>;
  acceptedIdsByKind: Partial<Record<AutoMemoryCandidateKind, string[]>>;
}

function countByKind(
  kinds: AutoMemoryCandidateKind[],
): Partial<Record<AutoMemoryCandidateKind, number>> {
  return kinds.reduce((acc, kind) => {
    acc[kind] = (acc[kind] ?? 0) + 1;
    return acc;
  }, {} as Partial<Record<AutoMemoryCandidateKind, number>>);
}

async function storeAutoMemoryCandidates(
  candidates: EvaluatedAutoMemoryCandidate[],
  input: SessionEndInput,
  memoryService: MemoryService,
  profileProjection?: ProfileProjectionService,
  semanticRepo?: SemanticRepository,
  memoryRepo?: MemoryRepository,
  dedupThreshold = 0.92,
): Promise<Omit<AutoCaptureResult, 'generatedByKind'>> {
  const acceptedByKind: Partial<Record<AutoMemoryCandidateKind, number>> = {};
  const acceptedIdsByKind: Partial<Record<AutoMemoryCandidateKind, string[]>> = {};
  const storedIds: string[] = [];
  const rejectedReasons: string[] = [];
  const touchedUserIds = new Set<string>();

  for (const candidate of candidates) {
    if (semanticRepo) {
      const dedup = await checkSemanticDuplicate(
        candidate.memory.content,
        candidate.kind,
        semanticRepo,
        {
          enabled: embeddingManager.isReady(),
          threshold: dedupThreshold,
        },
      );
      if (dedup.isDuplicate) {
        rejectedReasons.push(`duplicate:${dedup.existingId}:${dedup.similarity}`);
        continue;
      }
    }

    const result = memoryService.store(candidate.memory, input.scope, {
      skipProfileRecompute: true,
    });
    if (result.accepted && result.memory) {
      if (result.memory.scope.userId) {
        touchedUserIds.add(result.memory.scope.userId);
      }
      if (semanticRepo && memoryRepo) {
        const conflicts = await detectConflicts(
          result.memory.id,
          result.memory.content,
          semanticRepo,
          memoryRepo,
        );
        for (const conflict of conflicts) {
          await resolveConflict(conflict, memoryRepo);
        }
      }
      storedIds.push(result.memory.id);
      acceptedByKind[candidate.kind] = (acceptedByKind[candidate.kind] ?? 0) + 1;
      const ids = acceptedIdsByKind[candidate.kind] ?? [];
      ids.push(result.memory.id);
      acceptedIdsByKind[candidate.kind] = ids;
      continue;
    }
    rejectedReasons.push(result.reason);
  }

  if (profileProjection) {
    for (const userId of touchedUserIds) {
      profileProjection.recomputeForUser(userId);
    }
  }

  return {
    generated: candidates.length,
    accepted: storedIds.length,
    rejected: rejectedReasons.length,
    storedIds,
    rejectedReasons,
    acceptedByKind,
    acceptedIdsByKind,
  };
}

export async function processAutoCapture(
  input: SessionEndInput,
  context: AutoCaptureContext,
  memoryService: MemoryService,
  profileProjection?: ProfileProjectionService,
  semanticRepo?: SemanticRepository,
  memoryRepo?: MemoryRepository,
  dedupThreshold?: number,
): Promise<AutoCaptureResult> {
  const candidates = buildAutoMemoryCandidates(input, context);
  const generatedByKind = countByKind(candidates.map((candidate) => candidate.kind));
  return {
    ...(await storeAutoMemoryCandidates(
      candidates,
      input,
      memoryService,
      profileProjection,
      semanticRepo,
      memoryRepo,
      dedupThreshold,
    )),
    generatedByKind,
  };
}
