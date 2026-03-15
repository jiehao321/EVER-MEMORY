/**
 * Behavior-rule tuning constants.
 */

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
