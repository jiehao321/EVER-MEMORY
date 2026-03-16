export const PLUGIN_NAME = 'evermemory';
export const PLUGIN_VERSION = '1.0.1';

export const DEFAULT_BOOT_TOKEN_BUDGET = 1200;
export const DEFAULT_MAX_RECALL = 8;
export const DEFAULT_DATABASE_PATH = '.openclaw/memory/evermemory/store/evermemory.db';
export const DEFAULT_INTENT_USE_LLM = false;
export const DEFAULT_INTENT_FALLBACK_HEURISTICS = true;
export const DEFAULT_SEMANTIC_SIDECAR_ENABLED = true;
export const DEFAULT_SEMANTIC_SIDECAR_MAX_CANDIDATES = 200;
export const DEFAULT_SEMANTIC_SIDECAR_MIN_SCORE = 0.15;
export const DEFAULT_RETRIEVAL_KEYWORD_WEIGHTS = {
  keyword: 0.38,
  recency: 0.13,
  importance: 0.14,
  confidence: 0.12,
  explicitness: 0.08,
  scopeMatch: 0.07,
  typePriority: 0.05,
  lifecyclePriority: 0.03,
} as const;
export const DEFAULT_RETRIEVAL_HYBRID_WEIGHTS = {
  keyword: 0.5,
  semantic: 0.35,
  base: 0.15,
} as const;

export const MEMORY_TYPES = [
  'identity',
  'fact',
  'preference',
  'decision',
  'commitment',
  'relationship',
  'task',
  'project',
  'style',
  'summary',
  'constraint',
] as const;

export const MEMORY_LIFECYCLES = [
  'working',
  'episodic',
  'semantic',
  'archive',
] as const;

export const DEBUG_EVENT_KINDS = [
  'memory_write_decision',
  'memory_write_rejected',
  'memory_merged',
  'memory_archived',
  'retrieval_executed',
  'boot_generated',
  'intent_generated',
  'intent_enriched',
  'intent_enrich_failed',
  'interaction_processed',
  'experience_logged',
  'reflection_created',
  'reflection_skipped',
  'session_end_processed',
  'rule_promoted',
  'rule_rejected',
  'rule_frozen',
  'rule_deprecated',
  'rule_rolled_back',
  'rule_mutated',
  'rules_loaded',
  'semantic_preload_failed',
  'semantic_indexed',
  'profile_recomputed',
  'profile_recompute_failed',
  'memory_exported',
  'memory_import_reviewed',
  'memory_import_applied',
  'memory_restore_reviewed',
  'memory_restore_applied',
  'housekeeping_error',
] as const;

export const INTENT_TYPES = [
  'question',
  'instruction',
  'correction',
  'preference',
  'planning',
  'status_update',
  'other',
] as const;

export const INTENT_URGENCY_LEVELS = ['low', 'medium', 'high'] as const;

export const INTENT_EMOTIONAL_TONES = [
  'neutral',
  'positive',
  'negative',
  'frustrated',
  'excited',
] as const;

export const INTENT_ACTION_NEEDS = [
  'none',
  'analysis',
  'answer',
  'execution',
  'confirmation',
] as const;

export const INTENT_MEMORY_NEEDS = [
  'none',
  'light',
  'targeted',
  'deep',
] as const;

export const RETRIEVAL_SCOPE_HINTS = [
  'session',
  'user',
  'project',
  'global',
] as const;

export const RETRIEVAL_TIME_BIASES = [
  'recent',
  'balanced',
  'durable',
] as const;

export const RETRIEVAL_MODES = [
  'structured',
  'keyword',
  'hybrid',
] as const;

export const CONSOLIDATION_MODES = [
  'light',
  'daily',
  'deep',
] as const;

export const REFLECTION_TRIGGER_KINDS = [
  'correction',
  'mistake',
  'success',
  'repeat-pattern',
  'manual-review',
] as const;

export const BEHAVIOR_RULE_CATEGORIES = [
  'style',
  'safety',
  'execution',
  'confirmation',
  'memory',
  'planning',
] as const;
