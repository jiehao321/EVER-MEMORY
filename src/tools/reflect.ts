import type { ExperienceRepository } from '../storage/experienceRepo.js';
import type { ReflectionService } from '../core/reflection/service.js';
import type { EverMemoryReflectToolInput, EverMemoryReflectToolResult } from '../types.js';

export function evermemoryReflect(
  reflectionService: ReflectionService,
  experienceRepo: ExperienceRepository,
  input: EverMemoryReflectToolInput = {},
): EverMemoryReflectToolResult {
  const mode = input.mode ?? 'light';
  const experiences = input.sessionId
    ? experienceRepo.listRecentBySession(input.sessionId, mode === 'full' ? 20 : 8)
    : experienceRepo.listRecent(mode === 'full' ? 20 : 8);

  const result = reflectionService.reflect({
    triggerKind: 'manual-review',
    sessionId: input.sessionId,
    experienceIds: experiences.map((item) => item.id),
    mode,
  });

  const reflections = result.reflection ? [result.reflection] : [];

  return {
    reflections,
    candidateRules: result.reflection?.candidateRules ?? [],
    summary: {
      processedExperiences: result.processedExperiences,
      createdReflections: reflections.length,
    },
  };
}
