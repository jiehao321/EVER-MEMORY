import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ClockPort } from '../../src/core/butler/ports/clock.js';
import type { FeedbackStore, InsightStore } from '../../src/core/butler/ports/storage.js';
import type { ButlerPersistentState } from '../../src/core/butler/types.js';
import { EvolutionEngine } from '../../src/core/butler/evolution/engine.js';
import { FeedbackLoop, type FeedbackAdjustment } from '../../src/core/butler/evolution/feedbackLoop.js';
import { MetricsCollector } from '../../src/core/butler/evolution/metrics.js';
import { ParameterTuner } from '../../src/core/butler/evolution/parameterTuner.js';
import type { ParameterChange } from '../../src/core/butler/evolution/types.js';

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
      likelyUserGoal: 'Ship Butler Phase 3',
      topPriorities: ['Add self-evolution'],
      constraints: ['Strict ESM'],
      lastUpdatedAt: '2026-04-04T00:00:00.000Z',
    },
    selfModel: overrides.selfModel ?? {
      overlayAcceptanceRate: 0.2,
      insightPrecision: 0.7,
      avgCycleLatencyMs: 1500,
      totalCycles: 10,
      lastEvaluatedAt: '2026-04-04T00:00:00.000Z',
    },
    workingMemory: overrides.workingMemory ?? [],
    mode: overrides.mode ?? 'reduced',
    lastCycleAt: overrides.lastCycleAt ?? '2026-04-04T00:00:00.000Z',
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

describe('Butler evolution', () => {
  it('collects metrics from Butler state and feedback stats', () => {
    const metrics = new MetricsCollector(
      createFeedbackStore({ accepted: 2, rejected: 3, total: 5 }),
      createInsightStore(),
      createClock(0),
    ).collect(createState({
      selfModel: {
        overlayAcceptanceRate: 0.4,
        insightPrecision: 0.7,
        avgCycleLatencyMs: 900,
        totalCycles: 6,
        lastEvaluatedAt: '2026-04-04T00:00:00.000Z',
      },
    }));

    assert.equal(metrics.overlayAcceptanceRate, 0.4);
    assert.equal(metrics.insightDismissalRate, 0.6);
    assert.equal(metrics.avgCycleLatencyMs, 900);
  });

  it('tunes parameters when metrics cross thresholds', () => {
    const tuner = new ParameterTuner(createClock(0));
    const changes = tuner.tune({
      overlayAcceptanceRate: 0.2,
      insightDismissalRate: 0.7,
      questionAnswerRate: 0.25,
      actionSuccessRate: 0,
      actionRollbackRate: 0,
      avgCycleLatencyMs: 1500,
    });

    assert.deepEqual(
      changes.map((change: ParameterChange) => change.key).sort(),
      [
        'insight_cooldown_minutes',
        'overlay_confidence_threshold',
        'question_frequency_per_session',
        'task_drain_budget',
      ],
    );
    assert.equal(tuner.getParameter('overlay_confidence_threshold')?.currentValue, 0.31);
  });

  it('returns feedback adjustments for weak acceptance and rollback signals', () => {
    const adjustments = new FeedbackLoop().evaluate({
      overlayAcceptanceRate: 0.25,
      insightDismissalRate: 0.7,
      questionAnswerRate: 0.1,
      actionSuccessRate: 0.8,
      actionRollbackRate: 0.3,
      avgCycleLatencyMs: 300,
    });

    assert.deepEqual(adjustments.map((adjustment: FeedbackAdjustment) => adjustment.dimension), [
      'overlay_frequency',
      'insight_confidence_threshold',
      'question_frequency',
      'action_autonomy',
    ]);
  });

  it('evolves once per interval and exposes tuned parameters', () => {
    const clock = createClock(24 * 60 * 60 * 1000);
    const engine = new EvolutionEngine(
      new MetricsCollector(
        createFeedbackStore({ accepted: 1, rejected: 4, total: 5 }),
        createInsightStore(),
        clock,
      ),
      new ParameterTuner(clock),
      new FeedbackLoop(),
      clock,
    );

    const first = engine.evolve(createState());
    const second = engine.evolve(createState());

    assert.equal(first?.cycleType, 'parameter_tune');
    assert.ok((first?.changes.length ?? 0) > 0);
    assert.equal(second, null);
    assert.ok(engine.getParameters().length >= 7);
  });
});
