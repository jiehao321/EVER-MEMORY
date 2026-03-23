import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import test from 'node:test';
import Database from 'better-sqlite3';
import { ButlerAgent } from '../../src/core/butler/agent.js';
import { AttentionService } from '../../src/core/butler/attention/service.js';
import { CognitiveEngine } from '../../src/core/butler/cognition.js';
import { ButlerGoalService } from '../../src/core/butler/goals/service.js';
import { ButlerLlmClient } from '../../src/core/butler/llmClient.js';
import { ButlerStateManager } from '../../src/core/butler/state.js';
import {
  compileSessionWatchlist,
} from '../../src/core/butler/strategy/compiler.js';
import { StrategicOverlayGenerator } from '../../src/core/butler/strategy/overlay.js';
import { TaskQueueService } from '../../src/core/butler/taskQueue.js';
import type { ButlerConfig, ButlerInsight, LlmGateway, LlmRequest } from '../../src/core/butler/types.js';
import { registerHooks } from '../../src/openclaw/hooks/index.js';
import { openDatabase, closeDatabase, type DatabaseHandle } from '../../src/storage/db.js';
import { ButlerFeedbackRepository } from '../../src/storage/butlerFeedbackRepo.js';
import { ButlerGoalRepository } from '../../src/storage/butlerGoalRepo.js';
import { ButlerInsightRepository } from '../../src/storage/butlerInsightRepo.js';
import { runMigrations } from '../../src/storage/migrations.js';
import { ButlerStateRepository } from '../../src/storage/butlerStateRepo.js';
import { ButlerTaskRepository } from '../../src/storage/butlerTaskRepo.js';
import { LlmInvocationRepo } from '../../src/storage/llmInvocationRepo.js';
import { createTempDbPath } from '../helpers.js';

type HookHandler = (event: unknown, context: unknown) => unknown | Promise<unknown>;

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
  const path = createTempDbPath(`butler-phase2-attention-${randomUUID()}`);
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
  const service = new AttentionService({
    insightRepo,
    feedbackRepo,
    config: { maxInsightsPerBriefing: 3, minConfidence: 0.4, tokenBudgetPercent: 0.2 },
    logger: createLogger(),
  });
  return { ...ctx, insightRepo, feedbackRepo, service };
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
): ButlerInsight {
  const id = repo.insert({
    kind: overrides.kind ?? 'recommendation',
    title: overrides.title ?? 'Critical Butler reminder',
    summary: overrides.summary ?? 'Surface this at session start.',
    confidence: overrides.confidence ?? 0.86,
    importance: overrides.importance ?? 0.95,
    freshUntil: overrides.freshUntil ?? futureIso(24),
  });
  const insight = repo.findById(id);
  assert.ok(insight);
  return insight;
}

function createConfig(): ButlerConfig {
  return {
    enabled: true,
    mode: 'steward',
    cognition: {
      dailyTokenBudget: 100,
      sessionTokenBudget: 80,
      taskTimeoutMs: 1500,
      fallbackToHeuristics: true,
    },
    timeBudgets: {
      sessionStartMs: 1500,
      beforeAgentMs: 800,
      agentEndMs: 600,
    },
    attention: {
      maxInsightsPerBriefing: 3,
      tokenBudgetPercent: 0.2,
      minConfidence: 0.4,
    },
  };
}

function createGateway(): LlmGateway {
  return {
    async invoke(request: LlmRequest) {
      if (request.purpose === 'strategic-overlay') {
        return {
          content: JSON.stringify({
            currentMode: 'implementing',
            likelyUserGoal: 'Ship Butler Phase 2C',
            topPriorities: ['Surface critical reminders'],
            constraints: ['Strict ESM'],
            watchouts: ['Do not block hooks'],
            recommendedPosture: 'execution_first',
            suggestedNextStep: 'Run validation',
            confidence: 0.9,
          }),
        };
      }
      return { content: '{}' };
    },
  };
}

function createHookApi(hooks: Map<string, HookHandler[]>) {
  return {
    logger: createLogger(),
    on(name: string, handler: HookHandler) {
      const existing = hooks.get(name) ?? [];
      existing.push(handler);
      hooks.set(name, existing);
    },
  };
}

async function runHook(
  hooks: Map<string, HookHandler[]>,
  name: string,
  event: unknown,
  context: unknown,
): Promise<unknown> {
  let result: unknown = undefined;
  for (const handler of hooks.get(name) ?? []) {
    const next = await handler(event, context);
    if (next !== undefined) {
      result = next;
    }
  }
  return result;
}

function createButlerFixture() {
  const dbContext = createDbContext();
  const logger = createLogger();
  const config = createConfig();
  const insightRepo = new ButlerInsightRepository(dbContext.db);
  const feedbackRepo = new ButlerFeedbackRepository(dbContext.db);
  const goalRepo = new ButlerGoalRepository(dbContext.db);
  const stateManager = new ButlerStateManager({
    stateRepo: new ButlerStateRepository(dbContext.db),
    logger,
  });
  const taskRepo = new ButlerTaskRepository(dbContext.db);
  const llmClient = new ButlerLlmClient({ gateway: createGateway(), logger });
  const cognitiveEngine = new CognitiveEngine({
    llmClient,
    invocationRepo: new LlmInvocationRepo(dbContext.db),
    config: config.cognition,
    logger,
  });
  const goalService = new ButlerGoalService({ goalRepo, insightRepo, logger });
  const attentionService = new AttentionService({
    insightRepo,
    feedbackRepo,
    config: config.attention,
    logger,
  });
  const overlayGenerator = new StrategicOverlayGenerator({
    cognitiveEngine,
    insightRepo,
    logger,
  });
  const taskQueue = new TaskQueueService({ taskRepo, logger });
  const agent = new ButlerAgent({
    stateManager,
    taskQueue,
    cognitiveEngine,
    insightRepo,
    goalService,
    logger,
  });
  return {
    ...dbContext,
    agent,
    attentionService,
    overlayGenerator,
    goalService,
    insightRepo,
    feedbackRepo,
    goalRepo,
  };
}

test('AttentionService.shouldForceSurface returns true for importance >= 0.9 and not dismissed', () => {
  const ctx = createInsightRepoContext();
  try {
    const insight = insertInsight(ctx.insightRepo, { importance: 0.91 });

    assert.equal(ctx.service.shouldForceSurface(insight), true);
  } finally {
    ctx.cleanup();
  }
});

test('AttentionService.shouldForceSurface returns false for dismissed insights', () => {
  const ctx = createInsightRepoContext();
  try {
    const insight = insertInsight(ctx.insightRepo, { importance: 0.95 });
    ctx.feedbackRepo.insert({ insightId: insight.id, action: 'dismissed' });

    assert.equal(ctx.service.shouldForceSurface(insight), false);
  } finally {
    ctx.cleanup();
  }
});

test('AttentionService.shouldForceSurface returns false for snoozed insights', () => {
  const ctx = createInsightRepoContext();
  try {
    const insight = insertInsight(ctx.insightRepo, { importance: 0.95 });
    ctx.feedbackRepo.insert({
      insightId: insight.id,
      action: 'snoozed',
      snoozeUntil: futureIso(8),
    });

    assert.equal(ctx.service.shouldForceSurface(insight), false);
  } finally {
    ctx.cleanup();
  }
});

test('AttentionService.getCriticalInsights returns force-surface insights first', () => {
  const ctx = createInsightRepoContext();
  try {
    const regular = insertInsight(ctx.insightRepo, {
      title: 'Regular top insight',
      importance: 0.82,
      confidence: 0.88,
    });
    const forced = insertInsight(ctx.insightRepo, {
      title: 'Force surfaced insight',
      importance: 0.97,
      confidence: 0.75,
    });

    const insights = ctx.service.getCriticalInsights(3);

    assert.equal(insights[0]?.id, forced.id);
    assert.match(insights.map((item) => item.title).join(' | '), /Regular top insight/);
  } finally {
    ctx.cleanup();
  }
});

test('compileSessionWatchlist renders compact reminders and goals', () => {
  const xml = compileSessionWatchlist(
    [
      {
        id: 'insight-1',
        kind: 'commitment',
        title: 'Follow up with team on PR review',
        summary: 'summary',
        confidence: 0.8,
        importance: 0.95,
        surfacedCount: 0,
        createdAt: '2026-03-23T00:00:00.000Z',
      },
      {
        id: 'insight-2',
        kind: 'open_loop',
        title: 'Architecture decision on storage layer',
        summary: 'summary',
        confidence: 0.75,
        importance: 0.9,
        surfacedCount: 0,
        createdAt: '2026-03-23T00:00:00.000Z',
      },
    ],
    [
      { title: 'Implement Butler Phase 2', priority: 2 },
      { title: 'Update documentation', priority: 6 },
    ],
  );

  assert.match(xml, /<evermemory-watchlist>/);
  assert.match(xml, /\[commitment\] Follow up with team on PR review/);
  assert.match(xml, /\[open_loop\] Architecture decision on storage layer/);
  assert.match(xml, /● Implement Butler Phase 2/);
  assert.match(xml, /○ Update documentation/);
});

test('compileSessionWatchlist returns empty string when there is nothing to show', () => {
  assert.equal(compileSessionWatchlist([], []), '');
});

test('compileSessionWatchlist escapes XML special characters', () => {
  const xml = compileSessionWatchlist(
    [{
      id: 'insight-xml',
      kind: 'recommendation',
      title: 'Use <xml> & "quotes"',
      summary: 'summary',
      confidence: 0.8,
      importance: 0.92,
      surfacedCount: 0,
      createdAt: '2026-03-23T00:00:00.000Z',
    }],
    [{ title: 'Ship > docs & tests', priority: 2 }],
  );

  assert.match(xml, /&lt;xml&gt; &amp; &quot;quotes&quot;/);
  assert.match(xml, /Ship &gt; docs &amp; tests/);
});

test('session_start injects watchlist prependContext when critical items exist', async () => {
  const fixture = createButlerFixture();
  const hooks = new Map<string, HookHandler[]>();
  try {
    fixture.insightRepo.insert({
      kind: 'commitment',
      scope: { project: 'evermemory' },
      title: 'Follow up on PR review',
      summary: 'Do not lose the pending review thread.',
      confidence: 0.86,
      importance: 0.95,
      freshUntil: '2099-01-01T00:00:00.000Z',
    });
    fixture.goalRepo.insert({
      title: 'Implement Butler Phase 2C',
      priority: 2,
      scope: { project: 'evermemory' },
    });

    registerHooks({
      api: createHookApi(hooks),
      evermemory: {
        sessionStart: () => ({ ok: true }),
        messageReceived: async () => ({ ok: true }),
        sessionEnd: async () => ({ ok: true }),
        debugRepo: { log: (..._args: unknown[]) => undefined },
      },
      sessionScopes: new Map<string, { scope: { userId?: string; chatId?: string; project?: string } }>(),
    } as never, {
      agent: fixture.agent,
      overlayGenerator: fixture.overlayGenerator,
      attentionService: fixture.attentionService,
      goalService: fixture.goalService,
    });

    const result = await runHook(
      hooks,
      'session_start',
      { sessionId: 'session-phase2c', sessionKey: 'chat:butler:phase2c', project: 'evermemory' },
      { sessionId: 'session-phase2c', sessionKey: 'chat:butler:phase2c', repoName: 'evermemory' },
    );

    const prependContext = (result as { prependContext?: string } | undefined)?.prependContext ?? '';
    assert.match(prependContext, /<evermemory-watchlist>/);
    assert.match(prependContext, /Follow up on PR review/);
    assert.match(prependContext, /Implement Butler Phase 2C/);
  } finally {
    fixture.cleanup();
  }
});
