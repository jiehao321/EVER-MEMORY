import type { MemoryArchiveService } from '../core/memory/archive.js';
import type { BehaviorService } from '../core/behavior/service.js';
import type { EverMemoryReviewToolInput, EverMemoryReviewToolResult } from '../types.js';

export function evermemoryReview(
  archiveService: MemoryArchiveService,
  behaviorService: BehaviorService,
  input: EverMemoryReviewToolInput = {},
): EverMemoryReviewToolResult {
  const archived = archiveService.reviewArchived(input);
  const ruleReview = input.ruleId ? behaviorService.reviewRule(input.ruleId) ?? undefined : undefined;

  return {
    ...archived,
    ruleReview,
  };
}
