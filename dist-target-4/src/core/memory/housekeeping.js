import { STALE_THRESHOLD_DAYS_PRIMARY, STALE_THRESHOLD_DAYS_DERIVED, STALE_THRESHOLD_DAYS_INFERRED, ARCHIVE_PROTECTION_MIN_RETRIEVALS, MAX_SUMMARY_PER_PROJECT, MAX_PROJECT_PER_PROJECT, } from '../../tuning/memory.js';
export const DEFAULT_CONFIG = {
    staleThresholdDays: 30,
    highFrequencyThreshold: 5,
    mergeSimThreshold: 0.88,
    maxMergePerRun: 10,
    debugEventRetentionDays: 30,
    intentRecordRetentionDays: 14,
    bootBriefingRetentionDays: 60,
    experienceLogRetentionDays: 30,
    reflectionRecordRetentionDays: 60,
};
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Upper bound when fetching all memories of a type for kind-limit enforcement */
const KIND_LIMIT_FETCH_MAX = 10_000;
function nowIso() {
    return new Date().toISOString();
}
function parseIso(value) {
    if (!value) {
        return 0;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}
function toArchived(memory, updatedAt, supersededBy) {
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
    };
}
function reinforce(memory, updatedAt) {
    return {
        ...memory,
        scores: {
            ...memory.scores,
            importance: Math.min(1, Number((memory.scores.importance + 0.1).toFixed(4))),
        },
        timestamps: {
            ...memory.timestamps,
            updatedAt,
        },
    };
}
export class MemoryHousekeepingService {
    memoryRepo;
    lifecycleService;
    config;
    debugRepo;
    db;
    semanticRepo;
    constructor(memoryRepo, lifecycleService, config = DEFAULT_CONFIG, debugRepo, db, semanticRepo) {
        this.memoryRepo = memoryRepo;
        this.lifecycleService = lifecycleService;
        this.config = config;
        this.debugRepo = debugRepo;
        this.db = db;
        this.semanticRepo = semanticRepo;
    }
    run(scope) {
        const startedAt = Date.now();
        const candidates = this.memoryRepo.search({
            scope,
            activeOnly: true,
            archived: false,
            limit: 500,
        });
        const mergedCount = this.mergeNearDuplicates(candidates);
        const archivedCount = this.archiveStale(scope);
        const reinforcedCount = this.reinforceHighFrequency(scope);
        const kindLimitArchivedCount = this.enforceKindLimits(scope);
        // A7: Prune old records to prevent DB bloat
        const prunedDebugEvents = this.pruneTable('debug_events', 'created_at', this.config.debugEventRetentionDays ?? 30, 'prune_debug_events');
        const prunedIntentRecords = this.pruneTable('intent_records', 'created_at', this.config.intentRecordRetentionDays ?? 14, 'prune_intent_records');
        const prunedBootBriefings = this.pruneTable('boot_briefings', 'generated_at', this.config.bootBriefingRetentionDays ?? 60, 'prune_boot_briefings');
        const prunedExperienceLogs = this.pruneTable('experience_logs', 'created_at', this.config.experienceLogRetentionDays ?? 30, 'prune_experience_logs');
        const prunedReflectionRecords = this.pruneTable('reflection_records', 'created_at', this.config.reflectionRecordRetentionDays ?? 60, 'prune_reflection_records');
        return {
            mergedCount,
            archivedCount,
            reinforcedCount,
            kindLimitArchivedCount,
            durationMs: Date.now() - startedAt,
            prunedDebugEvents,
            prunedIntentRecords,
            prunedBootBriefings,
            prunedExperienceLogs,
            prunedReflectionRecords,
        };
    }
    /** Shared helper: delete rows older than retentionDays from any date-stamped table. */
    pruneTable(table, column, retentionDays, errorLabel) {
        if (!this.db)
            return 0;
        const cutoffIso = new Date(Date.now() - retentionDays * MS_PER_DAY).toISOString();
        try {
            const result = this.db.connection.prepare(`DELETE FROM ${table} WHERE ${column} < ?`).run(cutoffIso);
            return result.changes;
        }
        catch (error) {
            this.debugRepo?.log('housekeeping_error', errorLabel, {
                error: error instanceof Error ? error.message : String(error),
            });
            return 0;
        }
    }
    /** Shared helper: remove a memory from the semantic index, logging on failure. */
    deleteFromIndexBestEffort(memoryId, errorLabel) {
        if (!this.semanticRepo)
            return;
        try {
            this.semanticRepo.deleteFromIndex(memoryId);
        }
        catch (error) {
            this.debugRepo?.log('housekeeping_error', errorLabel, {
                memoryId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    async runIfNeeded(scope, lastRunAt) {
        const lastRunTs = parseIso(lastRunAt);
        if (lastRunTs > 0 && (Date.now() - lastRunTs) < 24 * 60 * 60 * 1000) {
            return null;
        }
        return Promise.resolve(this.run(scope));
    }
    mergeNearDuplicates(candidates) {
        let merged = 0;
        const seenArchived = new Set();
        for (let index = 0; index < candidates.length; index += 1) {
            const current = candidates[index];
            if (!current || seenArchived.has(current.id) || merged >= this.config.maxMergePerRun) {
                continue;
            }
            for (let offset = index + 1; offset < candidates.length; offset += 1) {
                const candidate = candidates[offset];
                if (!candidate || seenArchived.has(candidate.id) || current.type !== candidate.type) {
                    continue;
                }
                const score = this.lifecycleService.scoreNearDuplicate(current.content, candidate.content);
                if (score < this.config.mergeSimThreshold) {
                    continue;
                }
                const kept = this.lifecycleService.preferMemory(current, candidate);
                const archived = kept.id === current.id ? candidate : current;
                this.memoryRepo.update(toArchived(archived, nowIso(), kept.id));
                seenArchived.add(archived.id);
                merged += 1;
                break;
            }
        }
        return merged;
    }
    archiveStale(scope) {
        const candidates = this.memoryRepo.search({
            scope,
            activeOnly: true,
            archived: false,
            limit: 500,
        });
        // RC3: Precompute per-grade cutoffs once (not per-memory) to avoid 500× Date.now() calls
        const nowMs = Date.now();
        const cutoffs = {
            primary: nowMs - STALE_THRESHOLD_DAYS_PRIMARY * MS_PER_DAY,
            derived: nowMs - STALE_THRESHOLD_DAYS_DERIVED * MS_PER_DAY,
            inferred: nowMs - STALE_THRESHOLD_DAYS_INFERRED * MS_PER_DAY,
        };
        let archived = 0;
        for (const memory of candidates) {
            const lastTouchedAt = parseIso(memory.timestamps.lastAccessedAt ?? memory.timestamps.updatedAt);
            const cutoff = cutoffs[memory.sourceGrade] ?? cutoffs.primary;
            // RC3: Use retrievalCount (explicit recalls only) — briefing accesses excluded
            if (memory.tags.includes('pinned') ||
                lastTouchedAt <= 0 ||
                lastTouchedAt > cutoff ||
                memory.stats.retrievalCount >= ARCHIVE_PROTECTION_MIN_RETRIEVALS) {
                continue;
            }
            this.memoryRepo.update(toArchived(memory, nowIso()));
            this.deleteFromIndexBestEffort(memory.id, 'archive_stale_semantic_index');
            archived += 1;
        }
        return archived;
    }
    /**
     * RC3: Enforce per-project count limits on summary and project memory types.
     * Archives oldest excess memories when limits are exceeded.
     */
    enforceKindLimits(scope) {
        const LIMITS = [
            { type: 'summary', max: MAX_SUMMARY_PER_PROJECT },
            { type: 'project', max: MAX_PROJECT_PER_PROJECT },
        ];
        let archived = 0;
        for (const { type, max } of LIMITS) {
            // Fetch all of this type to ensure we archive every excess, not just the first 50
            const candidates = this.memoryRepo.search({
                scope,
                types: [type],
                activeOnly: true,
                archived: false,
                limit: KIND_LIMIT_FETCH_MAX,
            });
            if (candidates.length <= max) {
                continue;
            }
            // Sort oldest first (by createdAt ascending) — archive the excess
            const sorted = [...candidates].sort((a, b) => parseIso(a.timestamps.createdAt) - parseIso(b.timestamps.createdAt));
            const excess = sorted.slice(0, candidates.length - max);
            for (const memory of excess) {
                this.memoryRepo.update(toArchived(memory, nowIso()));
                this.deleteFromIndexBestEffort(memory.id, 'kind_limit_semantic_index');
                archived += 1;
            }
        }
        return archived;
    }
    reinforceHighFrequency(scope) {
        const candidates = this.memoryRepo.search({
            scope,
            activeOnly: true,
            archived: false,
            limit: 500,
        });
        let reinforced = 0;
        for (const memory of candidates) {
            if (memory.stats.accessCount < this.config.highFrequencyThreshold || memory.scores.importance >= 1) {
                continue;
            }
            this.memoryRepo.update(reinforce(memory, nowIso()));
            reinforced += 1;
        }
        return reinforced;
    }
}
