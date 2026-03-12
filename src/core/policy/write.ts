import type { MemoryLifecycle, MemoryStoreInput, MemoryType, WriteDecision } from '../../types.js';

const LOW_VALUE_PATTERNS = [
  /^ok[.!]*$/i,
  /^okay[.!]*$/i,
  /^thanks?[.!]*$/i,
  /^thx[.!]*$/i,
  /^lol[.!]*$/i,
  /^收到[。！!]*$/,
  /^好的[。！!]*$/,
  /^嗯[。！!]*$/,
  /^哈哈[。！!]*$/,
];

const PREFERENCE_PATTERNS = [
  /\b(i like|i prefer|i love|i hate)\b/i,
  /(我喜欢|我更喜欢|我偏好|我不喜欢|我讨厌)/,
];

const CONSTRAINT_PATTERNS = [
  /\b(don't|do not|never|always)\b/i,
  /(不要|别|务必|必须|一律)/,
];

const DECISION_PATTERNS = [
  /\b(decide|decided|we will|we should)\b/i,
  /(决定|定为|采用|改为)/,
];

const COMMITMENT_PATTERNS = [
  /\b(i will|we will|todo|to do|follow up)\b/i,
  /(我会|我们会|待办|跟进|后续做)/,
];

const IDENTITY_PATTERNS = [
  /\bmy name is\b/i,
  /\bcall me\b/i,
  /(我叫|叫我)/,
];

function normalizeText(text: string): string {
  return text.trim();
}

function inferType(content: string, fallback?: MemoryType): MemoryType | undefined {
  if (fallback) {
    return fallback;
  }

  if (IDENTITY_PATTERNS.some((pattern) => pattern.test(content))) {
    return 'identity';
  }

  if (PREFERENCE_PATTERNS.some((pattern) => pattern.test(content))) {
    return 'preference';
  }

  if (CONSTRAINT_PATTERNS.some((pattern) => pattern.test(content))) {
    return 'constraint';
  }

  if (DECISION_PATTERNS.some((pattern) => pattern.test(content))) {
    return 'decision';
  }

  if (COMMITMENT_PATTERNS.some((pattern) => pattern.test(content))) {
    return 'commitment';
  }

  return 'fact';
}

function inferLifecycle(type: MemoryType, fallback?: MemoryLifecycle): MemoryLifecycle {
  if (fallback) {
    return fallback;
  }

  if (type === 'identity' || type === 'preference' || type === 'constraint' || type === 'decision') {
    return 'semantic';
  }

  return 'episodic';
}

function inferConfidence(type: MemoryType): number {
  switch (type) {
    case 'identity':
    case 'preference':
    case 'constraint':
      return 0.95;
    case 'decision':
      return 0.9;
    case 'commitment':
      return 0.85;
    default:
      return 0.75;
  }
}

function inferImportance(type: MemoryType): number {
  switch (type) {
    case 'constraint':
    case 'decision':
      return 0.95;
    case 'identity':
    case 'preference':
      return 0.85;
    case 'commitment':
      return 0.8;
    default:
      return 0.6;
  }
}

function inferExplicitness(content: string): number {
  if (/\bremember\b/i.test(content) || /记住|记一下/.test(content)) {
    return 1;
  }

  return 0.9;
}

export function evaluateWrite(input: MemoryStoreInput): WriteDecision {
  const content = normalizeText(input.content);

  if (content.length === 0) {
    return {
      accepted: false,
      reason: 'empty_content',
    };
  }

  if (content.length < 3 || LOW_VALUE_PATTERNS.some((pattern) => pattern.test(content))) {
    return {
      accepted: false,
      reason: 'low_value_chatter',
    };
  }

  const type = inferType(content, input.type);
  if (!type) {
    return {
      accepted: false,
      reason: 'type_not_determined',
    };
  }

  const lifecycle = inferLifecycle(type, input.lifecycle);
  const confidence = input.confidence ?? inferConfidence(type);
  const importance = input.importance ?? inferImportance(type);
  const explicitness = input.explicitness ?? inferExplicitness(content);

  return {
    accepted: true,
    reason: 'accepted_by_deterministic_baseline',
    type,
    lifecycle,
    confidence,
    importance,
    explicitness,
  };
}
