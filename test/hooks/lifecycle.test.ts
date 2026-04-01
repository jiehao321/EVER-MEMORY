import test from 'node:test';
import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import { BehaviorService } from '../../src/core/behavior/service.js';
import { IntentService } from '../../src/core/intent/service.js';
import { MemoryHousekeepingService } from '../../src/core/memory/housekeeping.js';
import { MemoryLifecycleService } from '../../src/core/memory/lifecycle.js';
import { MemoryService } from '../../src/core/memory/service.js';
import { ProfileProjectionService } from '../../src/core/profile/projection.js';
import { ExperienceService } from '../../src/core/reflection/experience.js';
import { ReflectionService } from '../../src/core/reflection/service.js';
import { handleMessageReceived } from '../../src/hooks/messageReceived.js';
import { handleSessionEnd } from '../../src/hooks/sessionEnd.js';
import { RetrievalService } from '../../src/retrieval/service.js';
import { clearSessionContext, getInteractionContext } from '../../src/runtime/context.js';
import { BehaviorRepository } from '../../src/storage/behaviorRepo.js';
import { DebugRepository } from '../../src/storage/debugRepo.js';
import { ExperienceRepository } from '../../src/storage/experienceRepo.js';
import { IntentRepository } from '../../src/storage/intentRepo.js';
import { MemoryRepository } from '../../src/storage/memoryRepo.js';
import { ProfileRepository } from '../../src/storage/profileRepo.js';
import { ReflectionRepository } from '../../src/storage/reflectionRepo.js';
import type { MessageReceivedContext } from '../../src/hooks/messageReceived.js';
import type { SessionEndContext } from '../../src/hooks/sessionEnd.js';
import { buildMemory, createInMemoryDb } from '../storage/helpers.js';

function createSessionEndContext(db: Database.Database) {
  const debugRepo = new DebugRepository(db);
  const memoryRepo = new MemoryRepository(db);
  const behaviorRepo = new BehaviorRepository(db);
  const profileRepo = new ProfileRepository(db);
  const experienceRepo = new ExperienceRepository(db);
  const reflectionRepo = new ReflectionRepository(db);
  const intentRepo = new IntentRepository(db);
  const lifecycleService = new MemoryLifecycleService(memoryRepo, debugRepo);
  const profileProjection = new ProfileProjectionService(memoryRepo, behaviorRepo, profileRepo, debugRepo);
  const memoryService = new MemoryService(memoryRepo, debugRepo, {
    semanticEnabled: false,
    profileProjectionService: profileProjection,
  });
  const experienceService = new ExperienceService(experienceRepo, debugRepo);
  const reflectionService = new ReflectionService(experienceRepo, reflectionRepo, debugRepo);
  const behaviorService = new BehaviorService(behaviorRepo, reflectionRepo, debugRepo);
  const housekeepingService = new MemoryHousekeepingService(
    memoryRepo,
    lifecycleService,
    undefined,
    debugRepo,
    { connection: db } as never,
  );
  const intentService = new IntentService(intentRepo, debugRepo, { useLLM: false });
  const retrievalService = new RetrievalService(memoryRepo, debugRepo, { semanticEnabled: false });

  const sessionEndContext: SessionEndContext = {
    experienceService,
    reflectionService,
    behaviorService,
    memoryService,
    debugRepo,
    memoryRepo,
    profileProjection,
    housekeepingService,
    profileRepo,
  };

  const messageReceivedContext: MessageReceivedContext = {
    intentService,
    behaviorService,
    retrievalService,
    debugRepo,
    memoryRepo,
  };

  return {
    debugRepo,
    memoryRepo,
    behaviorRepo,
    profileRepo,
    experienceRepo,
    reflectionRepo,
    intentRepo,
    lifecycleService,
    profileProjection,
    memoryService,
    experienceService,
    reflectionService,
    behaviorService,
    housekeepingService,
    intentService,
    retrievalService,
    sessionEndContext,
    messageReceivedContext,
  };
}

async function seedInteraction(
  sessionId: string,
  messageId: string,
  text: string,
  ctx: MessageReceivedContext,
  scope = { userId: 'u-hooks', project: 'evermemory' },
): Promise<void> {
  await handleMessageReceived(
    {
      sessionId,
      messageId,
      text,
      scope,
      recallLimit: 5,
    },
    ctx,
  );
}

test('hook lifecycle: sessionEnd basic flow returns experience without crashing', async () => {
  const db = createInMemoryDb();
  const harness = createSessionEndContext(db);
  const sessionId = 'hooks-session-end-basic';
  const scope = { userId: 'u-hooks-basic', project: 'evermemory' };

  try {
    harness.memoryService.store({
      content: '项目 EverMemory 当前阶段：hook 生命周期联调。',
      scope,
      type: 'project',
      source: { kind: 'message', actor: 'user', sessionId, messageId: 'seed-1' },
    });

    await seedInteraction(
      sessionId,
      'msg-basic-0',
      '继续推进 EverMemory 的 hook 生命周期测试。',
      harness.messageReceivedContext,
      scope,
    );

    const result = await handleSessionEnd(
      {
        sessionId,
        messageId: 'msg-basic-1',
        scope,
        inputText: '继续推进 hook 生命周期集成测试。',
        actionSummary: '完成 sessionEnd 集成路径检查。',
        outcomeSummary: '未发生异常。',
      },
      harness.sessionEndContext,
    );

    assert.equal(result.sessionId, sessionId);
    assert.ok(result.experience.id.length > 0);
    assert.equal(harness.experienceRepo.count(sessionId), 1);
    assert.ok(harness.debugRepo.listRecent('session_end_processed', 5).some((event) => event.entityId === sessionId));
  } finally {
    clearSessionContext(sessionId);
    db.close();
  }
});

test('hook lifecycle: sessionEnd auto-capture includes generated results when context is rich enough', async () => {
  const db = createInMemoryDb();
  const harness = createSessionEndContext(db);
  const sessionId = 'hooks-session-end-autocapture';
  const scope = { userId: 'u-hooks-autocapture', project: 'apollo' };

  try {
    await seedInteraction(
      sessionId,
      'msg-autocapture-0',
      '项目 Apollo 正在补 hook 生命周期集成测试，需要记录当前阶段与下一步。',
      harness.messageReceivedContext,
      scope,
    );

    const result = await handleSessionEnd(
      {
        sessionId,
        messageId: 'msg-autocapture-1',
        scope,
        inputText: '项目 Apollo 当前阶段是 hook 生命周期集成测试。',
        actionSummary: '最近决策：先覆盖 sessionEnd 和 messageReceived，再跑定向验证。',
        outcomeSummary: '下一步：运行 build、build:test，并执行 targeted lifecycle test。',
      },
      harness.sessionEndContext,
    );

    assert.ok((result.autoMemory?.generated ?? 0) >= 1);
    assert.ok((result.autoMemory?.accepted ?? 0) >= 1);
    assert.ok((result.autoMemory?.generatedByKind?.project_summary ?? 0) >= 1);
    const memories = harness.memoryRepo.search({
      scope,
      archived: false,
      activeOnly: true,
      limit: 20,
    });
    assert.ok(memories.some((memory) => memory.type === 'summary' && memory.tags.includes('active_project_summary')));
    assert.ok(memories.some((memory) => memory.type === 'decision' || memory.type === 'project'));
  } finally {
    clearSessionContext(sessionId);
    db.close();
  }
});

test('hook lifecycle: sessionEnd stays resilient when autoPromoteRules throws', async () => {
  const db = createInMemoryDb();
  const harness = createSessionEndContext(db);
  const sessionId = 'hooks-session-end-resilience';
  const scope = { userId: 'u-hooks-resilience', project: 'evermemory' };
  const originalListPendingReflections = harness.behaviorService.listPendingReflections.bind(harness.behaviorService);

  try {
    harness.behaviorService.listPendingReflections = (() => {
      throw new Error('auto promotion exploded');
    }) as typeof harness.behaviorService.listPendingReflections;

    await seedInteraction(
      sessionId,
      'msg-resilience-0',
      '请继续处理高风险动作前确认的规则。',
      harness.messageReceivedContext,
      scope,
    );

    const result = await handleSessionEnd(
      {
        sessionId,
        messageId: 'msg-resilience-1',
        scope,
        inputText: '更正一下，高风险动作必须先确认再执行。',
        actionSummary: '直接尝试执行了高风险动作。',
        outcomeSummary: '用户要求先确认再继续。',
      },
      harness.sessionEndContext,
    );

    assert.ok(result.experience.id.length > 0);
    assert.ok(result.reflection);
    assert.equal(result.autoPromotedRules, 0);
    const event = harness.debugRepo.listRecent('session_end_processed', 10)
      .find((item) => item.entityId === sessionId && item.payload.autoPromotionFailed === true);
    assert.ok(event);
    assert.match(String(event?.payload.error), /auto promotion exploded/);
  } finally {
    harness.behaviorService.listPendingReflections = originalListPendingReflections;
    clearSessionContext(sessionId);
    db.close();
  }
});

test('hook lifecycle: sessionEnd triggers housekeeping when scoped memory count exceeds threshold', async () => {
  const db = createInMemoryDb();
  const harness = createSessionEndContext(db);
  const sessionId = 'hooks-session-end-housekeeping';
  const scope = { userId: 'u-hooks-housekeeping', project: 'evermemory' };
  const oldUpdatedAt = '2026-01-01T00:00:00.000Z';
  const housekeepingCalls: Array<{ scope: typeof scope; lastRunAt?: string }> = [];

  try {
    for (let index = 0; index < 51; index += 1) {
      harness.memoryRepo.insert(buildMemory({
        id: `housekeeping-memory-${index}`,
        content: `Housekeeping memory ${index}`,
        scope,
        timestamps: {
          createdAt: oldUpdatedAt,
          updatedAt: oldUpdatedAt,
        },
      }));
    }

    harness.sessionEndContext.housekeepingService = {
      runIfNeeded: async (
        incomingScope: typeof scope,
        lastRunAt?: string,
      ) => {
        housekeepingCalls.push({ scope: incomingScope as typeof scope, lastRunAt });
        return null;
      },
    } as never;

    const result = await handleSessionEnd(
      {
        sessionId,
        messageId: 'msg-housekeeping-1',
        scope,
        inputText: '结束本轮 housekeeping 触发测试。',
        actionSummary: '只验证 hook 是否会触发 housekeeping。',
      },
      harness.sessionEndContext,
    );

    assert.equal(result.sessionId, sessionId);
    assert.equal(housekeepingCalls.length, 1);
    assert.deepEqual(housekeepingCalls[0]?.scope, scope);
    assert.equal(typeof housekeepingCalls[0]?.lastRunAt, 'string');
  } finally {
    clearSessionContext(sessionId);
    db.close();
  }
});

test('hook lifecycle: sessionEnd logs debug telemetry when a slow housekeeping operation times out', async () => {
  const db = createInMemoryDb();
  const harness = createSessionEndContext(db);
  const sessionId = 'hooks-session-end-timeout';
  const scope = { userId: 'u-hooks-timeout', project: 'evermemory' };
  const originalSetTimeout = global.setTimeout;

  try {
    for (let index = 0; index < 51; index += 1) {
      harness.memoryRepo.insert(buildMemory({
        id: `timeout-memory-${index}`,
        content: `Timeout memory ${index}`,
        scope,
        timestamps: {
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      }));
    }

    harness.sessionEndContext.housekeepingService = {
      runIfNeeded: async () => new Promise(() => undefined),
    } as never;

    global.setTimeout = (((handler: TimerHandler, timeout?: number, ...args: unknown[]) => (
      originalSetTimeout(() => {
        if (typeof handler === 'function') {
          handler(...args);
        }
      }, 0)
    )) as unknown) as typeof setTimeout;

    const result = await handleSessionEnd(
      {
        sessionId,
        messageId: 'msg-timeout-1',
        scope,
        inputText: '结束本轮 timeout 测试。',
        actionSummary: '模拟一个会超时的 housekeeping 任务。',
      },
      harness.sessionEndContext,
    );

    assert.ok(result.experience.id.length > 0);
    const event = harness.debugRepo.listRecent('housekeeping_error', 5).find((item) => item.entityId === sessionId);
    assert.ok(event);
    assert.equal(event?.payload.reason, 'timeout');
    assert.match(String(event?.payload.error), /timed out/);
  } finally {
    global.setTimeout = originalSetTimeout;
    clearSessionContext(sessionId);
    db.close();
  }
});

test('hook lifecycle: messageReceived basic flow processes a message and updates interaction context', async () => {
  const db = createInMemoryDb();
  const harness = createSessionEndContext(db);
  const sessionId = 'hooks-message-received-basic';
  const scope = { userId: 'u-hooks-message', project: 'evermemory' };

  try {
    harness.memoryService.store({
      content: '项目计划：先完成 hook 生命周期测试，再补 smoke 验证。',
      scope,
      type: 'project',
      source: { kind: 'message', actor: 'user', sessionId, messageId: 'seed-message-1' },
    });
    harness.memoryService.store({
      content: '项目约束：保持真实 SQLite 集成路径。',
      scope,
      type: 'constraint',
      source: { kind: 'message', actor: 'user', sessionId, messageId: 'seed-message-2' },
    });

    const result = await handleMessageReceived(
      {
        sessionId,
        messageId: 'msg-message-1',
        text: '结合之前的项目计划，继续推进下一步。',
        scope,
        recallLimit: 5,
      },
      harness.messageReceivedContext,
    );

    assert.ok(result.intent.id.length > 0);
    assert.ok(result.recall.total >= 1);
    assert.ok(result.recall.items.some((item) => item.type === 'project' || item.type === 'constraint'));
    const interaction = getInteractionContext(sessionId);
    assert.ok(interaction);
    assert.equal(interaction?.messageId, 'msg-message-1');
    assert.equal(interaction?.recalledItems.length, result.recall.total);
  } finally {
    clearSessionContext(sessionId);
    db.close();
  }
});
