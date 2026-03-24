import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type Database from 'better-sqlite3';
import type {
  ButlerInsight,
  ButlerPersistentState,
  CognitiveResult,
  CognitiveTask,
  NarrativeThread,
  StrategicOverlay,
} from '../../src/core/butler/types.js';
import type { CognitiveEngine } from '../../src/core/butler/cognition.js';
import { NarrativeThreadService } from '../../src/core/butler/narrative/service.js';
import { compileOverlay } from '../../src/core/butler/strategy/compiler.js';
import { StrategicOverlayGenerator } from '../../src/core/butler/strategy/overlay.js';
import { openDatabase, closeDatabase, type DatabaseHandle } from '../../src/storage/db.js';
import { runMigrations } from '../../src/storage/migrations.js';
import { ButlerInsightRepository } from '../../src/storage/butlerInsightRepo.js';
import { NarrativeRepository } from '../../src/storage/narrativeRepo.js';

function createLogger() {
  return {
    info: (..._args: unknown[]) => undefined,
    warn: (..._args: unknown[]) => undefined,
    error: (..._args: unknown[]) => undefined,
    debug: (..._args: unknown[]) => undefined,
  };
}

function createState(overrides: Partial<ButlerPersistentState> = {}): ButlerPersistentState {
  return {
    currentStrategyFrame: overrides.currentStrategyFrame ?? {
      currentMode: 'implementing',
      likelyUserGoal: 'ship Step 4',
      topPriorities: ['overlay', 'compiler', 'narrative'],
      constraints: ['strict esm', 'sqlite wal'],
      lastUpdatedAt: '2026-03-23T00:00:00.000Z',
    },
    selfModel: overrides.selfModel ?? {
      overlayAcceptanceRate: 0.8,
      insightPrecision: 0.7,
      avgCycleLatencyMs: 120,
      totalCycles: 5,
      lastEvaluatedAt: '2026-03-23T00:00:00.000Z',
    },
    workingMemory: overrides.workingMemory ?? [
      { key: 'task', value: 'write tests', createdAt: '2026-03-23T00:00:00.000Z' },
      { key: 'stale', value: 'ignore me', createdAt: '2026-03-23T00:00:00.000Z', expiresAt: '2000-01-01T00:00:00.000Z' },
    ],
    mode: overrides.mode ?? 'reduced',
    lastCycleAt: overrides.lastCycleAt ?? '2026-03-23T00:00:00.000Z',
    lastCycleVersion: overrides.lastCycleVersion ?? 4,
  };
}

function createOverlay(overrides: Partial<StrategicOverlay> = {}): StrategicOverlay {
  return {
    currentMode: overrides.currentMode ?? 'implementing',
    likelyUserGoal: overrides.likelyUserGoal ?? 'Ship Butler Step 4',
    topPriorities: overrides.topPriorities ?? ['Finish generator', 'Compile XML'],
    constraints: overrides.constraints ?? ['Strict ESM'],
    watchouts: overrides.watchouts ?? ['Do not break tests'],
    recommendedPosture: overrides.recommendedPosture ?? 'execution_first',
    suggestedNextStep: overrides.suggestedNextStep ?? 'Run the requested verification commands',
    confidence: overrides.confidence ?? 0.85,
  };
}

function createDbContext(): {
  path: string;
  handle: DatabaseHandle;
  db: Database.Database;
  cleanup: () => void;
} {
  const path = join(os.tmpdir(), `evermemory-strategy-${randomUUID()}.sqlite`);
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

function createInsightRepoStub(freshInsights: ButlerInsight[] = []): ButlerInsightRepository {
  return {
    findFresh: (_limit = 20) => freshInsights,
  } as ButlerInsightRepository;
}

function createCognitiveStub<T>(options: {
  canAfford?: boolean;
  output?: T;
  fallbackUsed?: boolean;
  confidence?: number;
  onRunTask?: (task: CognitiveTask<T>) => void;
} = {}): CognitiveEngine {
  return {
    canAfford: () => options.canAfford ?? false,
    runTask: async (task: CognitiveTask<T>): Promise<CognitiveResult<T>> => {
      options.onRunTask?.(task);
      return {
        output: (options.output ?? {}) as T,
        confidence: options.confidence ?? 0,
        evidenceIds: ['ev-1'],
        fallbackUsed: options.fallbackUsed ?? false,
      };
    },
  } as unknown as CognitiveEngine;
}

function createInsight(overrides: Partial<ButlerInsight> = {}): ButlerInsight {
  return {
    id: overrides.id ?? `insight-${randomUUID()}`,
    kind: overrides.kind ?? 'recommendation',
    scopeJson: overrides.scopeJson ?? JSON.stringify({ project: 'evermemory' }),
    title: overrides.title ?? 'Keep verification tight',
    summary: overrides.summary ?? 'Run build and focused tests after implementation.',
    confidence: overrides.confidence ?? 0.7,
    importance: overrides.importance ?? 0.9,
    freshUntil: overrides.freshUntil ?? '2099-01-01T00:00:00.000Z',
    sourceRefsJson: overrides.sourceRefsJson,
    modelUsed: overrides.modelUsed,
    cycleTraceId: overrides.cycleTraceId,
    surfacedCount: overrides.surfacedCount ?? 0,
    lastSurfacedAt: overrides.lastSurfacedAt,
    createdAt: overrides.createdAt ?? '2026-03-23T00:00:00.000Z',
  };
}

test('OverlayGenerator generates full overlay when LLM is available', async () => {
  const state = createState();
  const insights = [createInsight()];
  let capturedTask: CognitiveTask<Record<string, unknown>> | undefined;
  const engine = createCognitiveStub<Record<string, unknown>>({
    canAfford: true,
    output: {
      currentMode: 'debugging',
      likelyUserGoal: 'Fix failing verification',
      topPriorities: ['Check tests', 'Patch implementation'],
      constraints: ['Node 22'],
      watchouts: ['Keep output deterministic'],
      recommendedPosture: 'skeptical',
      suggestedNextStep: 'Inspect the failing test output',
      confidence: 0.91,
    },
    onRunTask: (task) => {
      capturedTask = task;
    },
  });
  const generator = new StrategicOverlayGenerator({
    cognitiveEngine: engine,
    insightRepo: createInsightRepoStub(insights),
    logger: createLogger(),
  });

  const overlay = await generator.generateOverlay(state, {
    recentMessages: ['Need Step 4 shipped today'],
    scope: { project: 'evermemory' },
  });

  assert.equal(overlay.currentMode, 'debugging');
  assert.equal(overlay.recommendedPosture, 'skeptical');
  assert.equal(overlay.watchouts[0], 'Keep output deterministic');
  assert.equal(overlay.confidence, 0.91);
  assert.equal(capturedTask?.taskType, 'strategic-overlay');
  assert.equal(capturedTask?.budgetClass, 'balanced');
  assert.equal(capturedTask?.latencyClass, 'foreground');
  assert.deepEqual(
    (capturedTask?.evidence as { recentInsights?: Array<{ title: string }> }).recentInsights?.map(
      (item) => item.title,
    ),
    ['Keep verification tight'],
  );
  assert.equal(
    ((capturedTask?.evidence as { workingMemory?: Array<{ key: string }> }).workingMemory ?? []).length,
    1,
  );
});

test('OverlayGenerator returns heuristic fallback when LLM is unavailable', async () => {
  const state = createState({
    currentStrategyFrame: {
      currentMode: 'planning',
      likelyUserGoal: 'Finalize Step 4',
      topPriorities: ['Write tests'],
      constraints: ['No network'],
      lastUpdatedAt: '2026-03-23T00:00:00.000Z',
    },
  });
  const generator = new StrategicOverlayGenerator({
    cognitiveEngine: createCognitiveStub({ canAfford: false }),
    insightRepo: createInsightRepoStub(),
    logger: createLogger(),
  });

  const overlay = await generator.generateOverlay(state);

  assert.deepEqual(overlay, {
    currentMode: 'planning',
    likelyUserGoal: 'Finalize Step 4',
    topPriorities: ['Write tests'],
    constraints: ['No network'],
    watchouts: [],
    recommendedPosture: 'concise',
    confidence: 0.3,
  });
});

test('OverlayCompiler compiles overlay to XML', () => {
  const xml = compileOverlay(createOverlay(), [createInsight({ title: 'Fresh risk', summary: 'Validate XML output.' })]);

  assert.match(xml, /^<evermemory-butler>[\s\S]+<\/evermemory-butler>$/);
  assert.match(xml, /<strategy mode="implementing" posture="execution_first" confidence="0.85">/);
  assert.match(xml, /目标: Ship Butler Step 4/);
  assert.match(xml, /<watchlist count="2">/);
  assert.match(xml, /Fresh risk: Validate XML output\./);
});

test('OverlayCompiler handles empty fields gracefully', () => {
  const xml = compileOverlay({
    currentMode: 'planning',
    likelyUserGoal: '',
    topPriorities: [],
    constraints: [],
    watchouts: [],
    recommendedPosture: 'concise',
    confidence: 0.3,
  });

  assert.match(xml, /目标: Unknown/);
  assert.match(xml, /优先级: none/);
  assert.match(xml, /约束: none/);
  assert.match(xml, /建议: none/);
  assert.match(xml, /<watchlist count="0">/);
});

test('OverlayCompiler escapes XML special characters', () => {
  const xml = compileOverlay(createOverlay({
    likelyUserGoal: 'Use <safe> & "stable" output',
    constraints: [`Don't break 'quotes'`],
    watchouts: ['Escape > compare'],
  }));

  assert.match(xml, /Use &lt;safe&gt; &amp; &quot;stable&quot; output/);
  assert.match(xml, /Don&apos;t break &apos;quotes&apos;/);
  assert.match(xml, /Escape &gt; compare/);
});

test('NarrativeService createThread returns new thread', async () => {
  const ctx = createDbContext();
  try {
    const service = new NarrativeThreadService({
      narrativeRepo: new NarrativeRepository(ctx.db),
      cognitiveEngine: createCognitiveStub(),
      logger: createLogger(),
    });

    const thread = await service.createThread({
      theme: 'Step 4 rollout',
      objective: 'Ship strategy and narrative services',
      scope: { project: 'evermemory' },
    });

    assert.equal(thread.theme, 'Step 4 rollout');
    assert.equal(thread.currentPhase, 'exploring');
    assert.equal(thread.momentum, 'steady');
    assert.equal(thread.strategicImportance, 0.5);
    assert.equal(typeof thread.id, 'string');
  } finally {
    ctx.cleanup();
  }
});

test('NarrativeService updateThread appends event and keeps last 5', async () => {
  const ctx = createDbContext();
  try {
    const repo = new NarrativeRepository(ctx.db);
    const service = new NarrativeThreadService({
      narrativeRepo: repo,
      cognitiveEngine: createCognitiveStub<Record<string, unknown>>({
        canAfford: true,
        output: {
          phase: 'converging',
          momentum: 'accelerating',
          likelyNextTurn: 'Run verification',
        },
      }),
      logger: createLogger(),
    });
    const created = await service.createThread({
      theme: 'Verification push',
      objective: 'Get Step 4 green',
    });
    repo.update(created.id, {
      recentEvents: ['a', 'b', 'c', 'd', 'e'],
    });

    const updated = await service.updateThread(created.id, 'f');

    assert.equal(updated?.currentPhase, 'converging');
    assert.equal(updated?.momentum, 'accelerating');
    assert.equal(updated?.likelyNextTurn, 'Run verification');
    assert.deepEqual(updated?.recentEvents, ['b', 'c', 'd', 'e', 'f']);
  } finally {
    ctx.cleanup();
  }
});

test('NarrativeService closeThread marks thread as closed', async () => {
  const ctx = createDbContext();
  try {
    const repo = new NarrativeRepository(ctx.db);
    const service = new NarrativeThreadService({
      narrativeRepo: repo,
      cognitiveEngine: createCognitiveStub(),
      logger: createLogger(),
    });
    const thread = await service.createThread({
      theme: 'Close me',
      objective: 'Finish the flow',
    });

    service.closeThread(thread.id);

    assert.equal(repo.findById(thread.id)?.closedAt !== undefined, true);
  } finally {
    ctx.cleanup();
  }
});

test('NarrativeService getActiveThreads returns only open threads', async () => {
  const ctx = createDbContext();
  try {
    const repo = new NarrativeRepository(ctx.db);
    const service = new NarrativeThreadService({
      narrativeRepo: repo,
      cognitiveEngine: createCognitiveStub(),
      logger: createLogger(),
    });
    const openThread = await service.createThread({
      theme: 'Open thread',
      objective: 'Stay active',
      scope: { project: 'evermemory' },
    });
    const closedThread = await service.createThread({
      theme: 'Closed thread',
      objective: 'Disappear from active list',
      scope: { project: 'evermemory' },
    });
    service.closeThread(closedThread.id);

    const active = service.getActiveThreads({ project: 'evermemory' });

    assert.deepEqual(active.map((thread: NarrativeThread) => thread.id), [openThread.id]);
  } finally {
    ctx.cleanup();
  }
});

test('NarrativeService findByTheme matches case-insensitive', async () => {
  const ctx = createDbContext();
  try {
    const service = new NarrativeThreadService({
      narrativeRepo: new NarrativeRepository(ctx.db),
      cognitiveEngine: createCognitiveStub(),
      logger: createLogger(),
    });
    const thread = await service.createThread({
      theme: 'Strategy Narrative Step',
      objective: 'Find by theme',
    });

    const found = service.findByTheme('narrative');

    assert.equal(found?.id, thread.id);
  } finally {
    ctx.cleanup();
  }
});
