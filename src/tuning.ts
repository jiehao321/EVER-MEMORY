/**
 * Centralized tuning constants for EverMemory.
 *
 * All magic numbers that control thresholds, weights, limits, and timing
 * across the codebase are collected here for easy adjustment.
 *
 * Constants already defined in src/constants.ts (e.g. DEFAULT_BOOT_TOKEN_BUDGET,
 * DEFAULT_MAX_RECALL, retrieval weights) are NOT duplicated here.
 */

// ============================================================================
// === Memory Lifecycle ===
// ============================================================================

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

// ============================================================================
// === Memory Lifecycle Quality Score Weights ===
// ============================================================================

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

// ============================================================================
// === Memory Decay ===
// ============================================================================

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

// ============================================================================
// === Behavior Rules - Lifecycle ===
// ============================================================================

/** Days of inactivity before a behavior rule enters "aging" staleness */
export const BEHAVIOR_AGING_AFTER_DAYS = 14;

/** Days of inactivity before a behavior rule enters "stale" staleness */
export const BEHAVIOR_STALE_AFTER_DAYS = 30;

/** Days of inactivity before a behavior rule enters "expired" staleness */
export const BEHAVIOR_EXPIRED_AFTER_DAYS = 60;

/** Days from creation after which a behavior rule expires */
export const BEHAVIOR_EXPIRES_AFTER_DAYS = 120;

/** Decay score added when a rule is in "aging" staleness */
export const BEHAVIOR_DECAY_FROM_AGING = 0.12;

/** Decay score added when a rule is in "stale" staleness */
export const BEHAVIOR_DECAY_FROM_STALE = 0.32;

/** Decay score added when a rule is in "expired" staleness */
export const BEHAVIOR_DECAY_FROM_EXPIRED = 0.62;

/** Decay score added per contradiction on a behavior rule */
export const BEHAVIOR_DECAY_PER_CONTRADICTION = 0.18;

/** Number of contradictions that trigger automatic rule disabling */
export const BEHAVIOR_MAX_CONTRADICTIONS_BEFORE_DISABLE = 2;

/** Minimum priority floor for behavior rules */
export const BEHAVIOR_MIN_PRIORITY = 10;

/** Priority decrease per decay step (e.g. when stale) */
export const BEHAVIOR_PRIORITY_DECAY_STEP = 10;

/** Priority penalty applied on a correction/contradiction event */
export const BEHAVIOR_PRIORITY_CORRECTION_PENALTY = 14;

/** Decay recovery per successful application of a behavior rule */
export const BEHAVIOR_APPLY_DECAY_RECOVERY = 0.08;

/** Apply count threshold for 'institutionalized' maturity */
export const BEHAVIOR_MATURITY_INSTITUTIONALIZED_THRESHOLD = 6;

/** Apply count threshold for 'validated' maturity */
export const BEHAVIOR_MATURITY_VALIDATED_THRESHOLD = 2;

/** Apply count threshold for 'validated' in stale staleness */
export const BEHAVIOR_STALE_VALIDATED_THRESHOLD = 4;

// ============================================================================
// === Behavior Rules - Promotion ===
// ============================================================================

/** Minimum confidence to accept a candidate behavior rule */
export const PROMOTION_MIN_CONFIDENCE = 0.75;

/** Minimum recurrence count for style-category rules */
export const PROMOTION_MIN_RECUR_FOR_STYLE = 2;

/** Minimum statement length for a behavior rule (characters) */
export const PROMOTION_MIN_STATEMENT_LENGTH = 10;

/** Maximum statement length for a behavior rule (characters) */
export const PROMOTION_MAX_STATEMENT_LENGTH = 220;

/** Priority level threshold for 'critical' rule level */
export const LEVEL_CRITICAL_PRIORITY_THRESHOLD = 90;

/** Confidence threshold for 'critical' rule level */
export const LEVEL_CRITICAL_CONFIDENCE_THRESHOLD = 0.92;

/** Priority level threshold for 'baseline' rule level */
export const LEVEL_BASELINE_PRIORITY_THRESHOLD = 70;

/** Confidence threshold for 'baseline' rule level */
export const LEVEL_BASELINE_CONFIDENCE_THRESHOLD = 0.8;

/** Default priority by category */
export const CATEGORY_DEFAULT_PRIORITY = {
  safety: 95,
  confirmation: 88,
  memory: 72,
  planning: 68,
  execution: 66,
  style: 54,
} as const;

/** Recurrence count threshold for 'validated' maturity during promotion */
export const PROMOTION_VALIDATED_RECURRENCE_THRESHOLD = 4;

// ============================================================================
// === Behavior Rules - Ranking ===
// ============================================================================

/** Governance penalty applied to stale rules during ranking */
export const RANKING_STALE_GOVERNANCE_PENALTY = 0.08;

/** Ranking weight for applicability score */
export const RANKING_WEIGHT_APPLICABILITY = 0.35;

/** Ranking weight for priority */
export const RANKING_WEIGHT_PRIORITY = 0.2;

/** Ranking weight for confidence */
export const RANKING_WEIGHT_CONFIDENCE = 0.14;

/** Ranking weight for freshness */
export const RANKING_WEIGHT_FRESHNESS = 0.05;

/** Ranking weight for recurrence */
export const RANKING_WEIGHT_RECURRENCE = 0.04;

/** Ranking weight for rule level */
export const RANKING_WEIGHT_LEVEL = 0.1;

/** Ranking weight for rule maturity */
export const RANKING_WEIGHT_MATURITY = 0.08;

/** Ranking weight for apply count */
export const RANKING_WEIGHT_APPLY_COUNT = 0.06;

/** Maximum decay score penalty in ranking */
export const RANKING_MAX_DECAY_PENALTY = 0.2;

/** Recurrence count divisor for normalized recurrence score */
export const RANKING_RECURRENCE_DIVISOR = 3;

/** Apply count divisor for normalized apply count score */
export const RANKING_APPLY_COUNT_DIVISOR = 6;

/** Level weight for 'critical' */
export const RANKING_LEVEL_WEIGHT_CRITICAL = 1;

/** Level weight for 'baseline' */
export const RANKING_LEVEL_WEIGHT_BASELINE = 0.72;

/** Level weight for 'candidate' */
export const RANKING_LEVEL_WEIGHT_CANDIDATE = 0.48;

/** Maturity weight for 'institutionalized' */
export const RANKING_MATURITY_WEIGHT_INSTITUTIONALIZED = 1;

/** Maturity weight for 'validated' */
export const RANKING_MATURITY_WEIGHT_VALIDATED = 0.78;

/** Maturity weight for 'emerging' */
export const RANKING_MATURITY_WEIGHT_EMERGING = 0.52;

/** Maturity weight for 'frozen' */
export const RANKING_MATURITY_WEIGHT_FROZEN = 0.1;

/** Freshness score brackets (days) and their scores */
export const RANKING_FRESHNESS_BRACKETS = {
  recentDays: 7,
  recentScore: 1,
  moderateDays: 30,
  moderateScore: 0.8,
  oldDays: 90,
  oldScore: 0.55,
  ancientScore: 0.3,
  unknownScore: 0.2,
} as const;

// ============================================================================
// === Behavior Rules - Applicability Scoring ===
// ============================================================================

/** Applicability score bonus for matching user scope */
export const APPLICABILITY_USER_SCOPE_MATCH_BONUS = 1;

/** Applicability score for global scope (no userId filter) */
export const APPLICABILITY_GLOBAL_SCOPE_BONUS = 0.4;

/** Applicability score bonus for matching channel */
export const APPLICABILITY_CHANNEL_MATCH_BONUS = 0.7;

/** Applicability score for no-channel filter */
export const APPLICABILITY_NO_CHANNEL_BONUS = 0.2;

/** Applicability score bonus for matching intent type */
export const APPLICABILITY_INTENT_MATCH_BONUS = 0.6;

/** Applicability score for no-intent filter */
export const APPLICABILITY_NO_INTENT_BONUS = 0.2;

/** Applicability score bonus for matching context */
export const APPLICABILITY_CONTEXT_MATCH_BONUS = 0.4;

/** Applicability score for no-context filter */
export const APPLICABILITY_NO_CONTEXT_BONUS = 0.1;

// ============================================================================
// === Retrieval ===
// ============================================================================

/** Default recall limit when not specified by request */
export const DEFAULT_RECALL_LIMIT = 8;

/** Maximum terms extracted from deep query */
export const DEEP_QUERY_MAX_TERMS = 6;

/** Maximum length for deep query fallback substring */
export const DEEP_QUERY_FALLBACK_MAX_LENGTH = 48;

/** Maximum query length for intent-based short queries */
export const INTENT_QUERY_MAX_LENGTH = 24;

/** Project route max recall limits by kind */
export const PROJECT_ROUTE_MAX_LIMIT = {
  project_progress: 4,
  current_stage: 4,
  next_step: 3,
  last_decision: 3,
} as const;

/** Retrieval policy weights for project-oriented scoring */
export const RETRIEVAL_PROJECT_POLICY_WEIGHT_BASE = 0.76;
export const RETRIEVAL_PROJECT_POLICY_WEIGHT_PROJECT = 0.16;
export const RETRIEVAL_PROJECT_POLICY_WEIGHT_QUALITY = 0.08;

/** Retrieval policy weights for non-project scoring */
export const RETRIEVAL_DEFAULT_POLICY_WEIGHT_BASE = 0.9;
export const RETRIEVAL_DEFAULT_POLICY_WEIGHT_QUALITY = 0.1;

/** Project priority scores by memory type */
export const PROJECT_PRIORITY_SUMMARY = 1;
export const PROJECT_PRIORITY_PROJECT_STATE = 0.95;
export const PROJECT_PRIORITY_DECISION = 0.92;
export const PROJECT_PRIORITY_COMMITMENT_NEXT_STEP = 0.88;
export const PROJECT_PRIORITY_PROJECT = 0.84;
export const PROJECT_PRIORITY_CONSTRAINT = 0.72;
export const PROJECT_PRIORITY_DEFAULT = 0.45;

/** Data quality scores */
export const DATA_QUALITY_RUNTIME = 1;
export const DATA_QUALITY_RUNTIME_LOW_VALUE = 0.48;
export const DATA_QUALITY_TEST = 0.2;
export const DATA_QUALITY_UNKNOWN = 0.72;
export const DATA_QUALITY_UNKNOWN_LOW_VALUE = 0.4;

/** High-value project priority threshold for selection */
export const HIGH_VALUE_PROJECT_PRIORITY_THRESHOLD = 0.84;

// ============================================================================
// === Keyword Retrieval Scoring ===
// ============================================================================

/** Recency score brackets for keyword ranking */
export const KEYWORD_RECENCY_BRACKETS = {
  day1Score: 1,
  day7Score: 0.85,
  day30Score: 0.65,
  day90Score: 0.45,
  olderScore: 0.25,
  unknownScore: 0.35,
} as const;

/** Keyword factor score for empty query (default match) */
export const KEYWORD_EMPTY_QUERY_SCORE = 0.45;

/** Keyword factor score for phrase found in content */
export const KEYWORD_PHRASE_IN_CONTENT_SCORE = 0.55;

/** Keyword factor score for phrase found in tags */
export const KEYWORD_PHRASE_IN_TAGS_SCORE = 0.25;

/** Keyword factor weight for token coverage */
export const KEYWORD_TOKEN_COVERAGE_WEIGHT = 0.5;

/** Scope match base score */
export const KEYWORD_SCOPE_BASE_SCORE = 0.4;

/** Scope match bonus for userId match */
export const KEYWORD_SCOPE_USER_BONUS = 0.2;

/** Scope match bonus for chatId match */
export const KEYWORD_SCOPE_CHAT_BONUS = 0.2;

/** Scope match bonus for project match */
export const KEYWORD_SCOPE_PROJECT_BONUS = 0.15;

/** Scope match bonus for global match */
export const KEYWORD_SCOPE_GLOBAL_BONUS = 0.05;

/** Default scope match score when no request scope */
export const KEYWORD_SCOPE_NO_REQUEST = 0.5;

// ============================================================================
// === Reflection ===
// ============================================================================

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

// ============================================================================
// === Auto Capture (Session End) ===
// ============================================================================

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

// ============================================================================
// === Experience Indicators ===
// ============================================================================

/** Correction signal threshold for experience indicator */
export const EXPERIENCE_CORRECTION_SIGNAL_THRESHOLD = 0.6;

/** Preference signal threshold for experience indicator approval */
export const EXPERIENCE_PREFERENCE_APPROVAL_THRESHOLD = 0.7;

/** Max summary text length for experience logs */
export const EXPERIENCE_SUMMARY_MAX_LENGTH = 240;

// ============================================================================
// === Briefing ===
// ============================================================================

/** Max number of active project summaries in briefing */
export const BRIEFING_MAX_ACTIVE_PROJECTS = 5;

/** Search limits for briefing sections */
export const BRIEFING_IDENTITY_LIMIT = 5;
export const BRIEFING_CONSTRAINT_LIMIT = 5;
export const BRIEFING_CONTINUITY_LIMIT = 8;
export const BRIEFING_DECISION_LIMIT = 8;
export const BRIEFING_COMMITMENT_LIMIT = 8;
export const BRIEFING_ACTIVE_PROJECT_LIMIT = 10;
export const BRIEFING_SUMMARY_LIMIT = 12;

/** Content pick limits for briefing sections */
export const BRIEFING_PICK_IDENTITY = 3;
export const BRIEFING_PICK_CONSTRAINTS = 5;
export const BRIEFING_PICK_DECISIONS = 3;
export const BRIEFING_PICK_COMMITMENTS = 2;
export const BRIEFING_PICK_CONTINUITY = 6;
export const BRIEFING_PICK_CONTINUITY_OUTPUT = 5;

/** Max clip length for briefing content */
export const BRIEFING_CLIP_DEFAULT = 220;
export const BRIEFING_CLIP_SHORT = 120;
export const BRIEFING_CLIP_PROJECT_SUMMARY = 300;

// ============================================================================
// === Profile Projection ===
// ============================================================================

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

// ============================================================================
// === Write Policy ===
// ============================================================================

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

// ============================================================================
// === Intent Heuristics ===
// ============================================================================

/** Heuristic confidence scores by intent type */
export const INTENT_CONFIDENCE = {
  correction: 0.95,
  preference: 0.92,
  status_update: 0.9,
  planning: 0.88,
  instruction: 0.86,
  question: 0.8,
  other: 0.65,
} as const;

/** Correction signal scores for intent analysis */
export const INTENT_CORRECTION_SIGNAL_HIGH = 0.95;
export const INTENT_CORRECTION_SIGNAL_MEDIUM = 0.7;
export const INTENT_CORRECTION_SIGNAL_LOW = 0.05;

/** Preference relevance scores for intent analysis */
export const INTENT_PREFERENCE_RELEVANCE_HIGH = 0.95;
export const INTENT_PREFERENCE_RELEVANCE_MEDIUM = 0.7;
export const INTENT_PREFERENCE_RELEVANCE_LOW = 0.1;

// ============================================================================
// === Archive / Transfer ===
// ============================================================================

/** Default review limit for archived memory review */
export const ARCHIVE_DEFAULT_REVIEW_LIMIT = 30;

/** Maximum review limit for archived memory review */
export const ARCHIVE_MAX_REVIEW_LIMIT = 300;

/** Default export limit */
export const TRANSFER_DEFAULT_EXPORT_LIMIT = 200;

/** Maximum export limit */
export const TRANSFER_MAX_EXPORT_LIMIT = 5000;

/** Maximum import items per snapshot */
export const TRANSFER_MAX_IMPORT_ITEMS = 5000;

// ============================================================================
// === Behavior Service ===
// ============================================================================

/** Default limit for getActiveRules */
export const BEHAVIOR_DEFAULT_ACTIVE_RULES_LIMIT = 8;

/** Candidate fetch multiplier for getActiveRules */
export const BEHAVIOR_CANDIDATE_FETCH_MULTIPLIER = 5;

/** Minimum candidate fetch for getActiveRules */
export const BEHAVIOR_MIN_CANDIDATE_FETCH = 60;

/** Limit for active candidates in promotion */
export const BEHAVIOR_PROMOTION_CANDIDATE_LIMIT = 200;

/** Default limit for listRecentRules */
export const BEHAVIOR_DEFAULT_RECENT_RULES_LIMIT = 20;

// ============================================================================
// === Retrieval Service - Recall for Intent ===
// ============================================================================

/** Memory need 'light' max recall limit */
export const RECALL_LIGHT_MAX = 4;

/** Memory need 'targeted' min recall */
export const RECALL_TARGETED_MIN = 4;

/** Memory need 'targeted' max recall */
export const RECALL_TARGETED_MAX = 8;

/** Memory need 'deep' min recall */
export const RECALL_DEEP_MIN = 8;

/** Memory need 'deep' max recall */
export const RECALL_DEEP_MAX = 12;

/** Stop words filtered in deep intent queries */
export const DEEP_QUERY_STOPWORDS: ReadonlySet<string> = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'then', 'into', 'about', 'please', 'help',
  '之前', '上次', '一下', '继续', '我们', '你们', '这个', '那个', '请',
  '结合', '推进', '下一', '一步', '保持', '并且', '然后',
]);

/** Priority terms that anchor deep intent queries */
export const DEEP_QUERY_PRIORITY_TERMS: readonly string[] = [
  '项目', '计划', '里程碑', '阶段', '任务', '约束', '决策', '风险', '质量', '回滚',
  'project', 'plan', 'milestone', 'phase', 'task', 'constraint', 'decision', 'risk', 'quality', 'rollback',
];
