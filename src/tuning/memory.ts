/**
 * Memory, reflection, profile, and write-policy tuning constants.
 */

/** Jaccard similarity threshold above which two memories are considered near-duplicates */
export const NEAR_DUPLICATE_THRESHOLD = 0.9;

/** Default number of candidate memories to scan when deduplicating */
export const DEFAULT_DEDUPE_SCAN_LIMIT = 60;

/** Days after which episodic memories are considered stale and eligible for archiving */
export const DEFAULT_STALE_EPISODIC_DAYS = 30;

/** Default number of candidate memories to scan when archiving stale episodic memories */
export const DEFAULT_STALE_SCAN_LIMIT = 120;

/** Consolidation candidate limits by mode */
export const CONSOLIDATION_LIMITS = {
  light: 20,
  daily: 60,
  deep: 120,
} as const;

/** Migration scan limit for daily consolidation */
export const LIFECYCLE_MIGRATION_LIMIT_DAILY = 100;

/** Migration scan limit for deep consolidation */
export const LIFECYCLE_MIGRATION_LIMIT_DEEP = 200;

/** Weight of importance score in memory quality evaluation */
export const QUALITY_WEIGHT_IMPORTANCE = 0.4;

/** Weight of confidence score in memory quality evaluation */
export const QUALITY_WEIGHT_CONFIDENCE = 0.3;

/** Weight of explicitness score in memory quality evaluation */
export const QUALITY_WEIGHT_EXPLICITNESS = 0.2;

/** Weight of text length factor in memory quality evaluation */
export const QUALITY_WEIGHT_TEXT = 0.1;

/** Text length denominator for normalized quality weight (characters) */
export const QUALITY_TEXT_LENGTH_NORM = 200;

/** Quality difference threshold below which recency is used as tiebreaker */
export const QUALITY_TIE_THRESHOLD = 0.02;

/** Half-life in days for recency-based decay (how quickly updated memories lose value) */
export const DECAY_RECENCY_HALF_LIFE_DAYS = 30;

/** Half-life in days for last-accessed decay */
export const DECAY_LAST_ACCESSED_HALF_LIFE_DAYS = 15;

/** Divisor for logarithmic retrieval/access frequency scoring */
export const DECAY_FREQUENCY_LOG_DIVISOR = 2;

/** Lifecycle stability scores per memory lifecycle */
export const LIFECYCLE_STABILITY_SCORES = {
  working: 0.2,
  episodic: 0.5,
  semantic: 0.9,
  archive: 0.0,
} as const;

/** Decay score below which a memory should be archived */
export const DECAY_ARCHIVE_THRESHOLD = 0.3;

/** Days after which a working memory should migrate to episodic */
export const MIGRATE_TO_EPISODIC_DAYS = 7;

/** Minimum retrieval count for episodic-to-semantic migration */
export const MIGRATE_TO_SEMANTIC_MIN_RETRIEVALS = 3;

/** Minimum importance score for episodic-to-semantic migration */
export const MIGRATE_TO_SEMANTIC_MIN_IMPORTANCE = 0.7;

/** Confidence base scores by trigger kind */
export const REFLECTION_CONFIDENCE_BASE = {
  correction: 0.82,
  mistake: 0.78,
  success: 0.76,
  'repeat-pattern': 0.85,
  'manual-review': 0.7,
} as const;

/** Maximum recurrence boost for confidence */
export const REFLECTION_MAX_RECURRENCE_BOOST = 0.1;

/** Per-experience recurrence boost increment */
export const REFLECTION_RECURRENCE_BOOST_INCREMENT = 0.03;

/** Evidence boost threshold (min refs) and value */
export const REFLECTION_EVIDENCE_BOOST_MIN_REFS = 2;
export const REFLECTION_EVIDENCE_BOOST_VALUE = 0.05;

/** Correction boost value */
export const REFLECTION_CORRECTION_BOOST = 0.04;

/** Approval boost value */
export const REFLECTION_APPROVAL_BOOST = 0.03;

/** Mode penalty for non-full reflection */
export const REFLECTION_MODE_PENALTY = 0.02;

/** Experience limit for full reflection mode */
export const REFLECTION_FULL_EXPERIENCE_LIMIT = 20;

/** Experience limit for light reflection mode */
export const REFLECTION_LIGHT_EXPERIENCE_LIMIT = 8;

/** Confidence threshold for full reflection */
export const REFLECTION_FULL_CONFIDENCE_THRESHOLD = 0.7;

/** Confidence threshold for light reflection */
export const REFLECTION_LIGHT_CONFIDENCE_THRESHOLD = 0.55;

/** Max candidate rules generated per reflection */
export const REFLECTION_MAX_CANDIDATE_RULES = 5;

/** Correction signal threshold for auto-capture */
export const AUTO_CAPTURE_CORRECTION_SIGNAL_THRESHOLD = 0.85;

/** Preference relevance threshold for auto-capture */
export const AUTO_CAPTURE_PREFERENCE_RELEVANCE_THRESHOLD = 0.75;

/** Minimum signal count for project summary generation */
export const AUTO_CAPTURE_SUMMARY_MIN_SIGNALS = 2;

/** Minimum content length to accept auto-captured memory */
export const AUTO_CAPTURE_MIN_CONTENT_LENGTH = 8;

/** Minimum quality score to accept auto-captured memory */
export const AUTO_CAPTURE_MIN_QUALITY = 1;

/** Clip length for input/action text */
export const AUTO_CAPTURE_CLIP_INPUT = 220;

/** Clip length for outcome/constraint text */
export const AUTO_CAPTURE_CLIP_OUTCOME = 120;

/** Default clip length */
export const AUTO_CAPTURE_CLIP_DEFAULT = 140;

/** Correction signal threshold for experience indicator */
export const EXPERIENCE_CORRECTION_SIGNAL_THRESHOLD = 0.6;

/** Preference signal threshold for experience indicator approval */
export const EXPERIENCE_PREFERENCE_APPROVAL_THRESHOLD = 0.7;

/** Max summary text length for experience logs */
export const EXPERIENCE_SUMMARY_MAX_LENGTH = 240;

/** Minimum explicitness score to consider a memory as explicit */
export const PROFILE_EXPLICIT_THRESHOLD = 0.75;

/** Maximum memories to scan when computing profile */
export const PROFILE_MAX_MEMORY_SCAN = 300;

/** Maximum number of derived items (interests, work patterns) */
export const PROFILE_MAX_DERIVED_ITEMS = 3;

/** Maximum behavior hints included in profile */
export const PROFILE_MAX_BEHAVIOR_HINTS = 8;

/** Profile memory weight: importance */
export const PROFILE_WEIGHT_IMPORTANCE = 0.4;

/** Profile memory weight: confidence */
export const PROFILE_WEIGHT_CONFIDENCE = 0.35;

/** Profile memory weight: explicitness */
export const PROFILE_WEIGHT_EXPLICITNESS = 0.25;

/** Minimum content length to accept a memory write */
export const WRITE_MIN_CONTENT_LENGTH = 3;

/** Inferred confidence scores by memory type */
export const WRITE_CONFIDENCE_BY_TYPE = {
  identity: 0.95,
  preference: 0.95,
  constraint: 0.95,
  decision: 0.9,
  commitment: 0.85,
  default: 0.75,
} as const;

/** Inferred importance scores by memory type */
export const WRITE_IMPORTANCE_BY_TYPE = {
  constraint: 0.95,
  decision: 0.95,
  identity: 0.85,
  preference: 0.85,
  commitment: 0.8,
  default: 0.6,
} as const;

/** Default explicitness score for non-explicit writes */
export const WRITE_DEFAULT_EXPLICITNESS = 0.9;

/** Default confidence for normalizeMemory fallback */
export const NORMALIZE_DEFAULT_CONFIDENCE = 0.8;

/** Default importance for normalizeMemory fallback */
export const NORMALIZE_DEFAULT_IMPORTANCE = 0.5;
