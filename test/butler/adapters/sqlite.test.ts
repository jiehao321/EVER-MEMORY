import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createStandaloneStorage } from '../../../src/core/butler/adapters/sqlite.js';
import type { ButlerPersistentState, NarrativeThread } from '../../../src/core/butler/types.js';

function createState(overrides: Partial<ButlerPersistentState> = {}): ButlerPersistentState {
  return {
    currentStrategyFrame: overrides.currentStrategyFrame ?? {
      currentMode: 'planning',
      likelyUserGoal: 'ship standalone butler',
      topPriorities: ['runtime'],
      constraints: ['sqlite'],
      lastUpdatedAt: '2026-04-04T00:00:00.000Z',
    },
    selfModel: overrides.selfModel ?? {
      overlayAcceptanceRate: 0.4,
      insightPrecision: 0.5,
      avgCycleLatencyMs: 100,
      totalCycles: 3,
      lastEvaluatedAt: '2026-04-04T00:00:00.000Z',
    },
    workingMemory: overrides.workingMemory ?? [],
    mode: overrides.mode ?? 'reduced',
    lastCycleAt: overrides.lastCycleAt ?? '2026-04-04T00:00:00.000Z',
    lastCycleVersion: overrides.lastCycleVersion ?? 3,
  };
}

function createThread(): Omit<NarrativeThread, 'id'> {
  return {
    theme: 'phase-4-runtime',
    objective: 'Run Butler independently',
    currentPhase: 'forming',
    momentum: 'steady',
    recentEvents: ['design approved'],
    blockers: [],
    likelyNextTurn: 'implement protocol',
    strategicImportance: 0.9,
    scopeJson: JSON.stringify({ project: 'evermemory' }),
    startedAt: '2026-04-04T00:00:00.000Z',
    updatedAt: '2026-04-04T00:00:00.000Z',
  };
}

describe('createStandaloneStorage', () => {
  it('creates the Butler tables in a fresh in-memory database', () => {
    const { db } = createStandaloneStorage(':memory:');
    const rows = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name IN (
          'butler_state',
          'butler_tasks',
          'narrative_threads',
          'butler_insights',
          'llm_invocations',
          'butler_feedback',
          'butler_goals'
        )
      ORDER BY name
    `).all() as Array<{ name: string }>;

    assert.deepEqual(rows.map((row) => row.name), [
      'butler_feedback',
      'butler_goals',
      'butler_insights',
      'butler_state',
      'butler_tasks',
      'llm_invocations',
      'narrative_threads',
    ]);
    db.close();
  });

  it('supports state load, save, and updateMode', () => {
    const { storage, db } = createStandaloneStorage(':memory:');
    const state = createState();
    storage.state.save(state);

    assert.deepEqual(storage.state.load(), state);

    storage.state.updateMode('steward');
    assert.equal(storage.state.load()?.mode, 'steward');
    db.close();
  });

  it('supports task add, lease, complete, and pending count', () => {
    const { storage, db } = createStandaloneStorage(':memory:');
    const taskId = storage.tasks.addTask({
      type: 'protocol_sync',
      priority: 2,
      payload: { phase: 4 },
      idempotencyKey: 'sync-1',
    });

    assert.equal(storage.tasks.getPendingCount(), 1);
    assert.equal(storage.tasks.getByIdempotencyKey('sync-1')?.id, taskId);

    const leased = storage.tasks.leaseTasks(1);
    assert.equal(leased.length, 1);
    assert.equal(leased[0]?.id, taskId);
    assert.equal(leased[0]?.status, 'running');
    assert.equal(leased[0]?.payloadJson, JSON.stringify({ phase: 4 }));

    storage.tasks.completeTask(taskId, { ok: true });
    assert.equal(storage.tasks.getPendingCount(), 0);
    const row = db.prepare('SELECT status, result_json FROM butler_tasks WHERE id = ?').get(taskId) as {
      status: string;
      result_json: string;
    };
    assert.deepEqual(row, { status: 'completed', result_json: '{"ok":true}' });
    db.close();
  });

  it('supports insight insert, lookup, fresh query, and expiration cleanup', () => {
    const { storage, db } = createStandaloneStorage(':memory:');
    const freshId = storage.insights.insert({
      kind: 'recommendation',
      title: 'Start runtime',
      summary: 'Use standalone mode',
      importance: 0.9,
      confidence: 0.8,
      freshUntil: '2099-01-01T00:00:00.000Z',
    });
    storage.insights.insert({
      kind: 'anomaly',
      title: 'Expired',
      summary: 'Old insight',
      freshUntil: '2000-01-01T00:00:00.000Z',
    });

    assert.equal(storage.insights.findById(freshId)?.title, 'Start runtime');
    assert.deepEqual(storage.insights.findFresh().map((insight: { id: string }) => insight.id), [freshId]);
    assert.equal(storage.insights.deleteExpired(), 1);

    const remaining = db.prepare('SELECT COUNT(*) AS count FROM butler_insights').get() as { count: number };
    assert.equal(remaining.count, 1);
    db.close();
  });

  it('supports feedback inserts and acceptance statistics', () => {
    const { storage, db } = createStandaloneStorage(':memory:');
    const insightId = storage.insights.insert({
      kind: 'continuity',
      title: 'Insight',
      summary: 'summary',
      freshUntil: '2099-01-01T00:00:00.000Z',
    });

    storage.feedback.insert({ insightId, action: 'accepted' });
    storage.feedback.insert({ insightId, action: 'rejected' });

    assert.deepEqual(storage.feedback.getAcceptanceStats(), {
      accepted: 1,
      rejected: 1,
      total: 2,
    });
    db.close();
  });

  it('supports goal insert, active lookup, and status changes', () => {
    const { storage, db } = createStandaloneStorage(':memory:');
    const goal = storage.goals.insert({
      title: 'Ship Butler runtime',
      scope: { project: 'evermemory' },
      sourceInsightIds: ['insight-1'],
    });

    assert.equal(storage.goals.findActive({ project: 'evermemory' }).length, 1);
    const completed = storage.goals.setStatus(goal.id, 'completed');

    assert.equal(completed?.status, 'completed');
    assert.ok(completed?.completedAt);
    db.close();
  });

  it('supports narrative insert, active lookup, and close', () => {
    const { storage, db } = createStandaloneStorage(':memory:');
    const threadId = storage.narrative.insert(createThread());

    assert.deepEqual(storage.narrative.findActive({ project: 'evermemory' }).map((thread: { id: string }) => thread.id), [threadId]);

    storage.narrative.close(threadId);
    assert.deepEqual(storage.narrative.findActive(), []);
    db.close();
  });
});
