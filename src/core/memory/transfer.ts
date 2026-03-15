import type { ProfileProjectionService } from '../profile/projection.js';
import type { DebugRepository } from '../../storage/debugRepo.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { SemanticRepository } from '../../storage/semanticRepo.js';
import type {
  EverMemoryExportToolInput,
  EverMemoryExportToolResult,
  EverMemoryImportToolInput,
  EverMemoryImportToolResult,
} from '../../types.js';
import { exportSnapshot as runExportSnapshot } from './transferExport.js';
import { importSnapshot as runImportSnapshot } from './transferImport.js';

export interface MemoryTransferServiceOptions {
  semanticEnabled?: boolean;
  semanticRepo?: SemanticRepository;
  profileService?: ProfileProjectionService;
}

export class MemoryTransferService {
  private readonly semanticEnabled: boolean;
  private readonly semanticRepo?: SemanticRepository;
  private readonly profileService?: ProfileProjectionService;

  constructor(
    private readonly memoryRepo: MemoryRepository,
    private readonly debugRepo?: DebugRepository,
    options: MemoryTransferServiceOptions = {},
  ) {
    this.semanticEnabled = options.semanticEnabled ?? false;
    this.semanticRepo = options.semanticRepo;
    this.profileService = options.profileService;
  }

  exportSnapshot(input: EverMemoryExportToolInput = {}): EverMemoryExportToolResult {
    return runExportSnapshot(
      {
        memoryRepo: this.memoryRepo,
        debugRepo: this.debugRepo,
      },
      input,
    );
  }

  importSnapshot(input: EverMemoryImportToolInput): EverMemoryImportToolResult {
    return runImportSnapshot(
      {
        memoryRepo: this.memoryRepo,
        debugRepo: this.debugRepo,
        semanticEnabled: this.semanticEnabled,
        semanticRepo: this.semanticRepo,
        profileService: this.profileService,
      },
      input,
    );
  }
}
