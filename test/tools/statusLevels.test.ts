import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../../src/index.js';
import { embeddingManager } from '../../src/embedding/manager.js';
import { evermemoryStatus, evermemoryStatusLayered } from '../../src/tools/status.js';
import { createTempDbPath } from '../helpers.js';

function createTestApp(name: string) {
  const databasePath = createTempDbPath(name);
  const app = initializeEverMemory({ databasePath, semantic: { enabled: false } });

  return {
    app,
    cleanup() {
      app.database.connection.close();
      rmSync(databasePath, { force: true });
    },
  };
}

function buildStatusInput(app: ReturnType<typeof initializeEverMemory>, userId = 'status-levels-user') {
  return {
    database: app.database,
    memoryRepo: app.memoryRepo,
    briefingRepo: app.briefingRepo,
    debugRepo: app.debugRepo,
    experienceRepo: app.experienceRepo,
    reflectionRepo: app.reflectionRepo,
    behaviorRepo: app.behaviorRepo,
    semanticRepo: app.semanticRepo,
    profileRepo: app.profileRepo,
    userId,
  };
}

function withEmbeddingReady<T>(ready: boolean, fn: () => T): T {
  const originalIsReady = embeddingManager.isReady.bind(embeddingManager);
  embeddingManager.isReady = (() => ready) as typeof embeddingManager.isReady;
  try {
    return fn();
  } finally {
    embeddingManager.isReady = originalIsReady;
  }
}

test('summary mode returns EverMemoryStatusSummary fields and detail/debug return full status payloads', () => {
  const { app, cleanup } = createTestApp('status-levels-shapes');

  try {
    app.evermemoryStore({
      content: 'Reply in concise English.',
      scope: { userId: 'status-levels-user' },
      type: 'preference',
    });

    const input = buildStatusInput(app);
    const baseStatus = withEmbeddingReady(true, () => evermemoryStatus(input));
    const summary = withEmbeddingReady(true, () => evermemoryStatusLayered(input));
    const detail = withEmbeddingReady(true, () => evermemoryStatusLayered({ ...input, output: 'detail' }));
    const debug = withEmbeddingReady(true, () => evermemoryStatusLayered({ ...input, output: 'debug' }));

    assert.equal(typeof summary.health, 'string');
    assert.equal(typeof summary.memoryCount, 'number');
    assert.ok(Array.isArray(summary.alerts));
    assert.equal(summary.memoryCount, 1);
    assert.deepEqual(detail.summary, baseStatus.summary);
    assert.equal(detail.memoryCount, baseStatus.memoryCount);
    assert.equal(debug.memoryCount, baseStatus.memoryCount);
    assert.ok(Array.isArray(debug.latestDebugEvents));
  } finally {
    cleanup();
  }
});

test('summary health is critical when memoryCount is zero', () => {
  const { app, cleanup } = createTestApp('status-levels-critical-empty');

  try {
    const input = buildStatusInput(app);
    const summary = withEmbeddingReady(true, () => evermemoryStatusLayered(input));

    assert.equal(summary.health, 'critical');
    assert.equal(summary.memoryCount, 0);
    assert.ok(summary.alerts.some((alert) => alert.code === 'memory_empty'));
  } finally {
    cleanup();
  }
});

test('summary health is warning when at-risk memories exist', () => {
  const { app, cleanup } = createTestApp('status-levels-warning-risk');

  try {
    app.evermemoryStore({
      content: 'Remember the deployment checklist.',
      scope: { userId: 'status-levels-user' },
      type: 'fact',
    });

    const input = buildStatusInput(app);
    const memoryRepo = Object.create(app.memoryRepo) as typeof app.memoryRepo;
    memoryRepo.search = ((query) => {
      const results = app.memoryRepo.search(query);
      return results.map((memory) => ({
        ...memory,
        timestamps: {
          ...memory.timestamps,
          updatedAt: '2020-01-01T00:00:00.000Z',
          lastAccessedAt: '2020-01-01T00:00:00.000Z',
        },
        stats: {
          ...memory.stats,
          accessCount: 0,
        },
      }));
    }) as typeof app.memoryRepo.search;

    const summary = withEmbeddingReady(true, () => evermemoryStatusLayered({
      ...input,
      memoryRepo,
    }));

    assert.equal(summary.health, 'warning');
    assert.equal(summary.memoryCount, 1);
    assert.equal(summary.atRiskCount, 1);
    assert.ok(summary.alerts.some((alert) => alert.code === 'at_risk_memories'));
  } finally {
    cleanup();
  }
});

test('summary health is healthy in the normal case', () => {
  const { app, cleanup } = createTestApp('status-levels-healthy');

  try {
    app.evermemoryStore({
      content: 'User prefers concise release notes.',
      scope: { userId: 'status-levels-user' },
      type: 'preference',
    });

    const input = buildStatusInput(app);
    const summary = withEmbeddingReady(true, () => evermemoryStatusLayered(input));

    assert.equal(summary.health, 'healthy');
    assert.equal(summary.memoryCount, 1);
    assert.equal(summary.atRiskCount, 0);
    assert.deepEqual(summary.alerts, []);
  } finally {
    cleanup();
  }
});

test('summary alerts are capped at three entries', () => {
  const { app, cleanup } = createTestApp('status-levels-alert-cap');

  try {
    const input = buildStatusInput(app);
    const memoryRepo = Object.create(app.memoryRepo) as typeof app.memoryRepo;
    memoryRepo.count = ((query) => {
      if (query?.activeOnly || query?.archived) {
        return 0;
      }
      return 0;
    }) as typeof app.memoryRepo.count;
    memoryRepo.search = (() => [{
      id: 'at-risk-memory',
      content: 'Old memory',
      type: 'fact',
      lifecycle: 'semantic',
      source: { kind: 'test' },
      scope: { userId: 'status-levels-user', global: false },
      scores: { confidence: 0.8, importance: 0.7, explicitness: 0.6 },
      timestamps: {
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
        lastAccessedAt: '2020-01-01T00:00:00.000Z',
      },
      state: { active: true, archived: false },
      evidence: { references: [] },
      tags: [],
      relatedEntities: [],
      sourceGrade: 'primary',
      stats: { accessCount: 0, retrievalCount: 0 },
    }]) as typeof app.memoryRepo.search;

    const debugRepo = Object.create(app.debugRepo) as typeof app.debugRepo;
    debugRepo.listRecent = ((...args: Parameters<typeof app.debugRepo.listRecent>) => {
      const [kind, limit] = args;
      if (kind === 'semantic_preload_failed') {
        return [
          {
            id: 'semantic-failed-1',
            createdAt: '2026-03-21T00:00:00.000Z',
            kind: 'semantic_preload_failed',
            entityId: 'semantic-failed-1',
            payload: {},
          },
        ];
      }
      return app.debugRepo.listRecent(kind, limit);
    }) as typeof app.debugRepo.listRecent;

    const summary = withEmbeddingReady(false, () => evermemoryStatusLayered({
      ...input,
      memoryRepo,
      debugRepo,
    }));

    assert.equal(summary.alerts.length, 3);
    assert.deepEqual(
      summary.alerts.map((alert) => alert.code),
      ['memory_empty', 'semantic_degraded', 'at_risk_memories'],
    );
  } finally {
    cleanup();
  }
});
