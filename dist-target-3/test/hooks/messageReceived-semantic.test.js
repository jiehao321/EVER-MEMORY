import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMessageReceived } from '../../src/hooks/messageReceived.js';
import { embeddingManager } from '../../src/embedding/manager.js';
function createMemory(id, content) {
    return {
        id,
        content,
        type: 'fact',
        lifecycle: 'episodic',
        source: { kind: 'test' },
        scope: { userId: 'u-1', project: 'evermemory' },
        scores: {
            confidence: 1,
            importance: 0.5,
            explicitness: 1,
        },
        timestamps: {
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        },
        state: {
            active: true,
            archived: false,
        },
        evidence: {
            references: [],
        },
        tags: [],
        relatedEntities: [],
        sourceGrade: 'primary',
        stats: {
            accessCount: 0,
            retrievalCount: 0,
        },
    };
}
test('handleMessageReceived merges semantic preload items without mutating recall results', async () => {
    const originalIsReady = embeddingManager.isReady;
    const originalEmbed = embeddingManager.embed;
    const vector = {
        values: new Float32Array([0.2, 0.8]),
        dimensions: 2,
    };
    embeddingManager.isReady = () => true;
    embeddingManager.embed = async () => vector;
    try {
        const recalled = createMemory('m-1', 'phase plan');
        const semanticOnly = createMemory('m-2', 'rollback checklist');
        const initialRecall = {
            items: [recalled],
            total: 1,
            limit: 3,
        };
        const result = await handleMessageReceived({
            sessionId: 's-1',
            messageId: 'msg-1',
            text: '继续推进发布',
            scope: { userId: 'u-1', project: 'evermemory' },
            recallLimit: 3,
        }, {
            analyze: () => ({
                id: 'intent-1',
                intent: { type: 'planning', confidence: 0.9 },
                signals: { memoryNeed: 'deep' },
                query: '继续推进发布',
            }),
        }, {
            getActiveRules: () => [],
        }, {
            recallForIntent: async () => initialRecall,
        }, undefined, {
            searchByCosine: async () => [
                { memoryId: 'm-1', score: 0.95 },
                { memoryId: 'm-2', score: 0.87 },
            ],
        }, {
            findById: (id) => {
                if (id === 'm-1') {
                    return recalled;
                }
                if (id === 'm-2') {
                    return semanticOnly;
                }
                return null;
            },
        });
        assert.equal(initialRecall.items.length, 1);
        assert.deepEqual(initialRecall.items.map((item) => item.id), ['m-1']);
        assert.deepEqual(result.recall.items.map((item) => item.id), ['m-1', 'm-2']);
        assert.equal(result.recall.items[1]?.metadata?.source, 'semantic');
        assert.equal(result.recall.items[1]?.metadata?.semanticScore, 0.87);
        assert.equal(result.recall.total, 2);
    }
    finally {
        embeddingManager.isReady = originalIsReady;
        embeddingManager.embed = originalEmbed;
    }
});
test('handleMessageReceived skips semantic enrichment when preload throws', async () => {
    const recalled = createMemory('m-1', 'phase plan');
    const result = await handleMessageReceived({
        sessionId: 's-1',
        messageId: 'msg-2',
        text: '继续推进发布',
        scope: { userId: 'u-1', project: 'evermemory' },
        recallLimit: 3,
    }, {
        analyze: () => ({
            id: 'intent-1',
            intent: { type: 'planning', confidence: 0.9 },
            signals: { memoryNeed: 'deep' },
            query: '继续推进发布',
        }),
    }, {
        getActiveRules: () => [],
    }, {
        recallForIntent: async () => ({
            items: [recalled],
            total: 1,
            limit: 3,
        }),
    }, undefined, {
        searchByCosine: async () => {
            throw new Error('semantic search failed');
        },
    }, {
        findById: () => {
            throw new Error('findById should not be called when semantic search fails');
        },
    });
    assert.deepEqual(result.recall.items.map((item) => item.id), ['m-1']);
    assert.equal(result.recall.total, 1);
});
test('handleMessageReceived adds a degraded note and skips semantic preload when recall is degraded', async () => {
    const recalled = createMemory('m-1', 'phase plan');
    const result = await handleMessageReceived({
        sessionId: 's-1',
        messageId: 'msg-3',
        text: '继续推进发布',
        scope: { userId: 'u-1', project: 'evermemory' },
        recallLimit: 3,
    }, {
        analyze: () => ({
            id: 'intent-1',
            intent: { type: 'planning', confidence: 0.9 },
            signals: { memoryNeed: 'deep' },
            query: '继续推进发布',
        }),
    }, {
        getActiveRules: () => [],
    }, {
        recallForIntent: async () => ({
            items: [recalled],
            total: 1,
            limit: 3,
            degraded: true,
        }),
    }, undefined, {
        searchByCosine: async () => {
            throw new Error('semantic preload should be skipped when recall is degraded');
        },
    }, {
        findById: () => {
            throw new Error('findById should not be called when recall is degraded');
        },
    });
    assert.equal(result.note, 'Semantic search was unavailable for this recall; results may be incomplete.');
    assert.equal(result.recall.degraded, true);
    assert.deepEqual(result.recall.items.map((item) => item.id), ['m-1']);
});
