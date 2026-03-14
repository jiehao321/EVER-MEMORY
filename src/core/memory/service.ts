import { randomUUID } from 'node:crypto';
import { MemoryLifecycleService } from './lifecycle.js';
import type { ConsolidationReport, ConsolidationRequest } from './lifecycle.js';
import type { ProfileProjectionService } from '../profile/projection.js';
import { evaluateWrite } from '../policy/write.js';
import type { DebugRepository } from '../../storage/debugRepo.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { SemanticRepository } from '../../storage/semanticRepo.js';
import { embeddingManager } from '../../embedding/manager.js';
import type {
  MemoryItem,
  MemoryScope,
  MemoryStoreInput,
  MemoryStoreResult,
  WriteDecision,
} from '../../types.js';

interface MemoryServiceOptions {
  semanticEnabled?: boolean;
  semanticRepo?: SemanticRepository;
  lifecycleService?: MemoryLifecycleService;
  profileProjectionService?: ProfileProjectionService;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeMemory(
  input: MemoryStoreInput,
  decision: WriteDecision,
  fallbackScope?: MemoryScope,
): MemoryItem {
  const createdAt = input.createdAt ?? nowIso();
  const updatedAt = input.updatedAt ?? createdAt;

  return {
    id: input.id ?? randomUUID(),
    content: input.content.trim(),
    type: decision.type!,
    lifecycle: decision.lifecycle!,
    source: input.source,
    scope: input.scope ?? fallbackScope ?? {},
    scores: {
      confidence: decision.confidence ?? 0.8,
      importance: decision.importance ?? 0.5,
      explicitness: decision.explicitness ?? 1,
    },
    timestamps: {
      createdAt,
      updatedAt,
    },
    state: {
      active: input.active ?? true,
      archived: input.archived ?? false,
      supersededBy: input.supersededBy,
    },
    evidence: {
      excerpt: input.evidence?.excerpt,
      references: input.evidence?.references ?? [],
    },
    tags: input.tags ?? [],
    relatedEntities: input.relatedEntities ?? [],
    stats: {
      accessCount: 0,
      retrievalCount: 0,
    },
  };
}

export class MemoryService {
  private readonly semanticEnabled: boolean;
  private readonly semanticRepo?: SemanticRepository;
  private readonly lifecycleService: MemoryLifecycleService;
  private readonly profileProjectionService?: ProfileProjectionService;

  constructor(
    private readonly memoryRepo: MemoryRepository,
    private readonly debugRepo?: DebugRepository,
    options: MemoryServiceOptions = {},
  ) {
    this.semanticEnabled = options.semanticEnabled ?? false;
    this.semanticRepo = options.semanticRepo;
    this.lifecycleService = options.lifecycleService ?? new MemoryLifecycleService(
      this.memoryRepo,
      this.debugRepo,
    );
    this.profileProjectionService = options.profileProjectionService;
  }

  store(input: MemoryStoreInput, fallbackScope?: MemoryScope): MemoryStoreResult {
    const decision = evaluateWrite(input);

    if (!decision.accepted) {
      this.debugRepo?.log('memory_write_rejected', input.id, {
        accepted: false,
        reason: decision.reason,
      });
      return {
        accepted: false,
        reason: decision.reason,
        memory: null,
      };
    }

    const memory = normalizeMemory(input, decision, fallbackScope);
    this.memoryRepo.insert(memory);
    if (this.semanticEnabled && this.semanticRepo) {
      this.semanticRepo.upsertFromMemory(memory);
      this.debugRepo?.log('semantic_indexed', memory.id, {
        memoryId: memory.id,
        updatedAt: memory.timestamps.updatedAt,
      });
    }
    this.triggerEmbeddingGeneration(memory);
    const maintenance = this.lifecycleService.maintainForNewMemory(memory.id);
    const projectedProfile = memory.scope.userId && this.profileProjectionService
      ? this.profileProjectionService.recomputeForUser(memory.scope.userId)
      : null;
    this.debugRepo?.log('memory_write_decision', memory.id, {
      accepted: true,
      reason: decision.reason,
      type: memory.type,
      lifecycle: memory.lifecycle,
      confidence: memory.scores.confidence,
      importance: memory.scores.importance,
      explicitness: memory.scores.explicitness,
      merged: maintenance.merged,
      archivedStale: maintenance.archivedStale,
      profileRecomputed: Boolean(projectedProfile),
    });

    return {
      accepted: true,
      reason: decision.reason,
      memory,
    };
  }

  getById(id: string): MemoryItem | null {
    const memory = this.memoryRepo.findById(id);
    if (memory) {
      this.memoryRepo.incrementAccess(id);
    }
    return memory;
  }

  listRecent(scope?: MemoryScope, limit = 10): MemoryItem[] {
    return this.memoryRepo.listRecent(scope, limit);
  }

  consolidate(input: ConsolidationRequest = {}): ConsolidationReport {
    return this.lifecycleService.consolidate(input);
  }

  private triggerEmbeddingGeneration(memory: MemoryItem): void {
    if (!this.semanticRepo) {
      return;
    }
    void this.generateEmbeddingAsync(this.semanticRepo, memory.id, memory.content);
  }

  private async generateEmbeddingAsync(
    repo: SemanticRepository,
    memoryId: string,
    content: string,
  ): Promise<void> {
    if (!embeddingManager.isReady()) {
      return;
    }
    try {
      const vector = await embeddingManager.embed(content);
      if (!vector) {
        return;
      }
      await repo.storeEmbedding(memoryId, vector.values, embeddingManager.providerKind);
    } catch {
      // best-effort only
    }
  }
}
