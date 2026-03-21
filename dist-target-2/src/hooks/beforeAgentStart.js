import { embeddingManager } from '../embedding/manager.js';
function hasAnyIdentifier(scope) {
    return Boolean(scope?.userId) || Boolean(scope?.chatId) || Boolean(scope?.project) || scope?.global === true;
}
function matchesScope(scope, memoryScope) {
    if (!scope) {
        // A0: undefined scope matches no user-specific memories, only global ones
        return memoryScope?.global === true;
    }
    // A0: empty scope object (no identifying fields) must not match everything
    if (!hasAnyIdentifier(scope)) {
        return memoryScope?.global === true;
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
function normalize(text) {
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
function unique(items) {
    return Array.from(new Set(items));
}
function isWarningMemory(memory) {
    return memory.tags.includes('warning')
        || memory.tags.includes('lesson')
        || /^\s*\[(警告|踩坑)\]/u.test(memory.content);
}
function summarizeWarning(content, max = 120) {
    const normalized = content.trim().replace(/\s+/g, ' ');
    if (normalized.length <= max) {
        return normalized;
    }
    return `${normalized.slice(0, max - 1)}…`;
}
function keywordOverlap(left, right) {
    const leftTokens = new Set(normalize(left));
    const rightTokens = normalize(right);
    return rightTokens.some((token) => leftTokens.has(token));
}
export async function semanticPreload(queryText, scope, semanticRepo, memoryRepo, limit = 5, minScore = 0.35, activeRules = [], debugRepo) {
    if (!embeddingManager.isReady()) {
        // A1: Log semantic degradation so operators can detect embedding issues
        debugRepo?.log('semantic_preload_failed', undefined, {
            reason: 'embedding_not_ready',
            provider: embeddingManager.providerKind,
        });
        return {
            ids: [],
            hits: [],
            warnings: [],
            relevantRules: [],
        };
    }
    const queryVector = await embeddingManager.embed(queryText);
    if (!queryVector || queryVector.values.length === 0) {
        debugRepo?.log('semantic_preload_failed', undefined, {
            reason: 'embed_returned_null',
            provider: embeddingManager.providerKind,
        });
        return {
            ids: [],
            hits: [],
            warnings: [],
            relevantRules: [],
        };
    }
    try {
        const candidates = await semanticRepo.searchByCosine(queryVector.values, limit * 3, minScore);
        const hits = [];
        const hitMemories = new Map();
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
        const relevantRules = unique(activeRules
            .filter((rule) => rule.state.active && !rule.state.deprecated && !rule.state.frozen)
            .filter((rule) => keywordOverlap(queryText, rule.statement))
            .map((rule) => rule.statement));
        return {
            ids: orderedHits.map((hit) => hit.memoryId),
            hits: orderedHits,
            warnings: unique(warningHits
                .map((hit) => hitMemories.get(hit.memoryId))
                .filter((memory) => Boolean(memory))
                .map((memory) => summarizeWarning(memory.content))),
            relevantRules,
        };
    }
    catch (error) {
        // A1: Log catch-path degradation for observability
        debugRepo?.log('semantic_preload_failed', undefined, {
            reason: 'search_error',
            error: error instanceof Error ? error.message : String(error),
        });
        return {
            ids: [],
            hits: [],
            warnings: [],
            relevantRules: [],
        };
    }
}
