import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type Database from 'better-sqlite3';
import type { ButlerPersistentState } from '../../src/core/butler/types.js';
import { AttentionService } from '../../src/core/butler/attention/service.js';
import { ButlerStateManager } from '../../src/core/butler/state.js';
import { butlerReview } from '../../src/tools/butlerReview.js';
import { openDatabase, closeDatabase, type DatabaseHandle } from '../../src/storage/db.js';
import { ButlerFeedbackRepository } from '../../src/storage/butlerFeedbackRepo.js';
import { ButlerInsightRepository } from '../../src/storage/butlerInsightRepo.js';
import { runMigrations } from '../../src/storage/migrations.js';
import { ButlerStateRepository } from '../../src/storage/butlerStateRepo.js';

function createLogger() {
  return {
    info: (..._args: unknown[]) => undefined,
    warn: (..._args: unknown[]) => undefined,
    error: (..._args: unknown[]) => undefined,
    debug: (..._args: unknown[]) => undefined,
  };
}

function futureIso(hours: number): string {
  return new Date(Date.now() + (hours * 60 * 60 * 1000)).toISOString();
}

function pastIso(hours: number): string {
  return new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();
}

function createDbContext(): {
  path: string;
  handle: DatabaseHandle;
  db: Database.Database;
  cleanup: () => void;
} {
  const path = join(os.tmpdir(), `evermemory-butler-feedback-${randomUUID()}.sqlite`);
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

function createInsightRepoContext() {
  const ctx = createDbContext();
  const insightRepo = new ButlerInsightRepository(ctx.db);
  const feedbackRepo = new ButlerFeedbackRepository(ctx.db);
  return { ...ctx, insightRepo, feedbackRepo };
}

function insertInsight(
  repo: ButlerInsightRepository,
  overrides: Partial<{
    kind: 'recommendation' | 'open_loop' | 'commitment';
    title: string;
    summary: string;
    confidence: number;
    importance: number;
    freshUntil: string;
  }> = {},
): string {
  return repo.insert({
    kind: overrides.kind ?? 'recommendation',
    title: overrides.title ?? 'Review this insight',
    summary: overrides.summary ?? 'Butler should track operator feedback.',
    confidence: overrides.confidence ?? 0.85,
    importance: overrides.importance ?? 0.9,
    freshUntil: overrides.freshUntil ?? futureIso(24),
  });
}

function createState(overrides: Partial<ButlerPersistentState> = {}): ButlerPersistentState {
  return {
    currentStrategyFrame: overrides.currentStrategyFrame ?? {
      currentMode: 'reviewing',
      likelyUserGoal: 'complete phase 2a',
      topPriorities: ['feedback', 'attention', 'tooling'],
      constraints: ['strict esm'],
      lastUpdatedAt: '2026-03-23T00:00:00.000Z',
    },
    selfModel: overrides.selfModel ?? {
      overlayAcceptanceRate: 0,
      insightPrecision: 0.5,
      avgCycleLatencyMs: 100,
      totalCycles: 3,
      lastEvaluatedAt: '2026-03-23T00:00:00.000Z',
    },
    workingMemory: overrides.workingMemory ?? [],
    mode: overrides.mode ?? 'steward',
    lastCycleAt: overrides.lastCycleAt ?? '2026-03-23T00:00:00.000Z',
    lastCycleVersion: overrides.lastCycleVersion ?? 3,
  };
}

test('ButlerFeedbackRepository inserts and finds feedback by insight id', () => {
  const ctx = createInsightRepoContext();
  try {
    const insightId = insertInsight(ctx.insightRepo);

    const inserted = ctx.feedbackRepo.insert({
      insightId,
      action: 'accepted',
      reason: 'Useful suggestion',
    });
    const feedback = ctx.feedbackRepo.findByInsightId(insightId);

    assert.equal(inserted.insightId, insightId);
    assert.equal(feedback.length, 1);
    assert.equal(feedback[0]?.action, 'accepted');
    assert.equal(feedback[0]?.reason, 'Useful suggestion');
  } finally {
    ctx.cleanup();
  }
});

test('ButlerFeedbackRepository reports snoozed insight while window is active', () => {
  const ctx = createInsightRepoContext();
  try {
    const insightId = insertInsight(ctx.insightRepo);
    ctx.feedbackRepo.insert({
      insightId,
      action: 'snoozed',
      snoozeUntil: futureIso(4),
    });

    assert.equal(ctx.feedbackRepo.isSnoozed(insightId), true);
    assert.equal(ctx.feedbackRepo.isBlocked(insightId), true);
  } finally {
    ctx.cleanup();
  }
});

test('ButlerFeedbackRepository does not treat expired snooze as active', () => {
  const ctx = createInsightRepoContext();
  try {
    const insightId = insertInsight(ctx.insightRepo);
    ctx.feedbackRepo.insert({
      insightId,
      action: 'snoozed',
      snoozeUntil: pastIso(4),
    });

    assert.equal(ctx.feedbackRepo.isSnoozed(insightId), false);
    assert.equal(ctx.feedbackRepo.isBlocked(insightId), false);
  } finally {
    ctx.cleanup();
  }
});

test('ButlerFeedbackRepository reports dismissed insight', () => {
  const ctx = createInsightRepoContext();
  try {
    const insightId = insertInsight(ctx.insightRepo);
    ctx.feedbackRepo.insert({
      insightId,
      action: 'dismissed',
      reason: 'Not relevant',
    });

    assert.equal(ctx.feedbackRepo.isDismissed(insightId), true);
    assert.equal(ctx.feedbackRepo.isBlocked(insightId), true);
  } finally {
    ctx.cleanup();
  }
});

test('ButlerFeedbackRepository aggregates acceptance stats', () => {
  const ctx = createInsightRepoContext();
  try {
    const acceptedA = insertInsight(ctx.insightRepo, { title: 'Accepted A' });
    const acceptedB = insertInsight(ctx.insightRepo, { title: 'Accepted B' });
    const rejected = insertInsight(ctx.insightRepo, { title: 'Rejected' });
    const snoozed = insertInsight(ctx.insightRepo, { title: 'Snoozed' });
    ctx.feedbackRepo.insert({ insightId: acceptedA, action: 'accepted' });
    ctx.feedbackRepo.insert({ insightId: acceptedB, action: 'accepted' });
    ctx.feedbackRepo.insert({ insightId: rejected, action: 'rejected' });
    ctx.feedbackRepo.insert({ insightId: snoozed, action: 'snoozed', snoozeUntil: futureIso(2) });

    const stats = ctx.feedbackRepo.getAcceptanceStats();

    assert.deepEqual(stats, { accepted: 2, rejected: 1, total: 3 });
  } finally {
    ctx.cleanup();
  }
});

test('AttentionService shouldSurface returns false for snoozed insight', () => {
  const ctx = createInsightRepoContext();
  try {
    const insightId = insertInsight(ctx.insightRepo, { title: 'Snooze me' });
    const insight = ctx.insightRepo.findById(insightId);
    assert.ok(insight);
    ctx.feedbackRepo.insert({
      insightId,
      action: 'snoozed',
      snoozeUntil: futureIso(6),
    });
    const service = new AttentionService({
      insightRepo: ctx.insightRepo,
      feedbackRepo: ctx.feedbackRepo,
      config: { maxInsightsPerBriefing: 5, minConfidence: 0.4, tokenBudgetPercent: 0.2 },
      logger: createLogger(),
    });

    assert.equal(service.shouldSurface(insight), false);
  } finally {
    ctx.cleanup();
  }
});

test('AttentionService shouldSurface returns false for dismissed insight', () => {
  const ctx = createInsightRepoContext();
  try {
    const insightId = insertInsight(ctx.insightRepo, { title: 'Dismiss me' });
    const insight = ctx.insightRepo.findById(insightId);
    assert.ok(insight);
    ctx.feedbackRepo.insert({
      insightId,
      action: 'dismissed',
      reason: 'Not actionable',
    });
    const service = new AttentionService({
      insightRepo: ctx.insightRepo,
      feedbackRepo: ctx.feedbackRepo,
      config: { maxInsightsPerBriefing: 5, minConfidence: 0.4, tokenBudgetPercent: 0.2 },
      logger: createLogger(),
    });

    assert.equal(service.shouldSurface(insight), false);
  } finally {
    ctx.cleanup();
  }
});

test('butlerReview list returns active and blocked insights with status', async () => {
  const ctx = createInsightRepoContext();
  try {
    const stateManager = new ButlerStateManager({
      stateRepo: new ButlerStateRepository(ctx.db),
      logger: createLogger(),
    });
    stateManager.save(createState());
    const activeId = insertInsight(ctx.insightRepo, { title: 'Active insight', importance: 0.8 });
    const snoozedId = insertInsight(ctx.insightRepo, { title: 'Snoozed insight', importance: 0.95 });
    const dismissedId = insertInsight(ctx.insightRepo, { title: 'Dismissed insight', importance: 0.7 });
    ctx.feedbackRepo.insert({ insightId: snoozedId, action: 'snoozed', snoozeUntil: futureIso(12) });
    ctx.feedbackRepo.insert({ insightId: dismissedId, action: 'dismissed' });
    const attentionService = new AttentionService({
      insightRepo: ctx.insightRepo,
      feedbackRepo: ctx.feedbackRepo,
      config: { maxInsightsPerBriefing: 10, minConfidence: 0.4, tokenBudgetPercent: 0.2 },
      logger: createLogger(),
    });

    const result = await butlerReview({
      attentionService,
      feedbackRepo: ctx.feedbackRepo,
      insightRepo: ctx.insightRepo,
      stateManager,
      action: 'list',
    });

    assert.equal(result.action, 'list');
    assert.equal(result.listed?.length, 3);
    assert.deepEqual(
      result.listed?.map((item: { title: string; status: string }) => ({ title: item.title, status: item.status })),
      [
        { title: 'Snoozed insight', status: 'snoozed' },
        { title: 'Active insight', status: 'active' },
        { title: 'Dismissed insight', status: 'dismissed' },
      ],
    );
    assert.equal(activeId.length > 0, true);
  } finally {
    ctx.cleanup();
  }
});

test('butlerReview accept records feedback and updates acceptance rate', async () => {
  const ctx = createInsightRepoContext();
  try {
    const stateManager = new ButlerStateManager({
      stateRepo: new ButlerStateRepository(ctx.db),
      logger: createLogger(),
    });
    stateManager.save(createState());
    const acceptedId = insertInsight(ctx.insightRepo, { title: 'Accept this' });
    const rejectedId = insertInsight(ctx.insightRepo, { title: 'Reject this' });
    ctx.feedbackRepo.insert({ insightId: rejectedId, action: 'rejected' });
    const attentionService = new AttentionService({
      insightRepo: ctx.insightRepo,
      feedbackRepo: ctx.feedbackRepo,
      config: { maxInsightsPerBriefing: 10, minConfidence: 0.4, tokenBudgetPercent: 0.2 },
      logger: createLogger(),
    });

    const result = await butlerReview({
      attentionService,
      feedbackRepo: ctx.feedbackRepo,
      insightRepo: ctx.insightRepo,
      stateManager,
      action: 'accept',
      insightId: acceptedId,
      reason: 'Looks right',
    });

    assert.equal(result.insight?.status, 'active');
    assert.equal(result.acceptanceRate, 0.5);
    assert.equal(ctx.feedbackRepo.getLatestAction(acceptedId), 'accepted');
    assert.equal(stateManager.load().selfModel.overlayAcceptanceRate, 0.5);
  } finally {
    ctx.cleanup();
  }
});

test('butlerReview snooze records feedback with snooze window', async () => {
  const ctx = createInsightRepoContext();
  try {
    const stateManager = new ButlerStateManager({
      stateRepo: new ButlerStateRepository(ctx.db),
      logger: createLogger(),
    });
    stateManager.save(createState());
    const insightId = insertInsight(ctx.insightRepo, { title: 'Snooze this' });
    const attentionService = new AttentionService({
      insightRepo: ctx.insightRepo,
      feedbackRepo: ctx.feedbackRepo,
      config: { maxInsightsPerBriefing: 10, minConfidence: 0.4, tokenBudgetPercent: 0.2 },
      logger: createLogger(),
    });

    const before = Date.now();
    const result = await butlerReview({
      attentionService,
      feedbackRepo: ctx.feedbackRepo,
      insightRepo: ctx.insightRepo,
      stateManager,
      action: 'snooze',
      insightId,
      snoozeHours: 24,
      reason: 'Check tomorrow',
    });
    const records = ctx.feedbackRepo.findByInsightId(insightId);
    const snoozeUntil = records[0]?.snoozeUntil;

    assert.equal(result.insight?.status, 'snoozed');
    assert.equal(records.length, 1);
    assert.equal(records[0]?.action, 'snoozed');
    assert.equal(records[0]?.reason, 'Check tomorrow');
    assert.ok(snoozeUntil);
    assert.equal(Date.parse(snoozeUntil) > before + (23 * 60 * 60 * 1000), true);
  } finally {
    ctx.cleanup();
  }
});
