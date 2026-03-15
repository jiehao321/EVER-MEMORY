import { embeddingManager } from '../embedding/manager.js';
import type { MemoryRepository } from '../storage/memoryRepo.js';
import type { SemanticRepository } from '../storage/semanticRepo.js';
import type { BehaviorRule, MemoryItem, MemoryScope, SemanticEmbeddingSearchHit } from '../types.js';

export interface SemanticPreloadResult {
  readonly ids: readonly string[];
  readonly hits: readonly SemanticEmbeddingSearchHit[];
  readonly warnings: readonly string[];
  readonly relevantRules: readonly string[];
}

function matchesScope(scope: MemoryScope | undefined, memoryScope: MemoryScope | undefined): boolean {
  if (!scope) {
    return true;
  }
  if (scope.userId !== undefined && memoryScope?.userId !== scope.userId) {
    return false;
  }
  if (scope.project !== undefined && memoryScope?.project !== scope.project) {
    return false;
  }
  if (scope.chatId !== undefined && memoryScope?.chatId !== scope.chatId) {
    return false;
  }
  if (scope.global !== undefined && memoryScope?.global !== scope.global) {
    return false;
  }
  return true;
}

function normalize(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim();
  const tokens = normalized
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
  const cjkChunks = normalized.match(/[\u4e00-\u9fff]+/g) ?? [];

  for (const chunk of cjkChunks) {
    if (chunk.length === 1) {
      tokens.push(chunk);
      continue;
    }
    for (let index = 0; index < chunk.length - 1; index += 1) {
      tokens.push(chunk.slice(index, index + 2));
    }
  }

  return unique(tokens);
}

function unique<T>(items: readonly T[]): T[] {
  return Array.from(new Set(items));
}

function isWarningMemory(memory: MemoryItem): boolean {
  return memory.tags.includes('warning')
    || memory.tags.includes('lesson')
    || /^\s*\[(警告|踩坑)\]/u.test(memory.content);
}

function summarizeWarning(content: string, max = 120): string {
  const normalized = content.trim().replace(/\s+/g, ' ');
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 1)}…`;
}

function keywordOverlap(left: string, right: string): boolean {
  const leftTokens = new Set(normalize(left));
  const rightTokens = normalize(right);
  return rightTokens.some((token) => leftTokens.has(token));
}

export async function semanticPreload(
  queryText: string,
  scope: MemoryScope,
  semanticRepo: SemanticRepository,
  memoryRepo: MemoryRepository,
  limit = 5,
  minScore = 0.35,
  activeRules: readonly BehaviorRule[] = [],
): Promise<SemanticPreloadResult> {
  if (!embeddingManager.isReady()) {
    return {
      ids: [],
      hits: [],
      warnings: [],
      relevantRules: [],
    };
  }

  const queryVector = await embeddingManager.embed(queryText);
  if (!queryVector || queryVector.values.length === 0) {
    return {
      ids: [],
      hits: [],
      warnings: [],
      relevantRules: [],
    };
  }

  try {
    const candidates = await semanticRepo.searchByCosine(queryVector.values, limit * 3, minScore);
    const hits: SemanticEmbeddingSearchHit[] = [];
    const hitMemories = new Map<string, MemoryItem>();

    for (const candidate of candidates) {
      const memory = memoryRepo.findById(candidate.memoryId);
      if (!memory || !matchesScope(scope, memory.scope)) {
        continue;
      }

      hits.push(candidate);
      hitMemories.set(candidate.memoryId, memory);
      if (hits.length >= limit) {
        break;
      }
    }

    const warningHits = hits.filter((hit) => {
      const memory = hitMemories.get(hit.memoryId);
      return memory ? isWarningMemory(memory) : false;
    });
    const regularHits = hits.filter((hit) => !warningHits.includes(hit));
    const orderedHits = [...warningHits, ...regularHits];
    const relevantRules = unique(
      activeRules
        .filter((rule) => rule.state.active && !rule.state.deprecated && !rule.state.frozen)
        .filter((rule) => keywordOverlap(queryText, rule.statement))
        .map((rule) => rule.statement),
    );

    return {
      ids: orderedHits.map((hit) => hit.memoryId),
      hits: orderedHits,
      warnings: unique(
        warningHits
          .map((hit) => hitMemories.get(hit.memoryId))
          .filter((memory): memory is MemoryItem => Boolean(memory))
          .map((memory) => summarizeWarning(memory.content)),
      ),
      relevantRules,
    };
  } catch {
    return {
      ids: [],
      hits: [],
      warnings: [],
      relevantRules: [],
    };
  }
}
