import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';
import type { ClockPort } from '../../../src/core/butler/ports/clock.js';
import type { FeedbackStore, InsightStore } from '../../../src/core/butler/ports/storage.js';
import type { ButlerPersistentState } from '../../../src/core/butler/types.js';
import { EvolutionEngine } from '../../../src/core/butler/evolution/engine.js';
import { FeedbackLoop } from '../../../src/core/butler/evolution/feedbackLoop.js';
import { MetricsCollector } from '../../../src/core/butler/evolution/metrics.js';
import { ParameterTuner } from '../../../src/core/butler/evolution/parameterTuner.js';
import type { EvolutionLogEntry } from '../../../src/core/butler/evolution/types.js';
import { ButlerEvolutionRepository } from '../../../src/storage/butlerEvolutionRepo.js';
import { CREATE_PHASE30_BUTLER_EVOLUTION_SQL } from '../../../src/storage/migrations/schemas.js';

function createClock(now = 0): ClockPort & { set(value: number): void } {
  let current = now;
  return {
    now() {
      return current;
    },
    isoNow() {
      return new Date(current).toISOString();
    },
    set(value: number) {
      current = value;
    },
  };
}

function createState(overrides: Partial<ButlerPersistentState> = {}): ButlerPersistentState {
  return {
    currentStrategyFrame: overrides.currentStrategyFrame ?? {
      currentMode: 'planning',
      likelyUserGoal: 'Ship Butler evolution persistence',
      topPriorities: ['Persist evolution logs'],
      constraints: ['SQLite'],
      lastUpdatedAt: '2026-04-06T00:00:00.000Z',
    },
    selfModel: overrides.selfModel ?? {
      overlayAcceptanceRate: 0.2,
      insightPrecision: 0.7,
      avgCycleLatencyMs: 1500,
      totalCycles: 10,
      lastEvaluatedAt: '2026-04-06T00:00:00.000Z',
    },
    workingMemory: overrides.workingMemory ?? [],
    mode: overrides.mode ?? 'reduced',
    lastCycleAt: overrides.lastCycleAt ?? '2026-04-06T00:00:00.000Z',
    lastCycleVersion: overrides.lastCycleVersion ?? 1,
  };
}

function createFeedbackStore(stats: { accepted: number; rejected: number; total: number }): FeedbackStore {
  return {
    insert: () => {
      throw new Error('not implemented');
    },
    findByInsightId: () => [],
    getLatestAction: () => null,
    isSnoozed: () => false,
    isDismissed: () => false,
    isBlocked: () => false,
    getAcceptanceStats: () => stats,
    pruneExpired: () => 0,
  };
}

function createInsightStore(): InsightStore {
  return {
    insert: () => 'insight-1',
    findById: () => null,
    findByKind: () => [],
    findFresh: () => [],
    markSurfaced: () => undefined,
    deleteExpired: () => 0,
  };
}

function createRepo(): { db: Database.Database; repo: ButlerEvolutionRepository } {
  const db = new Database(':memory:');
  for (const sql of CREATE_PHASE30_BUTLER_EVOLUTION_SQL) {
    db.exec(sql);
  }
  return {
    db,
    repo: new ButlerEvolutionRepository(db),
  };
}

function createEngine(repo: ButlerEvolutionRepository, clock = createClock(24 * 60 * 60 * 1000)): EvolutionEngine {
  return new EvolutionEngine(
    new MetricsCollector(
      createFeedbackStore({ accepted: 1, rejected: 4, total: 5 }),
      createInsightStore(),
      clock,
    ),
    new ParameterTuner(clock),
    new FeedbackLoop(),
    clock,
    undefined,
    repo,
  );
}

function createLogEntry(overrides: Partial<EvolutionLogEntry> = {}): EvolutionLogEntry {
  return {
    id: overrides.id ?? 'entry-1',
    cycleType: overrides.cycleType ?? 'parameter_tune',
    parameterKey: overrides.parameterKey ?? 'overlay_confidence_threshold',
    oldValueJson: overrides.oldValueJson ?? '0.3',
    newValueJson: overrides.newValueJson ?? '0.55',
    evidenceJson: overrides.evidenceJson ?? '{"source":"test"}',
    confidence: overrides.confidence ?? 0.8,
    status: overrides.status ?? 'active',
    createdAt: overrides.createdAt ?? '2026-04-06T00:00:00.000Z',
  };
}

describe('Butler evolution persistence', () => {
  it('persists parameter changes to the evolution log when evolving', () => {
    const { db, repo } = createRepo();
    const engine = createEngine(repo);

    const result = engine.evolve(createState());
    const entries = repo.findRecent(10);

    assert.equal(entries.length, result?.changes.length);
    assert.ok(entries.length > 0);
    assert.equal(entries.every((entry) => entry.status === 'active'), true);
    assert.equal(entries.every((entry) => entry.cycleType === 'parameter_tune'), true);
    db.close();
  });

  it('restores parameter values from the most recent active log entries', () => {
    const { db, repo } = createRepo();
    const engine = createEngine(repo);

    repo.insertLog(createLogEntry({
      id: 'newest',
      parameterKey: 'overlay_confidence_threshold',
      newValueJson: '0.55',
      createdAt: '2026-04-06T12:00:00.000Z',
    }));
    repo.insertLog(createLogEntry({
      id: 'older',
      parameterKey: 'overlay_confidence_threshold',
      newValueJson: '0.4',
      createdAt: '2026-04-05T12:00:00.000Z',
    }));

    engine.restoreFromLog();

    assert.equal(
      engine.getParameters().find((parameter) => parameter.key === 'overlay_confidence_threshold')?.currentValue,
      0.55,
    );
    db.close();
  });

  it('reverts a logged change and restores the prior parameter value', () => {
    const { db, repo } = createRepo();
    const engine = createEngine(repo);

    engine.evolve(createState());
    const entry = repo.findRecent(10).find((candidate) => candidate.parameterKey === 'overlay_confidence_threshold');

    assert.ok(entry);
    assert.equal(
      engine.getParameters().find((parameter) => parameter.key === 'overlay_confidence_threshold')?.currentValue,
      JSON.parse(entry.newValueJson ?? '0'),
    );

    assert.equal(engine.revert(entry.id), true);
    assert.equal(repo.findRecent(10).find((candidate) => candidate.id === entry.id)?.status, 'reverted');
    assert.equal(
      engine.getParameters().find((parameter) => parameter.key === 'overlay_confidence_threshold')?.currentValue,
      JSON.parse(entry.oldValueJson ?? '0'),
    );
    db.close();
  });

  it('ignores non-active persisted entries during restore', () => {
    const clock = createClock(0);
    const tuner = new ParameterTuner(clock);

    tuner.restoreFromEntries([
      createLogEntry({
        status: 'reverted',
        newValueJson: '0.55',
      }),
    ]);

    assert.equal(tuner.getParameter('overlay_confidence_threshold')?.currentValue, 0.3);
  });

  it('skips invalid persisted JSON without crashing', () => {
    const clock = createClock(0);
    const tuner = new ParameterTuner(clock);

    assert.doesNotThrow(() => {
      tuner.restoreFromEntries([
        createLogEntry({
          newValueJson: '{not-json}',
        }),
      ]);
    });
    assert.equal(tuner.getParameter('overlay_confidence_threshold')?.currentValue, 0.3);
  });
});
