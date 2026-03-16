import { randomUUID } from 'node:crypto';
import type { DebugRepository } from '../storage/debugRepo.js';
import type { MemoryRepository } from '../storage/memoryRepo.js';
import type { SemanticRepository } from '../storage/semanticRepo.js';
import { embeddingManager } from '../embedding/manager.js';
import type { MemoryItem, MemoryLifecycle, MemoryScope, MemoryType } from '../types.js';

export type EverMemoryEditAction = 'update' | 'delete' | 'correct';

export interface EverMemoryEditToolInput {
  memoryId: string;
  action: EverMemoryEditAction;
  newContent?: string;
  reason?: string;
}

export interface EverMemoryEditMemorySummary {
  id: string;
  content: string;
  type: MemoryType;
  lifecycle: MemoryLifecycle;
}

export interface EverMemoryEditToolResult {
  success: boolean;
  error?: string;
  previous: EverMemoryEditMemorySummary | null;
  current: EverMemoryEditMemorySummary | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toSummary(memory: MemoryItem): EverMemoryEditMemorySummary {
  return {
    id: memory.id,
    content: memory.content,
    type: memory.type,
    lifecycle: memory.lifecycle,
  };
}

export async function evermemoryEdit(
  memoryRepo: MemoryRepository,
  debugRepo: DebugRepository,
  semanticRepo: SemanticRepository | undefined,
  input: EverMemoryEditToolInput,
  callerScope?: MemoryScope,
): Promise<EverMemoryEditToolResult> {
  const memory = memoryRepo.findById(input.memoryId);
  if (!memory) {
    return {
      success: false,
      error: `Memory not found: ${input.memoryId}`,
      previous: null,
      current: null,
    };
  }

  // Scope-ownership check: if a caller scope is provided, verify the memory belongs to that scope
  if (callerScope && callerScope.userId !== undefined) {
    const memUserId = memory.scope?.userId;
    if (memUserId !== undefined && memUserId !== callerScope.userId) {
      return {
        success: false,
        error: `Access denied: memory does not belong to the current session scope`,
        previous: null,
        current: null,
      };
    }
  }

  const previous = toSummary(memory);
  const timestamp = nowIso();

  if (input.action === 'delete') {
    const deleted: MemoryItem = {
      ...memory,
      lifecycle: 'archive',
      timestamps: { ...memory.timestamps, updatedAt: timestamp },
      state: {
        ...memory.state,
        active: false,
        archived: true,
      },
      tags: [...memory.tags, 'deleted_by_user'],
    };
    memoryRepo.update(deleted);
    debugRepo.log('memory_archived', memory.id, {
      action: 'user_delete',
      reason: input.reason ?? 'user_requested',
    });
    return { success: true, previous, current: null };
  }

  if (input.action === 'update' || input.action === 'correct') {
    const newContent = (input.newContent ?? '').trim();
    if (!newContent) {
      return { success: false, error: 'newContent is required for update/correct actions', previous, current: null };
    }

    if (input.action === 'correct') {
      // For 'correct': supersede old version with new one
      const newId = randomUUID();
      const corrected: MemoryItem = {
        ...memory,
        id: newId,
        content: newContent,
        timestamps: { ...memory.timestamps, createdAt: timestamp, updatedAt: timestamp },
        state: { ...memory.state, active: true, archived: false },
        stats: { accessCount: 0, retrievalCount: 0 },
      };
      memoryRepo.insert(corrected);

      const superseded: MemoryItem = {
        ...memory,
        lifecycle: 'archive',
        timestamps: { ...memory.timestamps, updatedAt: timestamp },
        state: {
          ...memory.state,
          active: false,
          archived: true,
          supersededBy: newId,
        },
        tags: [...memory.tags, 'superseded_by_user'],
      };
      memoryRepo.update(superseded);

      // Re-embed the new memory
      void generateEmbeddingAsync(semanticRepo, newId, newContent);

      debugRepo.log('memory_write_decision', newId, {
        action: 'user_correct',
        reason: input.reason ?? 'user_correction',
        supersedes: memory.id,
      });

      return { success: true, previous, current: toSummary(corrected) };
    }

    // Regular update: modify content in-place
    const updated: MemoryItem = {
      ...memory,
      content: newContent,
      timestamps: { ...memory.timestamps, updatedAt: timestamp },
    };
    memoryRepo.update(updated);

    // Re-embed updated content
    void generateEmbeddingAsync(semanticRepo, memory.id, newContent);

    debugRepo.log('memory_write_decision', memory.id, {
      action: 'user_update',
      reason: input.reason ?? 'user_edit',
    });

    return { success: true, previous, current: toSummary(updated) };
  }

  return { success: false, error: `Unknown action: ${String(input.action)}`, previous, current: null };
}

async function generateEmbeddingAsync(
  semanticRepo: SemanticRepository | undefined,
  memoryId: string,
  content: string,
): Promise<void> {
  if (!semanticRepo || !embeddingManager.isReady()) {
    return;
  }
  try {
    const vector = await embeddingManager.embed(content);
    if (vector) {
      await semanticRepo.storeEmbedding(memoryId, vector.values, embeddingManager.providerKind);
    }
  } catch {
    // best-effort embedding
  }
}
