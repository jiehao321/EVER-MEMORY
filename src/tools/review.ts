import type { MemoryArchiveService } from '../core/memory/archive.js';
import type { EverMemoryReviewToolInput, EverMemoryReviewToolResult } from '../types.js';

export function evermemoryReview(
  archiveService: MemoryArchiveService,
  input: EverMemoryReviewToolInput = {},
): EverMemoryReviewToolResult {
  return archiveService.reviewArchived(input);
}
