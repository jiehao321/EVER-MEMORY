import type { MemoryItem, ProfileStableField, ProjectedProfile } from '../../types.js';
import {
  COMMUNICATION_STYLE_RULES,
  DISPLAY_NAME_REGEX,
  PREFERRED_ADDRESS_REGEX,
  PREFERENCE_LANGUAGE_CONTENT_REGEX,
  PREFERENCE_LANGUAGE_TAG_REGEX,
  PREFERENCE_STYLE_CONTENT_REGEX,
  PREFERENCE_STYLE_TAG_REGEX,
  PREFERENCE_TIMEZONE_CONTENT_REGEX,
  PREFERENCE_TIMEZONE_TAG_REGEX,
  TIMEZONE_CN_REGEX,
  TIMEZONE_PACIFIC_REGEX,
  TIMEZONE_UTC_REGEX,
  VALUE_LANGUAGE_EN_REGEX,
  VALUE_LANGUAGE_ZH_REGEX,
  VALUE_STYLE_CONCISE_REGEX,
  VALUE_STYLE_DETAILED_REGEX,
  VALUE_STYLE_STRUCTURED_REGEX,
  WORK_PATTERN_RULES,
} from './patterns.js';
import {
  PROFILE_MAX_DERIVED_ITEMS,
  PROFILE_WEIGHT_CONFIDENCE,
  PROFILE_WEIGHT_EXPLICITNESS,
  PROFILE_WEIGHT_IMPORTANCE,
} from '../../tuning.js';

interface DerivedAccumulator {
  score: number;
  evidenceRefs: Set<string>;
}

export function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/[.,!?;:()[\]{}"'`~|\\/，。！？；：、（）【】《》“”‘’]/g, ' ')
    .replace(/\s+/g, ' ');
}

export function extractDisplayName(content: string): string | undefined {
  const match = content.match(DISPLAY_NAME_REGEX);
  return match?.[1]?.trim() || undefined;
}

export function extractPreferredAddress(content: string): string | undefined {
  const match = content.match(PREFERRED_ADDRESS_REGEX);
  return match?.[1]?.trim() || undefined;
}

export function extractTimezone(content: string): string | undefined {
  const utc = content.match(TIMEZONE_UTC_REGEX);
  if (utc) {
    const parsedHour = Number.parseInt(utc[1], 10);
    if (Number.isFinite(parsedHour)) {
      const sign = parsedHour >= 0 ? '+' : '-';
      const hour = String(Math.abs(parsedHour)).padStart(2, '0');
      const minute = (utc[2] ?? '00').padStart(2, '0');
      return `UTC${sign}${hour}:${minute}`;
    }
  }

  if (TIMEZONE_CN_REGEX.test(content)) {
    return 'UTC+08:00';
  }

  if (TIMEZONE_PACIFIC_REGEX.test(content)) {
    return 'UTC-08:00';
  }

  return undefined;
}

export function memoryWeight(memory: MemoryItem): number {
  return (
    memory.scores.importance * PROFILE_WEIGHT_IMPORTANCE
    + memory.scores.confidence * PROFILE_WEIGHT_CONFIDENCE
    + memory.scores.explicitness * PROFILE_WEIGHT_EXPLICITNESS
  );
}

function sanitizePreferenceKey(raw: string): string | undefined {
  const key = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_\-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return key.length > 0 ? key : undefined;
}

export function detectPreferenceKey(memory: MemoryItem): string | undefined {
  const firstTag = memory.tags[0];
  if (firstTag) {
    const normalizedTag = normalizeText(firstTag);
    if (PREFERENCE_LANGUAGE_TAG_REGEX.test(normalizedTag)) {
      return 'language';
    }
    if (PREFERENCE_TIMEZONE_TAG_REGEX.test(normalizedTag)) {
      return 'timezone';
    }
    if (PREFERENCE_STYLE_TAG_REGEX.test(normalizedTag)) {
      return 'communication_style';
    }

    const fromTag = sanitizePreferenceKey(firstTag);
    if (fromTag) {
      return fromTag;
    }
  }

  const content = normalizeText(memory.content);
  if (PREFERENCE_LANGUAGE_CONTENT_REGEX.test(content)) {
    return 'language';
  }
  if (PREFERENCE_TIMEZONE_CONTENT_REGEX.test(content)) {
    return 'timezone';
  }
  if (PREFERENCE_STYLE_CONTENT_REGEX.test(content)) {
    return 'communication_style';
  }

  return undefined;
}

export function detectPreferenceValue(key: string, content: string): string {
  const normalized = normalizeText(content);
  if (key === 'language') {
    if (VALUE_LANGUAGE_ZH_REGEX.test(normalized)) {
      return 'zh';
    }
    if (VALUE_LANGUAGE_EN_REGEX.test(normalized)) {
      return 'en';
    }
  }

  if (key === 'communication_style') {
    if (VALUE_STYLE_CONCISE_REGEX.test(normalized)) {
      return 'concise_direct';
    }
    if (VALUE_STYLE_DETAILED_REGEX.test(normalized)) {
      return 'detailed';
    }
    if (VALUE_STYLE_STRUCTURED_REGEX.test(normalized)) {
      return 'structured';
    }
  }

  if (key === 'timezone') {
    return extractTimezone(content) ?? content.trim();
  }

  return content.trim();
}

export function shouldKeepConstraint(constraint: string): boolean {
  return constraint.trim().length >= 3;
}

function createDerivedField(
  value: string,
  confidence: number,
  evidenceRefs: Iterable<string>,
): ProjectedProfile['derived']['likelyInterests'][number] {
  return {
    value,
    confidence,
    evidenceRefs: [...new Set(evidenceRefs)].slice(0, 3),
    source: 'derived_inference',
    guardrail: 'weak_hint',
    canonical: false,
  };
}

export function collectLikelyInterests(
  memories: MemoryItem[],
  explicitPreferences: Record<string, ProfileStableField>,
  explicitConstraints: Array<ProfileStableField>,
): ProjectedProfile['derived']['likelyInterests'] {
  const blockedValues = new Set<string>([
    ...Object.values(explicitPreferences).map((item) => normalizeText(item.value)),
    ...explicitConstraints.map((item) => normalizeText(item.value)),
  ]);
  const scoreByTerm = new Map<string, DerivedAccumulator>();

  for (const memory of memories) {
    const terms = new Set<string>([
      ...memory.tags,
      ...memory.relatedEntities,
    ]);
    if (terms.size === 0) {
      continue;
    }

    const score = memoryWeight(memory);
    for (const term of terms) {
      const normalized = term.trim();
      if (!normalized || normalized.length > 32 || blockedValues.has(normalizeText(normalized))) {
        continue;
      }
      const entry = scoreByTerm.get(normalized) ?? { score: 0, evidenceRefs: new Set<string>() };
      entry.score += score;
      entry.evidenceRefs.add(memory.id);
      scoreByTerm.set(normalized, entry);
    }
  }

  const sorted = [...scoreByTerm.entries()]
    .sort((left, right) => {
      if (right[1].score !== left[1].score) {
        return right[1].score - left[1].score;
      }
      return left[0].localeCompare(right[0]);
    })
    .slice(0, PROFILE_MAX_DERIVED_ITEMS);

  const maxScore = sorted[0]?.[1].score ?? 1;
  return sorted.map(([value, item]) => createDerivedField(
    value,
    Number(Math.min(1, item.score / maxScore).toFixed(3)),
    item.evidenceRefs,
  ));
}

export function collectWorkPatterns(
  memories: MemoryItem[],
  explicitConstraints: Array<ProfileStableField>,
): ProjectedProfile['derived']['workPatterns'] {
  const explicitText = explicitConstraints.map((item) => item.value).join(' ');
  const scoreByPattern = new Map<string, DerivedAccumulator>();

  for (const memory of memories) {
    const score = memoryWeight(memory);
    for (const pattern of WORK_PATTERN_RULES) {
      if (!pattern.regex.test(memory.content)) {
        continue;
      }

      if (pattern.regex.test(explicitText)) {
        continue;
      }

      const entry = scoreByPattern.get(pattern.value) ?? { score: 0, evidenceRefs: new Set<string>() };
      entry.score += score;
      entry.evidenceRefs.add(memory.id);
      scoreByPattern.set(pattern.value, entry);
    }
  }

  const sorted = [...scoreByPattern.entries()]
    .sort((left, right) => {
      if (right[1].score !== left[1].score) {
        return right[1].score - left[1].score;
      }
      return left[0].localeCompare(right[0]);
    })
    .slice(0, PROFILE_MAX_DERIVED_ITEMS);

  const maxScore = sorted[0]?.[1].score ?? 1;
  return sorted.map(([value, item]) => createDerivedField(
    value,
    Number(Math.min(1, item.score / maxScore).toFixed(3)),
    item.evidenceRefs,
  ));
}

export function collectCommunicationStyle(memories: MemoryItem[]): ProjectedProfile['derived']['communicationStyle'] {
  const scoreByStyle = new Map<string, DerivedAccumulator>();
  for (const memory of memories) {
    if (memory.type !== 'style' && memory.type !== 'preference' && memory.type !== 'summary') {
      continue;
    }

    const score = memoryWeight(memory);
    for (const style of COMMUNICATION_STYLE_RULES) {
      if (!style.regex.test(memory.content)) {
        continue;
      }

      const entry = scoreByStyle.get(style.value) ?? { score: 0, evidenceRefs: new Set<string>() };
      entry.score += score;
      entry.evidenceRefs.add(memory.id);
      scoreByStyle.set(style.value, entry);
    }
  }

  const sorted = [...scoreByStyle.entries()].sort((left, right) => right[1].score - left[1].score);
  const top = sorted[0];
  if (!top) {
    return undefined;
  }

  const total = sorted.reduce((sum, item) => sum + item[1].score, 0);
  const confidence = total > 0 ? Math.min(1, top[1].score / total) : 0;
  return {
    tendency: top[0],
    confidence: Number(confidence.toFixed(3)),
    evidenceRefs: [...top[1].evidenceRefs].slice(0, 3),
    source: 'derived_inference',
    guardrail: 'weak_hint',
    canonical: false,
  };
}
