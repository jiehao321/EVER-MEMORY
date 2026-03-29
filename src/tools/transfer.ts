import type { MemoryTransferService } from '../core/memory/transfer.js';
import type {
  EverMemoryExportToolInput,
  EverMemoryExportToolResult,
  EverMemoryImportToolInput,
  EverMemoryImportToolResult,
} from '../types.js';

export function evermemoryExport(
  transferService: MemoryTransferService,
  input: EverMemoryExportToolInput = {},
): EverMemoryExportToolResult {
  return transferService.exportSnapshot(input);
}

export function evermemoryImport(
  transferService: MemoryTransferService,
  input: EverMemoryImportToolInput,
): EverMemoryImportToolResult {
  return transferService.importSnapshot(input);
}
