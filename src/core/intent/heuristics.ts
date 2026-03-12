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

const CORRECTION_PATTERNS = [
  /\b(i mean|correction|to be clear)\b/i,
  /(不是|更正|纠正|准确来说|修正一下)/,
];

const PREFERENCE_PATTERNS = [
  /\b(i like|i prefer|i love|i hate)\b/i,
  /(我喜欢|我更喜欢|我偏好|我不喜欢|我讨厌)/,
];

const PLANNING_PATTERNS = [
  /\b(plan|roadmap|milestone|phase)\b/i,
  /(计划|路线图|里程碑|阶段|拆分|推进)/,
];

const EXECUTION_PATTERNS = [
  /\b(implement|execute|fix|build)\b/i,
  /(实现|执行|修复|落地|开发|开始做)/,
];

const MEMORY_CUE_PATTERNS = [
  /\bremember|previous|before|history|earlier\b/i,
  /(记住|之前|上次|历史|延续|连续性)/,
];

const FRUSTRATION_PATTERNS = [
  /\b(frustrated|annoyed|angry)\b/i,
  /(烦|气死|崩溃|离谱|不行)/,
];

const EXCITED_PATTERNS = [
  /\b(great|awesome|excited)\b/i,
  /(太好了|很棒|兴奋)/,
];

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
    return { type: 'correction', confidence: 0.95 };
  }
  if (containsAny(text, PREFERENCE_PATTERNS)) {
    return { type: 'preference', confidence: 0.92 };
  }
  if (containsAny(text, PLANNING_PATTERNS)) {
    return { type: 'planning', confidence: 0.88 };
  }
  if (containsAny(text, EXECUTION_PATTERNS)) {
    return { type: 'instruction', subtype: 'execution', confidence: 0.86 };
  }
  if (text.includes('?') || text.includes('？')) {
    return { type: 'question', confidence: 0.8 };
  }
  return { type: 'other', confidence: 0.65 };
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
      return ['project', 'task', 'decision'];
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
  const correctionSignal = intent.type === 'correction' ? 0.95 : containsAny(text, CORRECTION_PATTERNS) ? 0.7 : 0.05;
  const preferenceRelevance = intent.type === 'preference' ? 0.95 : containsAny(text, PREFERENCE_PATTERNS) ? 0.7 : 0.1;

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
