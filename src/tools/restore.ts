import type { MemoryArchiveService } from '../core/memory/archive.js';
import type { EverMemoryRestoreToolInput, EverMemoryRestoreToolResult } from '../types.js';

export function evermemoryRestore(
  archiveService: MemoryArchiveService,
  input: EverMemoryRestoreToolInput,
): EverMemoryRestoreToolResult {
  return archiveService.restoreArchived(input);
}
