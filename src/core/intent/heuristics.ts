import type {
  IntentActionNeed,
  IntentAnalyzeInput,
  IntentEmotionalTone,
  IntentMemoryNeed,
  IntentType,
  IntentUrgency,
  MemoryType,
  RetrievalScopeHint,
  RetrievalTimeBias,
} from '../../types.js';
import {
  CORRECTION_PATTERNS,
  EXCITED_PATTERNS,
  EXECUTION_PATTERNS,
  FRUSTRATION_PATTERNS,
  MEMORY_CUE_PATTERNS,
  PLANNING_PATTERNS,
  PREFERENCE_PATTERNS,
  STATUS_PATTERNS,
} from '../../patterns.js';
import {
  INTENT_CONFIDENCE,
  INTENT_CORRECTION_SIGNAL_HIGH,
  INTENT_CORRECTION_SIGNAL_LOW,
  INTENT_CORRECTION_SIGNAL_MEDIUM,
  INTENT_PREFERENCE_RELEVANCE_HIGH,
  INTENT_PREFERENCE_RELEVANCE_LOW,
  INTENT_PREFERENCE_RELEVANCE_MEDIUM,
} from '../../tuning.js';

export interface HeuristicIntentOutput {
  intentType: IntentType;
  subtype?: string;
  confidence: number;
  urgency: IntentUrgency;
  emotionalTone: IntentEmotionalTone;
  actionNeed: IntentActionNeed;
  memoryNeed: IntentMemoryNeed;
  preferenceRelevance: number;
  correctionSignal: number;
  preferredTypes: MemoryType[];
  preferredScopes: RetrievalScopeHint[];
  preferredTimeBias: RetrievalTimeBias;
}

function containsAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function inferIntentType(text: string): { type: IntentType; subtype?: string; confidence: number } {
  if (containsAny(text, CORRECTION_PATTERNS)) {
    return { type: 'correction', confidence: INTENT_CONFIDENCE.correction };
  }
  if (containsAny(text, PREFERENCE_PATTERNS)) {
    return { type: 'preference', confidence: INTENT_CONFIDENCE.preference };
  }
  if (containsAny(text, STATUS_PATTERNS)) {
    return { type: 'status_update', confidence: INTENT_CONFIDENCE.status_update };
  }
  if (containsAny(text, PLANNING_PATTERNS)) {
    return { type: 'planning', confidence: INTENT_CONFIDENCE.planning };
  }
  if (containsAny(text, EXECUTION_PATTERNS)) {
    return { type: 'instruction', subtype: 'execution', confidence: INTENT_CONFIDENCE.instruction };
  }
  if (text.includes('?') || text.includes('？')) {
    return { type: 'question', confidence: INTENT_CONFIDENCE.question };
  }
  return { type: 'other', confidence: INTENT_CONFIDENCE.other };
}

function inferEmotionalTone(text: string): IntentEmotionalTone {
  if (containsAny(text, FRUSTRATION_PATTERNS)) {
    return 'frustrated';
  }
  if (containsAny(text, EXCITED_PATTERNS)) {
    return 'excited';
  }
  return 'neutral';
}

function inferUrgency(text: string, intentType: IntentType): IntentUrgency {
  if (/\b(asap|urgent|immediately)\b/i.test(text) || /(立刻|马上|紧急|尽快)/.test(text)) {
    return 'high';
  }
  if (intentType === 'correction' || intentType === 'instruction') {
    return 'medium';
  }
  return 'low';
}

function inferActionNeed(intentType: IntentType): IntentActionNeed {
  if (intentType === 'instruction') {
    return 'execution';
  }
  if (intentType === 'status_update') {
    return 'analysis';
  }
  if (intentType === 'question') {
    return 'answer';
  }
  if (intentType === 'planning') {
    return 'analysis';
  }
  if (intentType === 'correction') {
    return 'confirmation';
  }
  return 'none';
}

function inferMemoryNeed(text: string, intentType: IntentType): IntentMemoryNeed {
  if (intentType === 'correction') {
    return 'targeted';
  }
  if (intentType === 'planning' && containsAny(text, MEMORY_CUE_PATTERNS)) {
    return 'deep';
  }
  if (intentType === 'planning') {
    return 'targeted';
  }
  if (intentType === 'status_update') {
    return 'deep';
  }
  if (containsAny(text, MEMORY_CUE_PATTERNS) || intentType === 'preference') {
    return 'targeted';
  }
  if (intentType === 'question' || intentType === 'instruction') {
    return 'light';
  }
  return 'none';
}

function inferPreferredTypes(intentType: IntentType): MemoryType[] {
  switch (intentType) {
    case 'preference':
      return ['preference', 'style', 'constraint'];
    case 'planning':
      return ['project', 'task', 'decision', 'constraint'];
    case 'status_update':
      return ['project', 'decision', 'task', 'summary', 'constraint'];
    case 'correction':
      return ['decision', 'constraint', 'fact'];
    case 'instruction':
      return ['task', 'constraint', 'decision'];
    case 'question':
      return ['fact', 'summary'];
    default:
      return ['fact'];
  }
}

function inferPreferredTimeBias(intentType: IntentType): RetrievalTimeBias {
  if (intentType === 'preference') {
    return 'durable';
  }
  if (intentType === 'planning') {
    return 'balanced';
  }
  if (intentType === 'status_update') {
    return 'recent';
  }
  if (intentType === 'correction') {
    return 'recent';
  }
  return 'balanced';
}

function inferPreferredScopes(input: IntentAnalyzeInput): RetrievalScopeHint[] {
  const scopes: RetrievalScopeHint[] = [];
  if (input.sessionId) {
    scopes.push('session');
  }
  if (input.scope?.userId) {
    scopes.push('user');
  }
  if (input.scope?.project) {
    scopes.push('project');
  }
  if (input.scope?.global) {
    scopes.push('global');
  }
  if (scopes.length === 0) {
    scopes.push('session');
  }
  return scopes;
}

export function analyzeIntentHeuristics(input: IntentAnalyzeInput): HeuristicIntentOutput {
  const text = input.text.trim();
  const intent = inferIntentType(text);
  const memoryNeed = inferMemoryNeed(text, intent.type);
  const correctionSignal = intent.type === 'correction'
    ? INTENT_CORRECTION_SIGNAL_HIGH
    : containsAny(text, CORRECTION_PATTERNS)
      ? INTENT_CORRECTION_SIGNAL_MEDIUM
      : INTENT_CORRECTION_SIGNAL_LOW;
  const preferenceRelevance = intent.type === 'preference'
    ? INTENT_PREFERENCE_RELEVANCE_HIGH
    : containsAny(text, PREFERENCE_PATTERNS)
      ? INTENT_PREFERENCE_RELEVANCE_MEDIUM
      : INTENT_PREFERENCE_RELEVANCE_LOW;

  return {
    intentType: intent.type,
    subtype: intent.subtype,
    confidence: clamp01(intent.confidence),
    urgency: inferUrgency(text, intent.type),
    emotionalTone: inferEmotionalTone(text),
    actionNeed: inferActionNeed(intent.type),
    memoryNeed,
    correctionSignal: clamp01(correctionSignal),
    preferenceRelevance: clamp01(preferenceRelevance),
    preferredTypes: inferPreferredTypes(intent.type),
    preferredScopes: inferPreferredScopes(input),
    preferredTimeBias: inferPreferredTimeBias(intent.type),
  };
}
