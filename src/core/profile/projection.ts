import type { BehaviorRepository } from '../../storage/behaviorRepo.js';
import type { DebugRepository } from '../../storage/debugRepo.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { ProfileRepository } from '../../storage/profileRepo.js';
import type { MemoryItem, ProjectedProfile } from '../../types.js';
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

const EXPLICIT_THRESHOLD = 0.75;
const MAX_PROFILE_MEMORY_SCAN = 300;
const MAX_DERIVED_ITEMS = 3;
const MAX_BEHAVIOR_HINTS = 8;

interface DerivedAccumulator {
  score: number;
  evidenceRefs: Set<string>;
}

interface ProfileProjectionServiceOptions {
  maxMemoryScan?: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/[.,!?;:()[\]{}"'`~|\\/，。！？；：、（）【】《》“”‘’]/g, ' ')
    .replace(/\s+/g, ' ');
}

function extractDisplayName(content: string): string | undefined {
  const match = content.match(DISPLAY_NAME_REGEX);
  return match?.[1]?.trim() || undefined;
}

function extractPreferredAddress(content: string): string | undefined {
  const match = content.match(PREFERRED_ADDRESS_REGEX);
  return match?.[1]?.trim() || undefined;
}

function extractTimezone(content: string): string | undefined {
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

function memoryWeight(memory: MemoryItem): number {
  return (
    memory.scores.importance * 0.4
    + memory.scores.confidence * 0.35
    + memory.scores.explicitness * 0.25
  );
}

function isExplicit(memory: MemoryItem): boolean {
  return memory.source.kind !== 'inference' && memory.scores.explicitness >= EXPLICIT_THRESHOLD;
}

function sanitizePreferenceKey(raw: string): string | undefined {
  const key = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_\-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return key.length > 0 ? key : undefined;
}

function detectPreferenceKey(memory: MemoryItem): string | undefined {
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

function detectPreferenceValue(key: string, content: string): string {
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

function shouldKeepConstraint(constraint: string): boolean {
  return constraint.trim().length >= 3;
}

function collectLikelyInterests(memories: MemoryItem[]): ProjectedProfile['derived']['likelyInterests'] {
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
      if (!normalized || normalized.length > 32) {
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
    .slice(0, MAX_DERIVED_ITEMS);

  const maxScore = sorted[0]?.[1].score ?? 1;
  return sorted.map(([value, item]) => ({
    value,
    confidence: Number(Math.min(1, item.score / maxScore).toFixed(3)),
    evidenceRefs: [...item.evidenceRefs].slice(0, 3),
  }));
}

function collectWorkPatterns(
  memories: MemoryItem[],
  explicitConstraints: string[],
): ProjectedProfile['derived']['workPatterns'] {
  const explicitText = explicitConstraints.join(' ');
  const scoreByPattern = new Map<string, DerivedAccumulator>();

  for (const memory of memories) {
    const score = memoryWeight(memory);
    for (const pattern of WORK_PATTERN_RULES) {
      if (!pattern.regex.test(memory.content)) {
        continue;
      }

      // Derived hints must not override explicit stable constraints in the same theme.
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
    .slice(0, MAX_DERIVED_ITEMS);

  const maxScore = sorted[0]?.[1].score ?? 1;
  return sorted.map(([value, item]) => ({
    value,
    confidence: Number(Math.min(1, item.score / maxScore).toFixed(3)),
    evidenceRefs: [...item.evidenceRefs].slice(0, 3),
  }));
}

function collectCommunicationStyle(memories: MemoryItem[]): ProjectedProfile['derived']['communicationStyle'] {
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
  };
}

function dedupeStrings(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export class ProfileProjectionService {
  private readonly maxMemoryScan: number;

  constructor(
    private readonly memoryRepo: MemoryRepository,
    private readonly behaviorRepo: BehaviorRepository,
    private readonly profileRepo: ProfileRepository,
    private readonly debugRepo?: DebugRepository,
    options: ProfileProjectionServiceOptions = {},
  ) {
    this.maxMemoryScan = options.maxMemoryScan ?? MAX_PROFILE_MEMORY_SCAN;
  }

  recomputeForUser(userId: string): ProjectedProfile | null {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      return null;
    }

    const memories = this.memoryRepo.search({
      scope: { userId: normalizedUserId },
      activeOnly: true,
      archived: false,
      limit: this.maxMemoryScan,
    });
    const explicitMemories = memories.filter(isExplicit)
      .sort((left, right) => {
        const scoreGap = memoryWeight(right) - memoryWeight(left);
        if (Math.abs(scoreGap) > 0.0001) {
          return scoreGap;
        }
        return right.timestamps.updatedAt.localeCompare(left.timestamps.updatedAt);
      });

    const explicitPreferences: Record<string, string> = {};
    const explicitConstraints: string[] = [];
    let displayName: string | undefined;
    let preferredAddress: string | undefined;
    let timezone: string | undefined;

    for (const memory of explicitMemories) {
      if (!displayName) {
        displayName = extractDisplayName(memory.content);
      }
      if (!preferredAddress) {
        preferredAddress = extractPreferredAddress(memory.content);
      }
      if (!timezone) {
        timezone = extractTimezone(memory.content);
      }

      if (memory.type === 'constraint' && shouldKeepConstraint(memory.content)) {
        explicitConstraints.push(memory.content.trim());
      }

      if (memory.type === 'preference' || memory.type === 'style' || memory.type === 'identity') {
        const key = detectPreferenceKey(memory);
        if (key && explicitPreferences[key] === undefined) {
          explicitPreferences[key] = detectPreferenceValue(key, memory.content);
        }
      }
    }

    if (!timezone && explicitPreferences.timezone) {
      timezone = explicitPreferences.timezone;
    }

    const communicationStyle = explicitPreferences.communication_style
      ? undefined
      : collectCommunicationStyle(memories);

    const likelyInterests = collectLikelyInterests(memories);
    const workPatterns = collectWorkPatterns(memories, explicitConstraints);
    const behaviorHints = dedupeStrings(
      this.behaviorRepo
        .listActiveCandidates({ userId: normalizedUserId, limit: MAX_BEHAVIOR_HINTS })
        .map((rule) => rule.statement),
    ).slice(0, MAX_BEHAVIOR_HINTS);

    const profile: ProjectedProfile = {
      userId: normalizedUserId,
      updatedAt: nowIso(),
      stable: {
        displayName,
        preferredAddress,
        timezone,
        explicitPreferences,
        explicitConstraints: dedupeStrings(explicitConstraints),
      },
      derived: {
        communicationStyle,
        likelyInterests,
        workPatterns,
      },
      behaviorHints,
    };

    this.profileRepo.upsert(profile);
    this.debugRepo?.log('profile_recomputed', normalizedUserId, {
      userId: normalizedUserId,
      memoryCount: memories.length,
      explicitPreferences: Object.keys(explicitPreferences),
      explicitConstraints: profile.stable.explicitConstraints.length,
      derived: {
        communicationStyle: profile.derived.communicationStyle?.tendency,
        likelyInterests: profile.derived.likelyInterests.length,
        workPatterns: profile.derived.workPatterns.length,
      },
      behaviorHints: behaviorHints.length,
    });

    return profile;
  }

  getByUserId(userId: string, recompute = false): ProjectedProfile | null {
    if (recompute) {
      return this.recomputeForUser(userId);
    }
    return this.profileRepo.getByUserId(userId);
  }
}
