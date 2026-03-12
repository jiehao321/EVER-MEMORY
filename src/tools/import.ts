import type { MemoryTransferService } from '../core/memory/transfer.js';
import type { EverMemoryImportToolInput, EverMemoryImportToolResult } from '../types.js';

export function evermemoryImport(
  transferService: MemoryTransferService,
  input: EverMemoryImportToolInput,
): EverMemoryImportToolResult {
  return transferService.importSnapshot(input);
}
