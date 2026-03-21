const DEFAULT_REVIEW_LIMIT = 30;
const MAX_REVIEW_LIMIT = 300;
const DEFAULT_RESTORE_LIFECYCLE = 'episodic';
const RESTORE_LIFECYCLES = [
    'working',
    'episodic',
    'semantic',
];
function nowIso() {
    return new Date().toISOString();
}
function isValidReviewLimit(value) {
    return typeof value === 'number' && Number.isFinite(value);
}
function clampReviewLimit(limit) {
    if (!isValidReviewLimit(limit)) {
        return DEFAULT_REVIEW_LIMIT;
    }
    return Math.max(1, Math.min(Math.floor(limit), MAX_REVIEW_LIMIT));
}
function normalizeContent(content) {
    const normalized = content.trim().replace(/\s+/g, ' ');
    if (normalized.length <= 120) {
        return normalized;
    }
    return `${normalized.slice(0, 117)}...`;
}
function normalizeIds(ids) {
    const deduped = new Set();
    for (const rawId of ids) {
        const id = rawId.trim();
        if (id.length > 0) {
            deduped.add(id);
        }
    }
    return Array.from(deduped);
}
function isRestoreLifecycle(value) {
    return typeof value === 'string' && RESTORE_LIFECYCLES.includes(value);
}
function emptyRestoreResult(mode, approved, targetLifecycle) {
    return {
        mode,
        approved,
        applied: false,
        total: 0,
        restorable: 0,
        restored: 0,
        targetLifecycle,
        rejected: [],
    };
}
export class MemoryArchiveService {
    memoryRepo;
    debugRepo;
    semanticEnabled;
    semanticRepo;
    profileService;
    constructor(memoryRepo, debugRepo, options = {}) {
        this.memoryRepo = memoryRepo;
        this.debugRepo = debugRepo;
        this.semanticEnabled = options.semanticEnabled ?? false;
        this.semanticRepo = options.semanticRepo;
        this.profileService = options.profileService;
    }
    reviewArchived(input = {}) {
        const limit = clampReviewLimit(input.limit);
        const includeSuperseded = input.includeSuperseded ?? false;
        const query = input.query?.trim();
        const memories = this.memoryRepo.search({
            scope: input.scope,
            query: query && query.length > 0 ? query : undefined,
            archived: true,
            limit,
        });
        const candidates = memories
            .filter((memory) => includeSuperseded || !memory.state.supersededBy)
            .map((memory) => {
            const supersededBy = memory.state.supersededBy;
            return {
                id: memory.id,
                content: normalizeContent(memory.content),
                type: memory.type,
                lifecycle: memory.lifecycle,
                scope: memory.scope,
                updatedAt: memory.timestamps.updatedAt,
                supersededBy,
                restoreEligible: !supersededBy,
                reason: supersededBy ? 'superseded_by_newer_memory' : undefined,
            };
        });
        this.debugRepo?.log('memory_restore_reviewed', undefined, {
            source: 'evermemory_review',
            total: candidates.length,
            includeSuperseded,
            scope: input.scope,
            query,
            limit,
            candidateIds: candidates.map((candidate) => candidate.id),
        });
        return {
            total: candidates.length,
            candidates,
        };
    }
    restoreArchived(input) {
        const mode = input.mode ?? 'review';
        const approved = input.approved ?? false;
        const targetLifecycleInput = input.targetLifecycle ?? DEFAULT_RESTORE_LIFECYCLE;
        const allowSuperseded = input.allowSuperseded ?? false;
        const ids = normalizeIds(input.ids ?? []);
        if (!isRestoreLifecycle(targetLifecycleInput)) {
            const invalid = emptyRestoreResult(mode, approved, DEFAULT_RESTORE_LIFECYCLE);
            invalid.rejected.push({ reason: 'invalid_target_lifecycle' });
            this.debugRepo?.log('memory_restore_reviewed', undefined, {
                mode,
                approved,
                applied: false,
                reason: 'invalid_target_lifecycle',
                requestedIds: ids,
            });
            return invalid;
        }
        const targetLifecycle = targetLifecycleInput;
        const base = emptyRestoreResult(mode, approved, targetLifecycle);
        if (ids.length === 0) {
            base.rejected.push({ reason: 'no_ids' });
            this.debugRepo?.log('memory_restore_reviewed', undefined, {
                mode,
                approved,
                applied: false,
                reason: 'no_ids',
                targetLifecycle,
                requestedIds: ids,
            });
            return base;
        }
        const candidates = [];
        for (const id of ids) {
            const memory = this.memoryRepo.findById(id);
            if (!memory) {
                base.rejected.push({ id, reason: 'not_found' });
                continue;
            }
            if (!memory.state.archived) {
                base.rejected.push({ id, reason: 'not_archived' });
                continue;
            }
            if (memory.state.supersededBy && !allowSuperseded) {
                base.rejected.push({ id, reason: 'superseded_requires_allow_superseded' });
                continue;
            }
            candidates.push({ memory });
        }
        const restorableIds = candidates.map((candidate) => candidate.memory.id);
        if (mode === 'review' || !approved) {
            const result = {
                mode,
                approved,
                applied: false,
                total: ids.length,
                restorable: candidates.length,
                restored: 0,
                targetLifecycle,
                rejected: base.rejected,
            };
            if (mode === 'apply' && !approved) {
                result.rejected = [
                    ...result.rejected,
                    { reason: 'approval_required_for_apply' },
                ];
            }
            this.debugRepo?.log('memory_restore_reviewed', undefined, {
                source: 'evermemory_restore',
                mode,
                approved,
                applied: false,
                total: result.total,
                restorable: result.restorable,
                rejected: result.rejected.length,
                targetLifecycle,
                allowSuperseded,
                requestedIds: ids,
                restorableIds,
            });
            return result;
        }
        const touchedUsers = new Set();
        let restored = 0;
        const restoredIds = [];
        const restoredByType = {};
        const appliedAt = nowIso();
        for (const candidate of candidates) {
            restoredByType[candidate.memory.type] = (restoredByType[candidate.memory.type] ?? 0) + 1;
            const updated = {
                ...candidate.memory,
                lifecycle: targetLifecycle,
                timestamps: {
                    ...candidate.memory.timestamps,
                    updatedAt: nowIso(),
                },
                state: {
                    ...candidate.memory.state,
                    active: true,
                    archived: false,
                    supersededBy: undefined,
                },
            };
            this.memoryRepo.update(updated);
            restored += 1;
            if (this.semanticEnabled && this.semanticRepo) {
                this.semanticRepo.upsertFromMemory(updated);
            }
            if (updated.scope.userId) {
                touchedUsers.add(updated.scope.userId);
            }
            restoredIds.push(updated.id);
        }
        if (this.profileService) {
            for (const userId of touchedUsers) {
                this.profileService.recomputeForUser(userId);
            }
        }
        const result = {
            mode,
            approved,
            applied: true,
            appliedAt,
            total: ids.length,
            restorable: candidates.length,
            restored,
            targetLifecycle,
            rejected: base.rejected,
            userImpact: {
                affectedUserIds: Array.from(touchedUsers),
                restoredByType,
            },
        };
        this.debugRepo?.log('memory_restore_applied', undefined, {
            mode,
            approved,
            applied: true,
            total: result.total,
            restorable: result.restorable,
            restored: result.restored,
            rejected: result.rejected.length,
            targetLifecycle,
            allowSuperseded,
            requestedIds: ids,
            restorableIds,
            restoredIds,
            appliedAt,
            userImpact: result.userImpact,
        });
        return result;
    }
}
