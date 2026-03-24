import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import Database from 'better-sqlite3';
import { butlerBrief } from '../../src/tools/butlerBrief.js';
import { butlerStatus } from '../../src/tools/butlerStatus.js';
import { butlerTune } from '../../src/tools/butlerTune.js';
import { ButlerAgent } from '../../src/core/butler/agent.js';
import { AttentionService } from '../../src/core/butler/attention/service.js';
import { CommitmentWatcher } from '../../src/core/butler/commitments/watcher.js';
import { CognitiveEngine } from '../../src/core/butler/cognition.js';
import { ButlerGoalService } from '../../src/core/butler/goals/service.js';
import { ButlerLlmClient } from '../../src/core/butler/llmClient.js';
import { NarrativeThreadService } from '../../src/core/butler/narrative/service.js';
import { ButlerStateManager } from '../../src/core/butler/state.js';
import { StrategicOverlayGenerator } from '../../src/core/butler/strategy/overlay.js';
import { TaskQueueService } from '../../src/core/butler/taskQueue.js';
import type { ButlerConfig, ButlerInsight, LlmGateway, LlmRequest } from '../../src/core/butler/types.js';
import { registerHooks } from '../../src/openclaw/hooks/index.js';
import { buildInjectedContext } from '../../src/openclaw/shared.js';
import { openDatabase, closeDatabase, type DatabaseHandle } from '../../src/storage/db.js';
import { ButlerFeedbackRepository } from '../../src/storage/butlerFeedbackRepo.js';
import { ButlerGoalRepository } from '../../src/storage/butlerGoalRepo.js';
import { ButlerInsightRepository } from '../../src/storage/butlerInsightRepo.js';
import { ButlerStateRepository } from '../../src/storage/butlerStateRepo.js';
import { ButlerTaskRepository } from '../../src/storage/butlerTaskRepo.js';
import { LlmInvocationRepo } from '../../src/storage/llmInvocationRepo.js';
import { MemoryRepository } from '../../src/storage/memoryRepo.js';
import { runMigrations } from '../../src/storage/migrations.js';
import { NarrativeRepository } from '../../src/storage/narrativeRepo.js';
import type { MemoryItem } from '../../src/types.js';
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

function createConfig(): ButlerConfig {
  return {
    enabled: true,
    mode: 'reduced',
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
    workers: {
      enabled: false,
      maxWorkers: 2,
      taskTimeoutMs: 10000,
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
            likelyUserGoal: 'Ship Butler Step 6',
            topPriorities: ['Register tools', 'Inject overlay'],
            constraints: ['Strict ESM'],
            watchouts: ['Do not block hooks'],
            recommendedPosture: 'execution_first',
            suggestedNextStep: 'Run the required verification commands',
            confidence: 0.93,
          }),
          usage: { inputTokens: 20, outputTokens: 12, totalTokens: 32 },
          model: 'test-model',
          provider: 'test',
        };
      }
      if (request.purpose === 'commitment-extraction') {
        return {
          content: JSON.stringify({
            title: 'Validate Butler migration',
            summary: 'Follow up on Butler migration validation',
            confidence: 0.82,
            importance: 0.78,
            what: 'Validate Butler migration',
            when: 'today',
            status: 'open',
          }),
          usage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
          model: 'test-model',
          provider: 'test',
        };
      }
      return {
        content: '{}',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        model: 'test-model',
        provider: 'test',
      };
    },
  };
}

function createMemory(overrides: Partial<MemoryItem> = {}): MemoryItem {
  const id = overrides.id ?? `memory-${randomUUID()}`;
  return {
    id,
    content: overrides.content ?? 'I will validate the Butler migration by tonight.',
    type: overrides.type ?? 'commitment',
    lifecycle: overrides.lifecycle ?? 'episodic',
    source: overrides.source ?? {
      kind: 'message',
      actor: 'user',
      sessionId: 'session-butler-tools',
      messageId: `msg-${id}`,
      channel: 'test',
    },
    scope: overrides.scope ?? {
      userId: 'user-butler',
      chatId: 'chat-butler',
      project: 'evermemory',
      global: false,
    },
    scores: overrides.scores ?? {
      confidence: 0.76,
      importance: 0.81,
      explicitness: 0.7,
    },
    timestamps: overrides.timestamps ?? {
      createdAt: '2026-03-23T00:00:00.000Z',
      updatedAt: '2026-03-23T00:00:00.000Z',
      lastAccessedAt: '2026-03-23T00:00:00.000Z',
    },
    state: overrides.state ?? {
      active: true,
      archived: false,
      supersededBy: undefined,
    },
    evidence: overrides.evidence ?? {
      excerpt: undefined,
      references: [],
    },
    tags: overrides.tags ?? [],
    relatedEntities: overrides.relatedEntities ?? [],
    sourceGrade: overrides.sourceGrade ?? 'primary',
    stats: overrides.stats ?? {
      accessCount: 0,
      retrievalCount: 0,
    },
  };
}

function createInsight(overrides: Partial<ButlerInsight> = {}): ButlerInsight {
  return {
    id: overrides.id ?? `insight-${randomUUID()}`,
    kind: overrides.kind ?? 'recommendation',
    scopeJson: overrides.scopeJson ?? JSON.stringify({ project: 'evermemory' }),
    title: overrides.title ?? 'Keep the integration non-blocking',
    summary: overrides.summary ?? 'Wrap Butler hook work in try/catch.',
    confidence: overrides.confidence ?? 0.85,
    importance: overrides.importance ?? 0.92,
    freshUntil: overrides.freshUntil ?? '2099-01-01T00:00:00.000Z',
    sourceRefsJson: overrides.sourceRefsJson,
    modelUsed: overrides.modelUsed,
    cycleTraceId: overrides.cycleTraceId,
    surfacedCount: overrides.surfacedCount ?? 0,
    lastSurfacedAt: overrides.lastSurfacedAt,
    createdAt: overrides.createdAt ?? '2026-03-23T00:00:00.000Z',
  };
}

function createDbContext(): {
  path: string;
  handle: DatabaseHandle;
  db: Database.Database;
  cleanup: () => void;
} {
  const path = createTempDbPath('butler-tools-integration');
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

function createButlerFixture() {
  const dbContext = createDbContext();
  const logger = createLogger();
  const config = createConfig();
  const memoryRepo = new MemoryRepository(dbContext.db);
  const insightRepo = new ButlerInsightRepository(dbContext.db);
  const feedbackRepo = new ButlerFeedbackRepository(dbContext.db);
  const goalRepo = new ButlerGoalRepository(dbContext.db);
  const stateRepo = new ButlerStateRepository(dbContext.db);
  const taskRepo = new ButlerTaskRepository(dbContext.db);
  const narrativeRepo = new NarrativeRepository(dbContext.db);
  const llmInvocationRepo = new LlmInvocationRepo(dbContext.db);
  const llmClient = new ButlerLlmClient({ gateway: createGateway(), logger });
  const cognitiveEngine = new CognitiveEngine({
    llmClient,
    invocationRepo: llmInvocationRepo,
    config: config.cognition,
    logger,
  });
  const stateManager = new ButlerStateManager({ stateRepo, logger });
  const taskQueue = new TaskQueueService({ taskRepo, logger });
  const narrativeService = new NarrativeThreadService({
    narrativeRepo,
    cognitiveEngine,
    logger,
  });
  const attentionService = new AttentionService({
    insightRepo,
    feedbackRepo,
    config: config.attention,
    logger,
  });
  const goalService = new ButlerGoalService({
    goalRepo,
    insightRepo,
    logger,
  });
  const overlayGenerator = new StrategicOverlayGenerator({
    cognitiveEngine,
    insightRepo,
    logger,
  });
  const commitmentWatcher = new CommitmentWatcher({
    memoryRepo,
    insightRepo,
    cognitiveEngine,
    logger,
  });
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
    config,
    memoryRepo,
    insightRepo,
    feedbackRepo,
    goalRepo,
    goalService,
    stateManager,
    taskQueue,
    narrativeService,
    attentionService,
    overlayGenerator,
    commitmentWatcher,
    cognitiveEngine,
    agent,
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

test('butlerStatus returns current Butler summary structure', async () => {
  const fixture = createButlerFixture();
  try {
    await fixture.agent.runCycle({ type: 'service_started' });
    fixture.insightRepo.insert({
      kind: 'recommendation',
      scope: { project: 'evermemory' },
      title: 'Keep tests first',
      summary: 'Verify Step 6 through the integration suite.',
      confidence: 0.9,
      importance: 0.95,
      freshUntil: '2099-01-01T00:00:00.000Z',
    });
    fixture.taskQueue.enqueue({ type: 'sync_overlay', priority: 2 });
    await fixture.narrativeService.createThread({
      theme: 'Butler integration',
      objective: 'Complete Step 6',
      scope: { project: 'evermemory' },
    });

    const result = butlerStatus({
      agent: fixture.agent,
      narrativeService: fixture.narrativeService,
      taskQueue: fixture.taskQueue,
      cognitiveEngine: fixture.cognitiveEngine,
      attentionService: fixture.attentionService,
      goalService: fixture.goalService,
      scope: { project: 'evermemory' },
    });

    assert.equal(result.mode, 'reduced');
    assert.equal(typeof result.cycleVersion, 'number');
    assert.equal(typeof result.lastCycleAt, 'string');
    assert.equal(result.pendingTasks, 1);
    assert.equal(result.activeThreads.length, 1);
    assert.equal(result.activeThreads[0]?.theme, 'Butler integration');
    assert.equal(result.topInsights[0]?.title, 'Keep tests first');
    assert.equal(result.llmUsage.dailyBudget, fixture.config.cognition.dailyTokenBudget);
  } finally {
    fixture.cleanup();
  }
});

test('butlerBrief returns overlay XML and optional narratives and commitments', async () => {
  const fixture = createButlerFixture();
  try {
    await fixture.agent.runCycle({ type: 'service_started' });
    fixture.insightRepo.insert({
      kind: 'recommendation',
      scope: { project: 'evermemory' },
      title: 'Preserve hook stability',
      summary: 'Butler must never block the agent hook pipeline.',
      confidence: 0.88,
      importance: 0.91,
      freshUntil: '2099-01-01T00:00:00.000Z',
    });
    fixture.memoryRepo.insert(createMemory());
    await fixture.narrativeService.createThread({
      theme: 'Hook integration',
      objective: 'Append Butler overlay context',
      scope: { project: 'evermemory' },
    });

    const result = await butlerBrief({
      agent: fixture.agent,
      overlayGenerator: fixture.overlayGenerator,
      narrativeService: fixture.narrativeService,
      commitmentWatcher: fixture.commitmentWatcher,
      attentionService: fixture.attentionService,
      goalService: fixture.goalService,
      scope: { project: 'evermemory' },
      includeNarratives: true,
      includeCommitments: true,
      includeGoals: true,
    });

    assert.match(result.overlayXml, /<evermemory-butler>/);
    assert.equal(result.overlay.currentMode, 'implementing');
    assert.equal(result.narratives?.length, 1);
    assert.ok((result.commitments?.length ?? 0) >= 1);
    assert.ok(Array.isArray(result.goals));
  } finally {
    fixture.cleanup();
  }
});

test('butlerTune get returns current config snapshot', () => {
  const fixture = createButlerFixture();
  try {
    const result = butlerTune({
      stateManager: fixture.stateManager,
      config: fixture.config,
      action: 'get',
    });

    assert.equal(result.config.mode, 'reduced');
    assert.equal(result.config.attention.maxInsightsPerBriefing, 3);
  } finally {
    fixture.cleanup();
  }
});

test('butlerTune set updates Butler mode', () => {
  const fixture = createButlerFixture();
  try {
    fixture.stateManager.load();

    const result = butlerTune({
      stateManager: fixture.stateManager,
      config: fixture.config,
      action: 'set',
      key: 'mode',
      value: 'reduced',
    });

    assert.equal(result.updated?.key, 'mode');
    assert.equal(result.config.mode, 'reduced');
    assert.equal(fixture.stateManager.getMode(), 'reduced');
  } finally {
    fixture.cleanup();
  }
});

test('registerHooks appends Butler overlay into before_agent_start prependContext', async () => {
  const fixture = createButlerFixture();
  const hooks = new Map<string, HookHandler[]>();
  try {
    fixture.insightRepo.insert({
      kind: 'recommendation',
      scope: { project: 'evermemory' },
      title: 'Inject overlay after recall context',
      summary: 'Keep EverMemory context and Butler context together.',
      confidence: 0.86,
      importance: 0.94,
      freshUntil: '2099-01-01T00:00:00.000Z',
    });

    const context = {
      api: createHookApi(hooks),
      evermemory: {
        sessionStart: () => ({ ok: true }),
        messageReceived: async () => ({
          sessionId: 'session-butler-hook',
          messageId: 'run-butler-hook',
          intent: { intent: { type: 'other' } },
          recall: {
            items: [{ type: 'project', lifecycle: 'active', content: 'Existing recall context.' }],
            total: 1,
            limit: 5,
          },
          behaviorRules: [{ statement: 'Stay concise.', priority: 10 }],
        }),
        sessionEnd: async () => ({ ok: true }),
        debugRepo: { log: (..._args: unknown[]) => undefined },
      },
      sessionScopes: new Map<string, { scope: { userId?: string; chatId?: string; project?: string } }>(),
    };

    registerHooks(context as never, {
      agent: fixture.agent,
      overlayGenerator: fixture.overlayGenerator,
      attentionService: fixture.attentionService,
    });

    await runHook(
      hooks,
      'session_start',
      { sessionId: 'session-butler-hook', sessionKey: 'chat:butler:hook' },
      { sessionId: 'session-butler-hook', sessionKey: 'chat:butler:hook' },
    );

    const result = await runHook(
      hooks,
      'before_agent_start',
      { prompt: 'Please continue the Butler Step 6 integration.' },
      { sessionId: 'session-butler-hook', runId: 'run-butler-hook', repoName: 'evermemory' },
    );

    const prependContext = (result as { prependContext?: string } | undefined)?.prependContext ?? '';
    assert.match(prependContext, /<evermemory-context>/);
    assert.match(prependContext, /<evermemory-butler>/);
    assert.match(prependContext, /Ship Butler Step 6/);
    assert.equal(
      buildInjectedContext(
        [{ type: 'project', lifecycle: 'active', content: 'Existing recall context.' }],
        [{ statement: 'Stay concise.', priority: 10 }],
      ).prependContext !== undefined,
      true,
    );
  } finally {
    fixture.cleanup();
  }
});
