import { randomUUID } from 'node:crypto';
import { MemoryLifecycleService } from './lifecycle.js';
import { evaluateWrite } from '../policy/write.js';
import { embeddingManager } from '../../embedding/manager.js';
function nowIso() {
    return new Date().toISOString();
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function withMemoryTag(memory, tag) {
    if (memory.tags.includes(tag)) {
        return memory;
    }
    return {
        ...memory,
        tags: [...memory.tags, tag],
    };
}
function normalizeMemory(input, decision, fallbackScope) {
    const createdAt = input.createdAt ?? nowIso();
    const updatedAt = input.updatedAt ?? createdAt;
    return {
        id: input.id ?? randomUUID(),
        content: decision.cleanedContent ?? input.content.trim(),
        type: decision.type,
        lifecycle: decision.lifecycle,
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
        sourceGrade: input.sourceGrade ?? 'primary',
        stats: {
            accessCount: 0,
            retrievalCount: 0,
        },
    };
}
export class MemoryService {
    memoryRepo;
    debugRepo;
    semanticEnabled;
    semanticRepo;
    lifecycleService;
    profileProjectionService;
    constructor(memoryRepo, debugRepo, options = {}) {
        this.memoryRepo = memoryRepo;
        this.debugRepo = debugRepo;
        this.semanticEnabled = options.semanticEnabled ?? false;
        this.semanticRepo = options.semanticRepo;
        this.lifecycleService = options.lifecycleService ?? new MemoryLifecycleService(this.memoryRepo, this.debugRepo);
        this.profileProjectionService = options.profileProjectionService;
    }
    store(input, fallbackScope, options = {}) {
        // A8: Reject empty content before policy evaluation
        if (!input.content.trim()) {
            this.debugRepo?.log('memory_write_rejected', input.id ?? 'unknown', {
                accepted: false,
                reason: 'empty_content',
            });
            return {
                accepted: false,
                reason: 'empty_content',
                memory: null,
            };
        }
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
        // A0: Validate scope has at least one identifier to prevent data cross-leakage
        // Only enforce for user/tool-initiated stores; system-generated stores (auto-capture, etc.) are exempt.
        const isSystemStore = input.source?.actor === 'system';
        const resolvedScope = input.scope ?? fallbackScope ?? {};
        if (!isSystemStore && !resolvedScope.userId && !resolvedScope.chatId && !resolvedScope.project && !resolvedScope.global) {
            this.debugRepo?.log('memory_write_rejected', input.id ?? 'unknown', {
                accepted: false,
                reason: 'empty_scope',
            });
            return {
                accepted: false,
                reason: 'Memory scope must include at least one identifier (userId, chatId, project, or global=true). An empty scope risks data leakage across users and sessions.',
                memory: null,
            };
        }
        let memory = normalizeMemory(input, decision, fallbackScope);
        this.memoryRepo.insert(memory);
        if (this.semanticEnabled && this.semanticRepo) {
            try {
                this.semanticRepo.upsertFromMemory(memory);
                this.debugRepo?.log('semantic_indexed', memory.id, {
                    memoryId: memory.id,
                    updatedAt: memory.timestamps.updatedAt,
                    success: true,
                });
            }
            catch (error) {
                memory = withMemoryTag(memory, 'embedding_pending');
                this.memoryRepo.update(memory);
                this.debugRepo?.log('semantic_indexed', memory.id, {
                    memoryId: memory.id,
                    updatedAt: memory.timestamps.updatedAt,
                    success: false,
                    error: getErrorMessage(error),
                });
            }
        }
        this.triggerEmbeddingGeneration(memory);
        const maintenance = this.lifecycleService.maintainForNewMemory(memory.id);
        const projectedProfile = !options.skipProfileRecompute && memory.scope.userId && this.profileProjectionService
            ? this.profileProjectionService.recomputeForUser(memory.scope.userId)
            : null;
        if (decision.strippedPatterns?.length) {
            this.debugRepo?.log('content_sanitized', memory.id, {
                strippedPatterns: decision.strippedPatterns,
                originalLength: input.content.length,
                cleanedLength: memory.content.length,
            });
        }
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
            inferredType: memory.type,
            inferredLifecycle: memory.lifecycle,
        };
    }
    getById(id) {
        const memory = this.memoryRepo.findById(id);
        if (memory) {
            this.memoryRepo.incrementAccess(id);
        }
        return memory;
    }
    listRecent(scope, limit = 10) {
        return this.memoryRepo.listRecent(scope, limit);
    }
    consolidate(input = {}) {
        return this.lifecycleService.consolidate(input);
    }
    triggerEmbeddingGeneration(memory) {
        if (!this.semanticRepo) {
            return;
        }
        void this.generateEmbeddingAsync(this.semanticRepo, memory.id, memory.content);
    }
    async generateEmbeddingAsync(repo, memoryId, content) {
        if (!embeddingManager.isReady()) {
            return;
        }
        try {
            const vector = await embeddingManager.embed(content);
            if (!vector) {
                return;
            }
            await repo.storeEmbedding(memoryId, vector.values, embeddingManager.providerKind);
        }
        catch (error) {
            this.debugRepo?.log('semantic_indexed', memoryId, {
                memoryId,
                success: false,
                error: getErrorMessage(error),
            });
        }
    }
}
