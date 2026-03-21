import { exportSnapshot as runExportSnapshot } from './transferExport.js';
import { importSnapshot as runImportSnapshot } from './transferImport.js';
export class MemoryTransferService {
    memoryRepo;
    debugRepo;
    semanticEnabled;
    semanticRepo;
    profileService;
    constructor(memoryRepo, debugRepo, options = {}) {
        this.memoryRepo = memoryRepo;
        this.debugRepo = debugRepo;
        this.semanticEnabled = options.semanticEnabled ?? false;
        this.semanticRepo = options.semanticRepo;
        this.profileService = options.profileService;
    }
    exportSnapshot(input = {}) {
        return runExportSnapshot({
            memoryRepo: this.memoryRepo,
            debugRepo: this.debugRepo,
        }, input);
    }
    importSnapshot(input) {
        return runImportSnapshot({
            memoryRepo: this.memoryRepo,
            debugRepo: this.debugRepo,
            semanticEnabled: this.semanticEnabled,
            semanticRepo: this.semanticRepo,
            profileService: this.profileService,
        }, input);
    }
}
