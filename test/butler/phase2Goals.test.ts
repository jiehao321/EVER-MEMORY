import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type Database from 'better-sqlite3';
import { ButlerGoalService } from '../../src/core/butler/goals/service.js';
import { openDatabase, closeDatabase, type DatabaseHandle } from '../../src/storage/db.js';
import type { ButlerGoal } from '../../src/storage/butlerGoalRepo.js';
import { ButlerGoalRepository } from '../../src/storage/butlerGoalRepo.js';
import { ButlerInsightRepository } from '../../src/storage/butlerInsightRepo.js';
import { runMigrations } from '../../src/storage/migrations.js';

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

function createDbContext(): {
  path: string;
  handle: DatabaseHandle;
  db: Database.Database;
  cleanup: () => void;
} {
  const path = join(os.tmpdir(), `evermemory-butler-goals-${randomUUID()}.sqlite`);
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

function createGoalContext() {
  const ctx = createDbContext();
  const insightRepo = new ButlerInsightRepository(ctx.db);
  const goalRepo = new ButlerGoalRepository(ctx.db);
  const goalService = new ButlerGoalService({
    goalRepo,
    insightRepo,
    logger: createLogger(),
  });
  return { ...ctx, insightRepo, goalRepo, goalService };
}

function insertInsight(
  repo: ButlerInsightRepository,
  overrides: Partial<{
    kind: 'commitment' | 'recommendation' | 'open_loop';
    title: string;
    summary: string;
    importance: number;
    freshUntil: string;
    sourceRefs: string[];
  }> = {},
): string {
  return repo.insert({
    kind: overrides.kind ?? 'commitment',
    title: overrides.title ?? 'Ship Butler goals',
    summary: overrides.summary ?? 'Create durable goals from Butler insights.',
    confidence: 0.85,
    importance: overrides.importance ?? 0.8,
    freshUntil: overrides.freshUntil,
    sourceRefs: overrides.sourceRefs,
  });
}

function findGoalBySource(goals: ButlerGoal[], insightId: string): ButlerGoal | undefined {
  return goals.find((goal) => goal.sourceInsightIds.includes(insightId));
}

test('ButlerGoalRepository inserts goals and returns active goals sorted by priority', () => {
  const ctx = createGoalContext();
  try {
    const lowerPriority = ctx.goalRepo.insert({
      title: 'Document the schema',
      priority: 6,
      scope: { project: 'evermemory' },
    });
    const higherPriority = ctx.goalRepo.insert({
      title: 'Ship Phase 2B',
      priority: 2,
      scope: { project: 'evermemory' },
    });

    const active = ctx.goalRepo.findActive({ project: 'evermemory' });

    assert.equal(active.length, 2);
    assert.equal(active[0]?.id, higherPriority.id);
    assert.equal(active[1]?.id, lowerPriority.id);
    assert.deepEqual(active[0]?.sourceInsightIds, []);
  } finally {
    ctx.cleanup();
  }
});

test('ButlerGoalRepository findByStatus returns matching goals only', () => {
  const ctx = createGoalContext();
  try {
    const paused = ctx.goalRepo.insert({ title: 'Paused goal' });
    ctx.goalRepo.insert({ title: 'Active goal' });
    ctx.goalRepo.setStatus(paused.id, 'paused');

    const pausedGoals = ctx.goalRepo.findByStatus('paused');

    assert.equal(pausedGoals.length, 1);
    assert.equal(pausedGoals[0]?.title, 'Paused goal');
  } finally {
    ctx.cleanup();
  }
});

test('ButlerGoalRepository setStatus completes goal with completedAt', () => {
  const ctx = createGoalContext();
  try {
    const goal = ctx.goalRepo.insert({ title: 'Finish implementation' });

    const completed = ctx.goalRepo.setStatus(goal.id, 'completed');

    assert.equal(completed?.status, 'completed');
    assert.ok(completed?.completedAt);
  } finally {
    ctx.cleanup();
  }
});

test('ButlerGoalRepository addProgressNote appends timestamped notes', () => {
  const ctx = createGoalContext();
  try {
    const goal = ctx.goalRepo.insert({ title: 'Track progress' });

    ctx.goalRepo.addProgressNote(goal.id, 'Created the repository');
    const updated = ctx.goalRepo.addProgressNote(goal.id, 'Wired the tool layer');

    const today = new Date().toISOString().slice(0, 10);
    assert.match(updated?.progressNotes ?? '', new RegExp(`^\\[${today}\\] Created the repository\\n\\[${today}\\] Wired the tool layer\\n$`));
  } finally {
    ctx.cleanup();
  }
});

test('ButlerGoalService createGoal validates title and inserts goal', () => {
  const ctx = createGoalContext();
  try {
    assert.throws(
      () => ctx.goalService.createGoal({ title: '   ' }),
      /title/i,
    );

    const goal = ctx.goalService.createGoal({
      title: 'Ship goal service',
      description: 'Implement validation and persistence',
      priority: 3,
    });

    assert.equal(goal.title, 'Ship goal service');
    assert.equal(ctx.goalRepo.findById(goal.id)?.priority, 3);
  } finally {
    ctx.cleanup();
  }
});

test('ButlerGoalService deriveGoalsFromInsights creates goals from commitment insights', () => {
  const ctx = createGoalContext();
  try {
    const commitmentId = insertInsight(ctx.insightRepo, {
      kind: 'commitment',
      title: 'Close the release checklist',
      summary: 'Finish the remaining validation work.',
      importance: 0.82,
      sourceRefs: ['memory-1'],
    });
    const recommendationId = insertInsight(ctx.insightRepo, {
      kind: 'recommendation',
      title: 'Trim build warnings',
      summary: 'Reduce noise before release.',
      importance: 0.45,
      sourceRefs: ['memory-2'],
    });

    const created = ctx.goalService.deriveGoalsFromInsights();

    assert.equal(created.length, 2);
    assert.equal(findGoalBySource(created, commitmentId)?.priority, 2);
    assert.equal(findGoalBySource(created, recommendationId)?.priority, 6);
  } finally {
    ctx.cleanup();
  }
});

test('ButlerGoalService deriveGoalsFromInsights deduplicates existing active goals', () => {
  const ctx = createGoalContext();
  try {
    const insightId = insertInsight(ctx.insightRepo, {
      kind: 'commitment',
      title: 'Follow up on migration review',
    });
    ctx.goalRepo.insert({
      title: 'Follow up on migration review',
      sourceInsightIds: [insightId],
    });

    const created = ctx.goalService.deriveGoalsFromInsights();

    assert.equal(created.length, 0);
    assert.equal(ctx.goalRepo.findActive().length, 1);
  } finally {
    ctx.cleanup();
  }
});

test('ButlerGoalService getGoalSummary returns counts and top goals', () => {
  const ctx = createGoalContext();
  try {
    const alpha = ctx.goalService.createGoal({ title: 'Alpha', priority: 4 });
    const beta = ctx.goalService.createGoal({ title: 'Beta', priority: 2 });
    const gamma = ctx.goalService.createGoal({ title: 'Gamma', priority: 1 });
    const delta = ctx.goalService.createGoal({ title: 'Delta', priority: 3 });
    const paused = ctx.goalService.createGoal({ title: 'Paused goal', priority: 8 });
    const completed = ctx.goalService.createGoal({ title: 'Completed goal', priority: 5 });
    ctx.goalRepo.setStatus(paused.id, 'paused');
    ctx.goalService.completeGoal(completed.id, 'Done');

    const summary = ctx.goalService.getGoalSummary();

    assert.equal(summary.active, 4);
    assert.equal(summary.paused, 1);
    assert.equal(summary.completed, 1);
    assert.deepEqual(summary.topGoals.map((goal: ButlerGoal) => goal.id), [gamma.id, beta.id, delta.id]);
    assert.equal(summary.topGoals.some((goal: ButlerGoal) => goal.id === alpha.id), false);
  } finally {
    ctx.cleanup();
  }
});

test('ButlerInsightRepository normalizes open loop freshness and source refs when omitted', () => {
  const ctx = createGoalContext();
  try {
    const id = insertInsight(ctx.insightRepo, {
      kind: 'open_loop',
      title: 'Unresolved decision',
      summary: 'There is an unresolved question in the rollout.',
      freshUntil: undefined,
      sourceRefs: undefined,
    });

    const insight = ctx.insightRepo.findById(id);

    assert.ok(insight?.freshUntil);
    assert.deepEqual(JSON.parse(insight?.sourceRefsJson ?? '[]'), []);
  } finally {
    ctx.cleanup();
  }
});

test('ButlerGoalRepository stores explicit deadlines and source insight ids', () => {
  const ctx = createGoalContext();
  try {
    const goal = ctx.goalRepo.insert({
      title: 'Track explicit fields',
      deadline: futureIso(48),
      sourceInsightIds: ['insight-1', 'insight-2'],
    });

    const stored = ctx.goalRepo.findById(goal.id);

    assert.equal(stored?.deadline, goal.deadline);
    assert.deepEqual(stored?.sourceInsightIds, ['insight-1', 'insight-2']);
  } finally {
    ctx.cleanup();
  }
});
