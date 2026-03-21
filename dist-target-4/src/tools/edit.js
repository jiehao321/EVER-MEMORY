import { randomUUID } from 'node:crypto';
import { embeddingManager } from '../embedding/manager.js';
function nowIso() {
    return new Date().toISOString();
}
function hasCallerAccess(memory, callerScope) {
    if (!callerScope || callerScope.userId === undefined) {
        return true;
    }
    const memUserId = memory.scope?.userId;
    return memUserId === undefined || memUserId === callerScope.userId;
}
function sameScope(left, right) {
    return left.userId === right.userId
        && left.chatId === right.chatId
        && left.project === right.project
        && Boolean(left.global) === Boolean(right.global);
}
function uniqueStrings(...groups) {
    return [...new Set(groups.flatMap((group) => group))];
}
function archiveMemory(memory, updatedAt, supersededBy, tag) {
    return {
        ...memory,
        lifecycle: 'archive',
        timestamps: {
            ...memory.timestamps,
            updatedAt,
        },
        state: {
            ...memory.state,
            active: false,
            archived: true,
            supersededBy,
        },
        tags: tag && !memory.tags.includes(tag) ? [...memory.tags, tag] : [...memory.tags],
    };
}
function toSummary(memory) {
    return {
        id: memory.id,
        content: memory.content,
        type: memory.type,
        lifecycle: memory.lifecycle,
    };
}
function deleteFromIndexBestEffort(semanticRepo, debugRepo, memoryId, action) {
    if (!semanticRepo) {
        return;
    }
    try {
        semanticRepo.deleteFromIndex(memoryId);
    }
    catch (error) {
        debugRepo.log('housekeeping_error', action, {
            memoryId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
export async function evermemoryEdit(memoryRepo, debugRepo, semanticRepo, input, callerScope) {
    const memory = memoryRepo.findById(input.memoryId);
    if (!memory) {
        return {
            success: false,
            error: `Memory not found: ${input.memoryId}`,
            previous: null,
            current: null,
        };
    }
    if (!hasCallerAccess(memory, callerScope)) {
        return {
            success: false,
            error: `Access denied: memory does not belong to the current session scope`,
            previous: null,
            current: null,
        };
    }
    const previous = toSummary(memory);
    const timestamp = nowIso();
    if (input.action === 'merge') {
        const mergeWithId = input.mergeWithId?.trim();
        if (!mergeWithId) {
            return { success: false, error: 'mergeWithId is required for merge action', previous, current: null };
        }
        if (mergeWithId === memory.id) {
            return { success: false, error: 'mergeWithId must be different from memoryId', previous, current: null };
        }
        const mergeWithMemory = memoryRepo.findById(mergeWithId);
        if (!mergeWithMemory) {
            return { success: false, error: `Memory not found: ${mergeWithId}`, previous, current: null };
        }
        if (!hasCallerAccess(mergeWithMemory, callerScope)) {
            return {
                success: false,
                error: 'Access denied: merge target does not belong to the current session scope',
                previous,
                current: null,
            };
        }
        if (!sameScope(memory.scope, mergeWithMemory.scope)) {
            return {
                success: false,
                error: 'Cannot merge memories from different scopes',
                previous,
                current: null,
            };
        }
        const mergedContent = (input.newContent ?? '').trim() || `${memory.content}\n\n${mergeWithMemory.content}`;
        const newId = randomUUID();
        const primary = memory.scores.importance >= mergeWithMemory.scores.importance ? memory : mergeWithMemory;
        const merged = {
            ...primary,
            id: newId,
            content: mergedContent,
            timestamps: {
                createdAt: timestamp,
                updatedAt: timestamp,
            },
            scores: {
                confidence: Math.max(memory.scores.confidence, mergeWithMemory.scores.confidence),
                importance: Math.max(memory.scores.importance, mergeWithMemory.scores.importance),
                explicitness: Math.max(memory.scores.explicitness, mergeWithMemory.scores.explicitness),
            },
            state: {
                active: true,
                archived: false,
            },
            evidence: {
                excerpt: primary.evidence.excerpt ?? memory.evidence.excerpt ?? mergeWithMemory.evidence.excerpt,
                references: uniqueStrings(memory.evidence.references ?? [], mergeWithMemory.evidence.references ?? []),
            },
            tags: uniqueStrings(memory.tags, mergeWithMemory.tags),
            relatedEntities: uniqueStrings(memory.relatedEntities, mergeWithMemory.relatedEntities),
            stats: {
                accessCount: 0,
                retrievalCount: 0,
            },
        };
        const archivedSource = archiveMemory(memory, timestamp, newId, 'superseded_by_user');
        const archivedMerged = archiveMemory(mergeWithMemory, timestamp, newId, 'superseded_by_user');
        memoryRepo.transaction(() => {
            memoryRepo.insert(merged);
            memoryRepo.update(archivedSource);
            memoryRepo.update(archivedMerged);
        });
        void generateEmbeddingAsync(semanticRepo, newId, mergedContent);
        debugRepo.log('memory_merged', newId, {
            action: 'user_merge',
            sourceMemoryId: memory.id,
            mergedWithId: mergeWithMemory.id,
            reason: input.reason ?? 'user_merge',
        });
        return { success: true, previous, current: toSummary(merged) };
    }
    if (input.action === 'delete') {
        const deleted = archiveMemory(memory, timestamp, memory.state.supersededBy, 'deleted_by_user');
        memoryRepo.update(deleted);
        deleteFromIndexBestEffort(semanticRepo, debugRepo, memory.id, 'edit_delete_semantic_index');
        debugRepo.log('memory_archived', memory.id, {
            action: 'user_delete',
            reason: input.reason ?? 'user_requested',
        });
        return { success: true, previous, current: null };
    }
    if (input.action === 'update' || input.action === 'correct') {
        const newContent = (input.newContent ?? '').trim();
        if (!newContent) {
            return { success: false, error: 'newContent is required for update/correct actions', previous, current: null };
        }
        if (input.action === 'correct') {
            // For 'correct': supersede old version with new one
            const newId = randomUUID();
            const corrected = {
                ...memory,
                id: newId,
                content: newContent,
                timestamps: { ...memory.timestamps, createdAt: timestamp, updatedAt: timestamp },
                state: { ...memory.state, active: true, archived: false },
                stats: { accessCount: 0, retrievalCount: 0 },
            };
            const superseded = archiveMemory(memory, timestamp, newId, 'superseded_by_user');
            memoryRepo.transaction(() => {
                memoryRepo.insert(corrected);
                memoryRepo.update(superseded);
            });
            deleteFromIndexBestEffort(semanticRepo, debugRepo, memory.id, 'edit_correct_semantic_index');
            // Re-embed the new memory
            void generateEmbeddingAsync(semanticRepo, newId, newContent);
            debugRepo.log('memory_write_decision', newId, {
                action: 'user_correct',
                reason: input.reason ?? 'user_correction',
                supersedes: memory.id,
            });
            return { success: true, previous, current: toSummary(corrected) };
        }
        // Regular update: modify content in-place
        const updated = {
            ...memory,
            content: newContent,
            timestamps: { ...memory.timestamps, updatedAt: timestamp },
        };
        memoryRepo.update(updated);
        // Re-embed updated content
        void generateEmbeddingAsync(semanticRepo, memory.id, newContent);
        debugRepo.log('memory_write_decision', memory.id, {
            action: 'user_update',
            reason: input.reason ?? 'user_edit',
        });
        return { success: true, previous, current: toSummary(updated) };
    }
    if (input.action === 'pin' || input.action === 'unpin') {
        const isPin = input.action === 'pin';
        const hasPinnedTag = memory.tags.includes('pinned');
        const tags = isPin
            ? (hasPinnedTag ? [...memory.tags] : [...memory.tags, 'pinned'])
            : memory.tags.filter((tag) => tag !== 'pinned');
        const delta = isPin ? 0.15 : -0.15;
        const nextImportance = Number(Math.max(0, Math.min(1, memory.scores.importance + delta)).toFixed(4));
        const updated = {
            ...memory,
            tags,
            scores: {
                ...memory.scores,
                importance: nextImportance,
            },
            timestamps: {
                ...memory.timestamps,
                updatedAt: timestamp,
            },
        };
        memoryRepo.update(updated);
        debugRepo.log('memory_write_decision', memory.id, {
            action: isPin ? 'user_pin' : 'user_unpin',
            reason: input.reason ?? (isPin ? 'user_pin' : 'user_unpin'),
            importanceBefore: memory.scores.importance,
            importanceAfter: updated.scores.importance,
        });
        return { success: true, previous, current: toSummary(updated) };
    }
    return { success: false, error: `Unknown action: ${String(input.action)}`, previous, current: null };
}
async function generateEmbeddingAsync(semanticRepo, memoryId, content) {
    if (!semanticRepo || !embeddingManager.isReady()) {
        return;
    }
    try {
        const vector = await embeddingManager.embed(content);
        if (vector) {
            await semanticRepo.storeEmbedding(memoryId, vector.values, embeddingManager.providerKind);
        }
    }
    catch {
        // best-effort embedding
    }
}
