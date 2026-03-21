/**
 * Retrieval, briefing, intent, and transfer tuning constants.
 */
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
};
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
/** Quality score for user-explicit sources (tool/manual store) — highest priority */
export const DATA_QUALITY_UNKNOWN = 0.92;
/** Quality score for runtime sources (runtime_user, runtime_project, message) */
export const DATA_QUALITY_RUNTIME = 0.85;
/** Quality score for summary-type memories */
export const DATA_QUALITY_SUMMARY = 0.72;
/** Quality score for inference-derived memories */
export const DATA_QUALITY_INFERENCE = 0.68;
/** Quality score for low-value runtime content */
export const DATA_QUALITY_RUNTIME_LOW_VALUE = 0.48;
/** Quality score for low-value unknown content */
export const DATA_QUALITY_UNKNOWN_LOW_VALUE = 0.4;
/** Quality score for test content */
export const DATA_QUALITY_TEST = 0.2;
/** High-value project priority threshold for selection */
export const HIGH_VALUE_PROJECT_PRIORITY_THRESHOLD = 0.84;
/** Recency score brackets for keyword ranking */
export const KEYWORD_RECENCY_BRACKETS = {
    day1Score: 1,
    day7Score: 0.85,
    day30Score: 0.65,
    day90Score: 0.45,
    olderScore: 0.25,
    unknownScore: 0.35,
};
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
/** Heuristic confidence scores by intent type */
export const INTENT_CONFIDENCE = {
    correction: 0.95,
    preference: 0.92,
    status_update: 0.9,
    planning: 0.88,
    instruction: 0.86,
    question: 0.8,
    other: 0.65,
};
/** Correction signal scores for intent analysis */
export const INTENT_CORRECTION_SIGNAL_HIGH = 0.95;
export const INTENT_CORRECTION_SIGNAL_MEDIUM = 0.7;
export const INTENT_CORRECTION_SIGNAL_LOW = 0.05;
/** Preference relevance scores for intent analysis */
export const INTENT_PREFERENCE_RELEVANCE_HIGH = 0.95;
export const INTENT_PREFERENCE_RELEVANCE_MEDIUM = 0.7;
export const INTENT_PREFERENCE_RELEVANCE_LOW = 0.1;
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
export const DEEP_QUERY_STOPWORDS = new Set([
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'then', 'into', 'about', 'please', 'help',
    '之前', '上次', '一下', '继续', '我们', '你们', '这个', '那个', '请',
    '结合', '推进', '下一', '一步', '保持', '并且', '然后',
]);
/** Priority terms that anchor deep intent queries */
export const DEEP_QUERY_PRIORITY_TERMS = [
    '项目', '计划', '里程碑', '阶段', '任务', '约束', '决策', '风险', '质量', '回滚',
    'project', 'plan', 'milestone', 'phase', 'task', 'constraint', 'decision', 'risk', 'quality', 'rollback',
];
