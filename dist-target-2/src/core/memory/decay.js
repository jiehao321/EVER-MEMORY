import { DECAY_FREQUENCY_LOG_DIVISOR, DECAY_LAST_ACCESSED_HALF_LIFE_DAYS, DECAY_RECENCY_HALF_LIFE_DAYS, LIFECYCLE_STABILITY_SCORES, } from '../../tuning.js';
export const DEFAULT_DECAY_WEIGHTS = {
    recency: 0.20,
    lastAccessed: 0.15,
    retrievalFrequency: 0.15,
    accessFrequency: 0.10,
    importance: 0.15,
    confidence: 0.10,
    explicitness: 0.05,
    lifecycleStability: 0.05,
    supersededPenalty: 0.05,
};
const LIFECYCLE_STABILITY = LIFECYCLE_STABILITY_SCORES;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function parseTimestamp(iso) {
    const value = Date.parse(iso);
    return Number.isFinite(value) ? value : 0;
}
function normalizeScore(value, min, max) {
    if (max <= min) {
        return 0;
    }
    const normalized = (value - min) / (max - min);
    return Math.max(0, Math.min(1, normalized));
}
/**
 * Calculate recency score based on how recently the memory was updated.
 * More recent = higher score (should keep).
 *
 * @param updatedAt - ISO timestamp of last update
 * @param nowMs - Current timestamp in milliseconds
 * @returns Score from 0.0 (very old) to 1.0 (very recent)
 */
function calculateRecencyScore(updatedAt, nowMs) {
    const updatedMs = parseTimestamp(updatedAt);
    if (updatedMs <= 0) {
        return 0;
    }
    const ageMs = nowMs - updatedMs;
    const ageDays = ageMs / MS_PER_DAY;
    return Math.exp(-ageDays / DECAY_RECENCY_HALF_LIFE_DAYS);
}
/**
 * Calculate last accessed score based on how recently the memory was accessed.
 * More recently accessed = higher score (should keep).
 *
 * @param lastAccessedAt - ISO timestamp of last access (optional)
 * @param nowMs - Current timestamp in milliseconds
 * @returns Score from 0.0 (never/long ago) to 1.0 (very recent)
 */
function calculateLastAccessedScore(lastAccessedAt, nowMs) {
    if (!lastAccessedAt) {
        return 0;
    }
    const accessedMs = parseTimestamp(lastAccessedAt);
    if (accessedMs <= 0) {
        return 0;
    }
    const ageMs = nowMs - accessedMs;
    const ageDays = ageMs / MS_PER_DAY;
    return Math.exp(-ageDays / DECAY_LAST_ACCESSED_HALF_LIFE_DAYS);
}
/**
 * Calculate retrieval frequency score based on how often the memory has been retrieved.
 * More retrievals = higher score (should keep).
 *
 * @param retrievalCount - Number of times retrieved
 * @returns Score from 0.0 (never) to 1.0 (frequently)
 */
function calculateRetrievalFrequencyScore(retrievalCount) {
    if (retrievalCount <= 0) {
        return 0;
    }
    return Math.log10(retrievalCount + 1) / DECAY_FREQUENCY_LOG_DIVISOR;
}
/**
 * Calculate access frequency score based on how often the memory has been accessed.
 * More accesses = higher score (should keep).
 *
 * @param accessCount - Number of times accessed
 * @returns Score from 0.0 (never) to 1.0 (frequently)
 */
function calculateAccessFrequencyScore(accessCount) {
    if (accessCount <= 0) {
        return 0;
    }
    return Math.log10(accessCount + 1) / DECAY_FREQUENCY_LOG_DIVISOR;
}
/**
 * Calculate lifecycle stability score.
 * Semantic memories are more stable (should keep).
 * Working memories are less stable (can decay faster).
 *
 * @param lifecycle - Memory lifecycle
 * @returns Score from 0.0 (unstable) to 1.0 (stable)
 */
function calculateLifecycleStabilityScore(lifecycle) {
    return LIFECYCLE_STABILITY[lifecycle];
}
/**
 * Calculate superseded penalty.
 * Superseded memories should decay faster.
 *
 * @param supersededBy - ID of superseding memory (if any)
 * @returns Score from 0.0 (superseded) to 1.0 (not superseded)
 */
function calculateSupersededScore(supersededBy) {
    return supersededBy ? 0 : 1;
}
/**
 * Calculate comprehensive decay score for a memory item.
 *
 * Score interpretation:
 * - 1.0: Should definitely keep (high value, recent, frequently used)
 * - 0.5: Neutral (moderate value, some usage)
 * - 0.0: Should decay/archive (low value, old, never used)
 *
 * @param memory - Memory item to score
 * @param weights - Decay weights configuration (optional)
 * @param nowMs - Current timestamp in milliseconds (optional, defaults to Date.now())
 * @returns Decay score from 0.0 (should decay) to 1.0 (should keep)
 */
export function calculateDecayScore(memory, weights = {}, nowMs = Date.now()) {
    const w = { ...DEFAULT_DECAY_WEIGHTS, ...weights };
    const recencyScore = calculateRecencyScore(memory.timestamps.updatedAt, nowMs);
    const lastAccessedScore = calculateLastAccessedScore(memory.timestamps.lastAccessedAt, nowMs);
    const retrievalFrequencyScore = calculateRetrievalFrequencyScore(memory.stats.retrievalCount);
    const accessFrequencyScore = calculateAccessFrequencyScore(memory.stats.accessCount);
    const importanceScore = memory.scores.importance;
    const confidenceScore = memory.scores.confidence;
    const explicitnessScore = memory.scores.explicitness;
    const lifecycleStabilityScore = calculateLifecycleStabilityScore(memory.lifecycle);
    const supersededScore = calculateSupersededScore(memory.state.supersededBy);
    const decayScore = (recencyScore * w.recency
        + lastAccessedScore * w.lastAccessed
        + retrievalFrequencyScore * w.retrievalFrequency
        + accessFrequencyScore * w.accessFrequency
        + importanceScore * w.importance
        + confidenceScore * w.confidence
        + explicitnessScore * w.explicitness
        + lifecycleStabilityScore * w.lifecycleStability
        + supersededScore * w.supersededPenalty);
    return Math.max(0, Math.min(1, decayScore));
}
/**
 * Determine if a memory should be migrated to archive based on decay score.
 *
 * @param decayScore - Decay score from calculateDecayScore()
 * @param threshold - Threshold below which memory should be archived (default 0.3)
 * @returns True if memory should be archived
 */
export function shouldArchive(decayScore, threshold = 0.3) {
    return decayScore < threshold;
}
/**
 * Determine if a memory should be migrated from working to episodic.
 *
 * @param memory - Memory item
 * @param ageDays - Age threshold in days (default 7)
 * @returns True if memory should migrate to episodic
 */
export function shouldMigrateToEpisodic(memory, ageDays = 7) {
    if (memory.lifecycle !== 'working') {
        return false;
    }
    const updatedMs = parseTimestamp(memory.timestamps.updatedAt);
    if (updatedMs <= 0) {
        return false;
    }
    const ageMs = Date.now() - updatedMs;
    return ageMs > ageDays * MS_PER_DAY;
}
/**
 * Determine if a memory should be migrated from episodic to semantic.
 *
 * @param memory - Memory item
 * @param minRetrievalCount - Minimum retrieval count (default 3)
 * @param minImportance - Minimum importance score (default 0.7)
 * @returns True if memory should migrate to semantic
 */
export function shouldMigrateToSemantic(memory, minRetrievalCount = 3, minImportance = 0.7) {
    if (memory.lifecycle !== 'episodic') {
        return false;
    }
    return memory.stats.retrievalCount >= minRetrievalCount
        && memory.scores.importance >= minImportance;
}
