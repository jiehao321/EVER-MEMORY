import type Database from 'better-sqlite3';
import { MemoryRepository } from '../../src/storage/memoryRepo.js';
import { SemanticRepository } from '../../src/storage/semanticRepo.js';
import { RetrievalStrategySupport } from '../../src/retrieval/strategies/policy.js';
import type { MemoryItem } from '../../src/types.js';
import type { RecallExecutionMeta } from '../../src/retrieval/strategies/support.js';
import { createInMemoryDb, buildMemory } from '../storage/helpers.js';

export interface RetrievalTestFixture {
  db: Database.Database;
  memoryRepo: MemoryRepository;
  semanticRepo: SemanticRepository;
  support: RetrievalStrategySupport;
  close(): void;
}

export function createRetrievalFixture(semanticCandidateLimit = 20): RetrievalTestFixture {
  const db = createInMemoryDb();
  const memoryRepo = new MemoryRepository(db);
  const semanticRepo = new SemanticRepository(db);
  const support = new RetrievalStrategySupport(memoryRepo, semanticCandidateLimit);

  return {
    db,
    memoryRepo,
    semanticRepo,
    support,
    close() {
      db.close();
    },
  };
}

export function createExecutionMeta(overrides: Partial<RecallExecutionMeta> = {}): RecallExecutionMeta {
  return {
    routeKind: 'none',
    routeApplied: false,
    projectOriented: false,
    routeReason: 'none',
    routeScore: 0,
    routeProjectSignal: false,
    hasProjectScope: false,
    intentProjectOriented: false,
    ...overrides,
  };
}

export function createRetrievalMemory(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return buildMemory({
    source: {
      kind: 'manual',
      actor: 'system',
      ...overrides.source,
    },
    scope: {
      userId: 'user-1',
      global: false,
      ...overrides.scope,
    },
    lifecycle: overrides.lifecycle ?? 'semantic',
    state: {
      active: true,
      archived: false,
      ...overrides.state,
    },
    tags: overrides.tags ?? [],
    ...overrides,
  });
}

export async function insertMemory(
  fixture: RetrievalTestFixture,
  memory: MemoryItem,
  options: {
    semanticIndex?: boolean;
    embedding?: Float32Array;
    embeddingModel?: string;
  } = {},
): Promise<void> {
  fixture.memoryRepo.insert(memory);
  if (options.semanticIndex !== false) {
    fixture.semanticRepo.upsertFromMemory(memory);
  }
  if (options.embedding) {
    await fixture.semanticRepo.storeEmbedding(
      memory.id,
      options.embedding,
      options.embeddingModel ?? 'test-model',
    );
  }
}
