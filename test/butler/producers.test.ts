import assert from 'node:assert/strict';
import test from 'node:test';
import type { ClockPort } from '../../src/core/butler/ports/clock.js';
import type { MemoryQueryPort, MemorySnapshot } from '../../src/core/butler/ports/memory.js';
import { ThemeExtractor } from '../../src/core/butler/producers/themeExtractor.js';
import { AnomalyDetector } from '../../src/core/butler/producers/anomalyDetector.js';
import { OpenLoopTracker } from '../../src/core/butler/producers/openLoopTracker.js';
import { RecommendationEngine } from '../../src/core/butler/producers/recommendationEngine.js';
import { ContinuityAnalyzer } from '../../src/core/butler/producers/continuityAnalyzer.js';
import { InsightProducerRegistry } from '../../src/core/butler/producers/registry.js';
import { ButlerGoalRepository } from '../../src/storage/butlerGoalRepo.js';
import { ButlerInsightRepository } from '../../src/storage/butlerInsightRepo.js';
import { NarrativeRepository } from '../../src/storage/narrativeRepo.js';
import { createInMemoryDb } from '../storage/helpers.js';

const NOW_ISO = '2026-04-04T12:00:00.000Z';
const NOW_MS = Date.parse(NOW_ISO);

function createClock(): ClockPort {
  return {
    now: () => NOW_MS,
    isoNow: () => NOW_ISO,
  };
}

function createMemoryQuery(memories: MemorySnapshot[]): MemoryQueryPort {
  return {
    search: () => memories,
  };
}

test('ThemeExtractor emits recurring theme insights for frequent recent memory types', () => {
  const memories: MemorySnapshot[] = Array.from({ length: 5 }, (_, index) => ({
    id: `memory-${index}`,
    content: `Task ${index}`,
    type: 'project',
    tags: [],
    scores: { confidence: 0.8, importance: 0.7 },
    scope: { project: 'evermemory' },
    timestamps: { createdAt: NOW_ISO, updatedAt: NOW_ISO },
  }));
  const extractor = new ThemeExtractor(createMemoryQuery(memories), createClock());

  const insights = extractor.produce({ project: 'evermemory' });

  assert.equal(insights.length, 1);
  assert.equal(insights[0]?.kind, 'theme');
  assert.match(insights[0]?.title ?? '', /Recurring theme: project \(5 memories\)/);
  assert.equal(insights[0]?.freshUntil, '2026-04-06T12:00:00.000Z');
});

test('AnomalyDetector flags high-importance low-confidence memories and caps output', () => {
  const memories: MemorySnapshot[] = Array.from({ length: 4 }, (_, index) => ({
    id: `anomaly-${index}`,
    content: `Potentially critical note ${index}`.repeat(3),
    type: 'fact',
    tags: [],
    scores: { confidence: 0.2, importance: 0.75 },
    scope: { project: 'evermemory' },
    timestamps: { createdAt: NOW_ISO, updatedAt: NOW_ISO },
  }));
  const detector = new AnomalyDetector(createMemoryQuery(memories), createClock());

  const insights = detector.produce({ project: 'evermemory' });

  assert.equal(insights.length, 3);
  assert.equal(insights[0]?.kind, 'anomaly');
  assert.deepEqual(insights[0]?.sourceRefs, ['anomaly-0']);
  assert.equal(insights[0]?.freshUntil, '2026-04-07T12:00:00.000Z');
});

test('OpenLoopTracker and RecommendationEngine derive goal-based insights', () => {
  const db = createInMemoryDb();
  const goals = new ButlerGoalRepository(db);
  const clock = createClock();

  const stalledGoal = goals.insert({
    title: 'Finish Butler Phase 2',
    scope: { project: 'evermemory' },
    priority: 2,
  });
  db.prepare('UPDATE butler_goals SET created_at = ?, updated_at = ? WHERE id = ?')
    .run('2026-03-15T12:00:00.000Z', '2026-03-15T12:00:00.000Z', stalledGoal.id);

  goals.insert({
    title: 'Ship knowledge gap tool',
    scope: { project: 'evermemory' },
    priority: 1,
    deadline: '2026-04-06T00:00:00.000Z',
  });

  const openLoopTracker = new OpenLoopTracker(goals, clock);
  const recommendationEngine = new RecommendationEngine(goals, new ButlerInsightRepository(db), clock);

  const openLoopInsights = openLoopTracker.produce({ project: 'evermemory' });
  const recommendations = recommendationEngine.produce({ project: 'evermemory' });

  assert.equal(openLoopInsights.length, 1);
  assert.match(openLoopInsights[0]?.title ?? '', /Stalled goal/);
  assert.equal(openLoopInsights[0]?.importance, 0.8);
  assert.equal(recommendations.length, 1);
  assert.match(recommendations[0]?.title ?? '', /due in 2 days/);
  assert.equal(recommendations[0]?.importance, 0.9);
});

test('ContinuityAnalyzer highlights stale blocked or stalling threads', () => {
  const db = createInMemoryDb();
  const narratives = new NarrativeRepository(db);
  const id = narratives.insert({
    theme: 'Butler OODA integration',
    objective: 'wire producers into startup',
    currentPhase: 'converging',
    momentum: 'blocked',
    recentEvents: ['waiting on follow-up'],
    blockers: ['tool wiring'],
    likelyNextTurn: 'finish registration',
    strategicImportance: 0.9,
    scopeJson: JSON.stringify({ project: 'evermemory' }),
    startedAt: '2026-03-30T12:00:00.000Z',
    updatedAt: '2026-04-01T09:00:00.000Z',
  });
  assert.ok(id.length > 0);
  const analyzer = new ContinuityAnalyzer(narratives, createClock());

  const insights = analyzer.produce({ project: 'evermemory' });

  assert.equal(insights.length, 1);
  assert.match(insights[0]?.title ?? '', /Blocked thread/);
  assert.match(insights[0]?.summary ?? '', /Blockers: tool wiring/);
});

test('InsightProducerRegistry persists producer output and isolates producer failures', () => {
  const db = createInMemoryDb();
  const insights = new ButlerInsightRepository(db);
  const warnings: string[] = [];
  const registry = new InsightProducerRegistry(insights, {
    info: () => undefined,
    warn: (message: string) => {
      warnings.push(message);
    },
    error: () => undefined,
    debug: () => undefined,
  });

  registry.register({
    kind: 'theme',
    produce: () => [{
      kind: 'theme',
      scope: { project: 'evermemory' },
      title: 'Recurring theme: project (5 memories)',
      summary: 'Project memories are recurring.',
      confidence: 0.75,
      importance: 0.6,
      freshUntil: '2099-04-06T12:00:00.000Z',
    }],
  });
  registry.register({
    kind: 'broken',
    produce: () => {
      throw new Error('boom');
    },
  });

  const created = registry.runAll({ project: 'evermemory' });

  assert.equal(registry.getProducerCount(), 2);
  assert.equal(created.length, 1);
  assert.equal(created[0]?.kind, 'theme');
  assert.equal(insights.findFresh(10).length, 1);
  assert.deepEqual(warnings, ['InsightProducer broken failed']);
});
