import type { BehaviorRepository } from '../../storage/behaviorRepo.js';
import type { DebugRepository } from '../../storage/debugRepo.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { ProfileRepository } from '../../storage/profileRepo.js';
import type { MemoryItem, ProfileStableField, ProjectedProfile } from '../../types.js';
import {
  PROFILE_EXPLICIT_THRESHOLD,
  PROFILE_MAX_BEHAVIOR_HINTS,
  PROFILE_MAX_MEMORY_SCAN,
} from '../../tuning.js';
import { ProfileError } from '../../errors.js';
import {
  collectCommunicationStyle,
  collectLikelyInterests,
  collectWorkPatterns,
  detectPreferenceKey,
  detectPreferenceValue,
  extractDisplayName,
  extractPreferredAddress,
  extractTimezone,
  memoryWeight,
  shouldKeepConstraint,
} from './projectionRules.js';

interface ProfileProjectionServiceOptions {
  maxMemoryScan?: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isExplicit(memory: MemoryItem): boolean {
  return memory.source.kind !== 'inference' && memory.scores.explicitness >= PROFILE_EXPLICIT_THRESHOLD;
}

function createStableField<T extends string>(value: T, evidenceRefs: Iterable<string>): ProfileStableField<T> {
  return {
    value,
    source: 'stable_explicit',
    canonical: true,
    evidenceRefs: [...new Set(evidenceRefs)].slice(0, 3),
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

function isReservedBehaviorHint(value: string): boolean {
  return value.startsWith('system:');
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
    this.maxMemoryScan = options.maxMemoryScan ?? PROFILE_MAX_MEMORY_SCAN;
  }

  recomputeForUser(userId: string): ProjectedProfile | null {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      return null;
    }
    try {
      const existingProfile = this.profileRepo.getByUserId(normalizedUserId);
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

      const explicitPreferences: Record<string, ProfileStableField> = {};
      const explicitConstraints: Array<ProfileStableField> = [];
      let displayName: ProfileStableField | undefined;
      let preferredAddress: ProfileStableField | undefined;
      let timezone: ProfileStableField | undefined;

      for (const memory of explicitMemories) {
        if (!displayName) {
          const value = extractDisplayName(memory.content);
          if (value) {
            displayName = createStableField(value, [memory.id]);
          }
        }
        if (!preferredAddress) {
          const value = extractPreferredAddress(memory.content);
          if (value) {
            preferredAddress = createStableField(value, [memory.id]);
          }
        }
        if (!timezone) {
          const value = extractTimezone(memory.content);
          if (value) {
            timezone = createStableField(value, [memory.id]);
          }
        }

        if (memory.type === 'constraint' && shouldKeepConstraint(memory.content)) {
          explicitConstraints.push(createStableField(memory.content.trim(), [memory.id]));
        }

        if (memory.type === 'preference' || memory.type === 'style' || memory.type === 'identity') {
          const key = detectPreferenceKey(memory);
          if (key && explicitPreferences[key] === undefined) {
            explicitPreferences[key] = createStableField(detectPreferenceValue(key, memory.content), [memory.id]);
          }
        }
      }

      if (!timezone && explicitPreferences.timezone) {
        timezone = explicitPreferences.timezone;
      }

      const communicationStyle = explicitPreferences.communication_style
        ? undefined
        : collectCommunicationStyle(memories);

      const likelyInterests = collectLikelyInterests(memories, explicitPreferences, explicitConstraints);
      const workPatterns = collectWorkPatterns(memories, explicitConstraints);
      const behaviorHints = dedupeStrings(
        [
          ...(existingProfile?.behaviorHints.filter(isReservedBehaviorHint) ?? []),
          ...this.behaviorRepo
            .listActiveCandidates({ userId: normalizedUserId, limit: PROFILE_MAX_BEHAVIOR_HINTS })
            .map((rule) => rule.statement),
        ],
      ).slice(0, PROFILE_MAX_BEHAVIOR_HINTS);

      const profile: ProjectedProfile = {
        userId: normalizedUserId,
        updatedAt: nowIso(),
        stable: {
          displayName,
          preferredAddress,
          timezone,
          explicitPreferences,
          explicitConstraints,
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
        stable: {
          displayName: profile.stable.displayName?.value,
          preferredAddress: profile.stable.preferredAddress?.value,
          timezone: profile.stable.timezone?.value,
          explicitPreferences: Object.fromEntries(
            Object.entries(explicitPreferences).map(([key, value]) => [key, {
              value: value.value,
              source: value.source,
              canonical: value.canonical,
              evidenceRefs: value.evidenceRefs,
            }]),
          ),
          explicitConstraints: profile.stable.explicitConstraints.map((item) => ({
            value: item.value,
            source: item.source,
            canonical: item.canonical,
            evidenceRefs: item.evidenceRefs,
          })),
        },
        derived: {
          communicationStyle: profile.derived.communicationStyle
            ? {
                tendency: profile.derived.communicationStyle.tendency,
                confidence: profile.derived.communicationStyle.confidence,
                evidenceRefs: profile.derived.communicationStyle.evidenceRefs,
                source: profile.derived.communicationStyle.source,
                guardrail: profile.derived.communicationStyle.guardrail,
                canonical: profile.derived.communicationStyle.canonical,
              }
            : null,
          likelyInterests: profile.derived.likelyInterests.map((item) => ({
            value: item.value,
            confidence: item.confidence,
            evidenceRefs: item.evidenceRefs,
            source: item.source,
            guardrail: item.guardrail,
            canonical: item.canonical,
          })),
          workPatterns: profile.derived.workPatterns.map((item) => ({
            value: item.value,
            confidence: item.confidence,
            evidenceRefs: item.evidenceRefs,
            source: item.source,
            guardrail: item.guardrail,
            canonical: item.canonical,
          })),
        },
        behaviorHints: behaviorHints.length,
      });

      return profile;
    } catch (error) {
      if (error instanceof ProfileError) {
        throw error;
      }
      throw new ProfileError('Failed to recompute projected profile.', {
        code: 'PROFILE_RECOMPUTE_FAILED',
        context: {
          userId: normalizedUserId,
          maxMemoryScan: this.maxMemoryScan,
        },
        cause: error,
      });
    }
  }

  getByUserId(userId: string, recompute = false): ProjectedProfile | null {
    try {
      if (recompute) {
        return this.recomputeForUser(userId);
      }
      return this.profileRepo.getByUserId(userId);
    } catch (error) {
      if (error instanceof ProfileError) {
        throw error;
      }
      throw new ProfileError('Failed to load projected profile.', {
        code: 'PROFILE_LOOKUP_FAILED',
        context: {
          userId,
          recompute,
        },
        cause: error,
      });
    }
  }
}
