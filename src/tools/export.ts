import type { MemoryTransferService } from '../core/memory/transfer.js';
import type { EverMemoryExportToolInput, EverMemoryExportToolResult } from '../types.js';

export function evermemoryExport(
  transferService: MemoryTransferService,
  input: EverMemoryExportToolInput = {},
): EverMemoryExportToolResult {
  return transferService.exportSnapshot(input);
}
