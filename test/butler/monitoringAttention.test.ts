import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type Database from 'better-sqlite3';
import type { CognitiveResult, CognitiveTask } from '../../src/core/butler/types.js';
import type { CognitiveEngine } from '../../src/core/butler/cognition.js';
import { AttentionService } from '../../src/core/butler/attention/service.js';
import { CommitmentWatcher } from '../../src/core/butler/commitments/watcher.js';
import { ButlerFeedbackRepository } from '../../src/storage/butlerFeedbackRepo.js';
import { openDatabase, closeDatabase, type DatabaseHandle } from '../../src/storage/db.js';
import { runMigrations } from '../../src/storage/migrations.js';
import { ButlerInsightRepository } from '../../src/storage/butlerInsightRepo.js';
import { MemoryRepository } from '../../src/storage/memoryRepo.js';
import { buildMemory } from '../storage/helpers.js';

function createLogger() {
  return {
    info: (..._args: unknown[]) => undefined,
    warn: (..._args: unknown[]) => undefined,
    error: (..._args: unknown[]) => undefined,
    debug: (..._args: unknown[]) => undefined,
  };
}

function futureIso(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function pastIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function createDbContext(): {
  path: string;
  handle: DatabaseHandle;
  db: Database.Database;
  cleanup: () => void;
} {
  const path = join(os.tmpdir(), `evermemory-monitoring-${randomUUID()}.sqlite`);
  const handle = openDatabase(path);
  runMigrations(handle.connection, path);
  return {
    path,
    handle,
    db: handle.connection,
    cleanup: () => {
      closeDatabase(handle);
      rmSync(path, { force: true });
    },
  };
}

function createCognitiveStub(options: {
  canAfford?: boolean;
  output?: Record<string, unknown>;
  fallbackUsed?: boolean;
  onRunTask?: (task: CognitiveTask<Record<string, unknown>>) => void;
} = {}): CognitiveEngine {
  return {
    canAfford: () => options.canAfford ?? false,
    runTask: async (task: CognitiveTask<Record<string, unknown>>): Promise<CognitiveResult<Record<string, unknown>>> => {
      options.onRunTask?.(task);
      return {
        output: options.output ?? {},
        confidence: 0.8,
        evidenceIds: [],
        fallbackUsed: options.fallbackUsed ?? false,
      };
    },
  } as unknown as CognitiveEngine;
}

function insertInsight(
  db: Database.Database,
  repo: ButlerInsightRepository,
  overrides: Partial<{
    kind: 'continuity' | 'theme' | 'commitment' | 'anomaly' | 'open_loop' | 'recommendation';
    title: string;
    summary: string;
    confidence: number;
    importance: number;
    freshUntil: string;
    lastSurfacedAt: string;
    sourceRefs: string[];
  }> = {},
) {
  const id = repo.insert({
    kind: overrides.kind ?? 'recommendation',
    scope: { project: 'evermemory' },
    title: overrides.title ?? `insight-${randomUUID()}`,
    summary: overrides.summary ?? 'summary',
    confidence: overrides.confidence ?? 0.7,
    importance: overrides.importance ?? 0.7,
    freshUntil: overrides.freshUntil ?? futureIso(24),
    sourceRefs: overrides.sourceRefs,
  });
  if (overrides.lastSurfacedAt) {
    repo.markSurfaced(id);
    db.prepare('UPDATE butler_insights SET last_surfaced_at = ? WHERE id = ?').run(overrides.lastSurfacedAt, id);
  }
  return repo.findById(id);
}

test('CommitmentWatcher scanCommitments finds commitment memories in heuristic mode', async () => {
  const ctx = createDbContext();
  try {
    const memoryRepo = new MemoryRepository(ctx.db);
    const insightRepo = new ButlerInsightRepository(ctx.db);
    memoryRepo.insert(buildMemory({
      id: 'memory-typed',
      type: 'commitment',
      content: 'Ship monitoring and attention by Friday.',
      scope: { project: 'evermemory' },
    }));
    memoryRepo.insert(buildMemory({
      id: 'memory-keyword',
      type: 'fact',
      content: 'I will do the release notes after the build passes.',
      scope: { project: 'evermemory' },
    }));

    const watcher = new CommitmentWatcher({
      memoryRepo,
      insightRepo,
      cognitiveEngine: createCognitiveStub({ canAfford: false }),
      logger: createLogger(),
    });

    const insights = await watcher.scanCommitments({ project: 'evermemory' });

    assert.equal(insights.length, 2);
    assert.equal(insights.every((item) => item.kind === 'commitment'), true);
    assert.equal(insights.some((item) => item.summary.includes('release notes')), true);
    assert.equal(insights.every((item) => item.title.length <= 80), true);
  } finally {
    ctx.cleanup();
  }
});

test('CommitmentWatcher getActiveCommitments returns commitment insights', async () => {
  const ctx = createDbContext();
  try {
    const memoryRepo = new MemoryRepository(ctx.db);
    const insightRepo = new ButlerInsightRepository(ctx.db);
    memoryRepo.insert(buildMemory({
      id: 'memory-1',
      type: 'commitment',
      content: 'We will publish the monitoring brief tomorrow.',
      scope: { project: 'evermemory' },
    }));

    const watcher = new CommitmentWatcher({
      memoryRepo,
      insightRepo,
      logger: createLogger(),
    });

    await watcher.scanCommitments({ project: 'evermemory' });
    const active = watcher.getActiveCommitments();

    assert.equal(active.length, 1);
    assert.equal(active[0]?.kind, 'commitment');
  } finally {
    ctx.cleanup();
  }
});

test('CommitmentWatcher avoids duplicate insights for the same memory', async () => {
  const ctx = createDbContext();
  try {
    const memoryRepo = new MemoryRepository(ctx.db);
    const insightRepo = new ButlerInsightRepository(ctx.db);
    memoryRepo.insert(buildMemory({
      id: 'memory-dup',
      type: 'commitment',
      content: 'Promise: close the loop on stale insights.',
      scope: { project: 'evermemory' },
    }));

    const watcher = new CommitmentWatcher({
      memoryRepo,
      insightRepo,
      logger: createLogger(),
    });

    const first = await watcher.scanCommitments({ project: 'evermemory' });
    const second = await watcher.scanCommitments({ project: 'evermemory' });

    assert.equal(first.length, 1);
    assert.equal(second.length, 0);
    assert.equal(insightRepo.findByKind('commitment', 10).length, 1);
  } finally {
    ctx.cleanup();
  }
});

test('AttentionService getTopInsights returns scored and sorted results', () => {
  const ctx = createDbContext();
  try {
    const repo = new ButlerInsightRepository(ctx.db);
    insertInsight(ctx.db, repo, {
      title: 'High priority fresh',
      confidence: 0.85,
      importance: 0.95,
      freshUntil: futureIso(120),
    });
    insertInsight(ctx.db, repo, {
      title: 'Medium',
      confidence: 0.75,
      importance: 0.7,
      freshUntil: futureIso(24),
    });
    insertInsight(ctx.db, repo, {
      title: 'Low but fresh',
      confidence: 0.7,
      importance: 0.4,
      freshUntil: futureIso(12),
    });

    const service = new AttentionService({
      insightRepo: repo,
      feedbackRepo: new ButlerFeedbackRepository(ctx.db),
      config: { maxInsightsPerBriefing: 2, minConfidence: 0.5, tokenBudgetPercent: 0.2 },
      logger: createLogger(),
    });

    const top = service.getTopInsights();

    assert.deepEqual(top.map((item) => item.title), ['High priority fresh', 'Medium']);
  } finally {
    ctx.cleanup();
  }
});

test('AttentionService filters by minConfidence', () => {
  const ctx = createDbContext();
  try {
    const repo = new ButlerInsightRepository(ctx.db);
    insertInsight(ctx.db, repo, {
      title: 'Too uncertain',
      confidence: 0.39,
      importance: 0.99,
    });
    insertInsight(ctx.db, repo, {
      title: 'Confident enough',
      confidence: 0.7,
      importance: 0.5,
    });

    const service = new AttentionService({
      insightRepo: repo,
      feedbackRepo: new ButlerFeedbackRepository(ctx.db),
      config: { maxInsightsPerBriefing: 5, minConfidence: 0.4, tokenBudgetPercent: 0.2 },
      logger: createLogger(),
    });

    const top = service.getTopInsights(5);

    assert.deepEqual(top.map((item) => item.title), ['Confident enough']);
  } finally {
    ctx.cleanup();
  }
});

test('AttentionService shouldSurface respects time cooldown', () => {
  const ctx = createDbContext();
  try {
    const repo = new ButlerInsightRepository(ctx.db);
    const recent = insertInsight(ctx.db, repo, {
      title: 'Recent',
      lastSurfacedAt: pastIso(0.1),
    });
    const older = insertInsight(ctx.db, repo, {
      title: 'Older',
      lastSurfacedAt: pastIso(2),
    });

    const service = new AttentionService({
      insightRepo: repo,
      feedbackRepo: new ButlerFeedbackRepository(ctx.db),
      config: { maxInsightsPerBriefing: 5, minConfidence: 0.4, tokenBudgetPercent: 0.2 },
      logger: createLogger(),
    });

    assert.equal(service.shouldSurface(recent!), false);
    assert.equal(service.shouldSurface(older!), true);
  } finally {
    ctx.cleanup();
  }
});

test('AttentionService rankInsights is a pure sort', () => {
  const now = new Date().toISOString();
  const insights = [
    {
      id: 'b',
      kind: 'recommendation' as const,
      title: 'Second',
      summary: 'Second summary',
      confidence: 0.6,
      importance: 0.5,
      freshUntil: futureIso(12),
      surfacedCount: 0,
      createdAt: now,
    },
    {
      id: 'a',
      kind: 'recommendation' as const,
      title: 'First',
      summary: 'First summary',
      confidence: 0.9,
      importance: 0.95,
      freshUntil: futureIso(120),
      surfacedCount: 0,
      createdAt: now,
    },
  ];
  const service = new AttentionService({
    insightRepo: {} as ButlerInsightRepository,
    feedbackRepo: {} as ButlerFeedbackRepository,
    config: { maxInsightsPerBriefing: 5, minConfidence: 0.4, tokenBudgetPercent: 0.2 },
    logger: createLogger(),
  });

  const ranked = service.rankInsights(insights);

  assert.deepEqual(insights.map((item) => item.id), ['b', 'a']);
  assert.deepEqual(ranked.map((item) => item.id), ['a', 'b']);
  assert.notEqual(ranked, insights);
});

test('AttentionService pruneStale deletes expired insights', () => {
  const ctx = createDbContext();
  try {
    const repo = new ButlerInsightRepository(ctx.db);
    insertInsight(ctx.db, repo, {
      title: 'Expired',
      freshUntil: pastIso(2),
    });
    insertInsight(ctx.db, repo, {
      title: 'Fresh',
      freshUntil: futureIso(2),
    });

    const service = new AttentionService({
      insightRepo: repo,
      feedbackRepo: new ButlerFeedbackRepository(ctx.db),
      config: { maxInsightsPerBriefing: 5, minConfidence: 0.4, tokenBudgetPercent: 0.2 },
      logger: createLogger(),
    });

    const deleted = service.pruneStale();

    assert.equal(deleted, 1);
    assert.deepEqual(repo.findFresh(10).map((item) => item.title), ['Fresh']);
  } finally {
    ctx.cleanup();
  }
});
