import type { ProfileProjectionService } from '../core/profile/projection.js';
import type { ProfileRepository } from '../storage/profileRepo.js';
import type { EverMemoryProfileToolInput, EverMemoryProfileToolResult } from '../types.js';

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
    };
  }

  const latest = profileRepo.listRecent(1)[0] ?? null;
  return {
    profile: latest,
    source: latest ? 'latest' : 'none',
  };
}
