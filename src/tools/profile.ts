import type { OnboardingService } from '../core/profile/onboarding.js';
import type { ProfileProjectionService } from '../core/profile/projection.js';
import type { ProfileRepository } from '../storage/profileRepo.js';
import type {
  EverMemoryOnboardingToolInput,
  EverMemoryOnboardingToolResult,
  EverMemoryProfileToolInput,
  EverMemoryProfileToolResult,
} from '../types.js';

export function evermemoryProfile(
  profileService: ProfileProjectionService,
  profileRepo: ProfileRepository,
  input: EverMemoryProfileToolInput = {},
): EverMemoryProfileToolResult {
  const userId = input.userId?.trim();
  if (userId) {
    const profile = profileService.getByUserId(userId, input.recompute ?? false);
    return {
      profile,
      source: input.recompute ? 'recomputed' : (profile ? 'stored' : 'none'),
      summary: profile
        ? {
            stableCanonicalFields: [
              profile.stable.displayName,
              profile.stable.preferredAddress,
              profile.stable.timezone,
              ...Object.values(profile.stable.explicitPreferences),
              ...profile.stable.explicitConstraints,
            ].filter(Boolean).length,
            derivedHintFields:
              profile.derived.likelyInterests.length
              + profile.derived.workPatterns.length
              + (profile.derived.communicationStyle ? 1 : 0),
            derivedGuardrail: 'weak_hint_only',
          }
        : undefined,
    };
  }

  const latest = profileRepo.listRecent(1)[0] ?? null;
  return {
    profile: latest,
    source: latest ? 'latest' : 'none',
    summary: latest
      ? {
          stableCanonicalFields: [
            latest.stable.displayName,
            latest.stable.preferredAddress,
            latest.stable.timezone,
            ...Object.values(latest.stable.explicitPreferences),
            ...latest.stable.explicitConstraints,
          ].filter(Boolean).length,
          derivedHintFields:
            latest.derived.likelyInterests.length
            + latest.derived.workPatterns.length
            + (latest.derived.communicationStyle ? 1 : 0),
          derivedGuardrail: 'weak_hint_only',
        }
      : undefined,
  };
}

export async function evermemoryOnboard(
  onboardingService: OnboardingService,
  input: EverMemoryOnboardingToolInput,
): Promise<EverMemoryOnboardingToolResult> {
  const userId = input.userId?.trim();
  if (!userId) {
    return {
      needsOnboarding: true,
      questions: onboardingService.getQuestions(),
      welcomeMessage: onboardingService.generateWelcomeMessage(true),
    };
  }

  const needsOnboarding = onboardingService.isOnboardingNeeded(userId);
  if (!needsOnboarding) {
    return {
      needsOnboarding: false,
      questions: [],
      welcomeMessage: onboardingService.generateWelcomeMessage(false, undefined, userId),
    };
  }

  if (!input.responses || input.responses.length === 0) {
    return {
      needsOnboarding: true,
      questions: onboardingService.getQuestions(),
      welcomeMessage: onboardingService.generateWelcomeMessage(true, undefined, userId),
    };
  }

  return {
    needsOnboarding: false,
    questions: [],
    completionMessage: '✓ 初始化完成！我已记录您的偏好。随时可以开始工作。',
    result: await onboardingService.processResponses(userId, input.responses),
  };
}
