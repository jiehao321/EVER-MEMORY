import { embeddingManager } from '../../embedding/manager.js';
import { checkSemanticDuplicate } from './dedup.js';
import { detectConflicts, resolveConflict } from './conflict.js';
import { buildAutoMemoryCandidates, } from './autoCaptureEval.js';
function countByKind(kinds) {
    return kinds.reduce((acc, kind) => {
        acc[kind] = (acc[kind] ?? 0) + 1;
        return acc;
    }, {});
}
async function storeAutoMemoryCandidates(candidates, input, memoryService, profileProjection, semanticRepo, memoryRepo, dedupThreshold = 0.92) {
    const acceptedByKind = {};
    const acceptedIdsByKind = {};
    const storedIds = [];
    const rejectedReasons = [];
    const touchedUserIds = new Set();
    for (const candidate of candidates) {
        if (semanticRepo) {
            const dedup = await checkSemanticDuplicate(candidate.memory.content, candidate.kind, semanticRepo, {
                enabled: embeddingManager.isReady(),
                threshold: dedupThreshold,
            });
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
                const conflicts = await detectConflicts(result.memory.id, result.memory.content, semanticRepo, memoryRepo);
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
export async function processAutoCapture(input, context, memoryService, profileProjection, semanticRepo, memoryRepo, dedupThreshold) {
    const candidates = buildAutoMemoryCandidates(input, context);
    const generatedByKind = countByKind(candidates.map((candidate) => candidate.kind));
    return {
        ...(await storeAutoMemoryCandidates(candidates, input, memoryService, profileProjection, semanticRepo, memoryRepo, dedupThreshold)),
        generatedByKind,
    };
}
