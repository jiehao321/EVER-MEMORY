import {
  DEBUG_EVENT_KINDS,
  INTENT_ACTION_NEEDS,
  INTENT_EMOTIONAL_TONES,
  INTENT_MEMORY_NEEDS,
  INTENT_TYPES,
  INTENT_URGENCY_LEVELS,
  MEMORY_LIFECYCLES,
  MEMORY_TYPES,
  REFLECTION_TRIGGER_KINDS,
  RETRIEVAL_SCOPE_HINTS,
  RETRIEVAL_TIME_BIASES,
  RETRIEVAL_MODES,
  CONSOLIDATION_MODES,
  BEHAVIOR_RULE_CATEGORIES,
} from '../constants.js';

export type MemoryType = (typeof MEMORY_TYPES)[number];
export type MemoryLifecycle = (typeof MEMORY_LIFECYCLES)[number];
export type DebugEventKind = (typeof DEBUG_EVENT_KINDS)[number];
export type IntentType = (typeof INTENT_TYPES)[number];
export type IntentUrgency = (typeof INTENT_URGENCY_LEVELS)[number];
export type IntentEmotionalTone = (typeof INTENT_EMOTIONAL_TONES)[number];
export type IntentActionNeed = (typeof INTENT_ACTION_NEEDS)[number];
export type IntentMemoryNeed = (typeof INTENT_MEMORY_NEEDS)[number];
export type RetrievalScopeHint = (typeof RETRIEVAL_SCOPE_HINTS)[number];
export type RetrievalTimeBias = (typeof RETRIEVAL_TIME_BIASES)[number];
export type RetrievalMode = (typeof RETRIEVAL_MODES)[number];
export type ConsolidationMode = (typeof CONSOLIDATION_MODES)[number];
export type ReflectionTriggerKind = (typeof REFLECTION_TRIGGER_KINDS)[number];
export type BehaviorRuleCategory = (typeof BEHAVIOR_RULE_CATEGORIES)[number];
