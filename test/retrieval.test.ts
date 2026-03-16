import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { initializeEverMemory } from '../src/index.js';
import type { EverMemoryRecallToolInput, IntentRecord, MemoryItem } from '../src/types.js';
import { createTempDbPath } from './helpers.js';

function createMemory(input: {
  content: string;
  scope: MemoryItem['scope'];
  updatedAt: string;
  tags?: string[];
  type?: MemoryItem['type'];
  lifecycle?: MemoryItem['lifecycle'];
  importance?: number;
  confidence?: number;
  explicitness?: number;
}): MemoryItem {
  return {
    id: randomUUID(),
    content: input.content,
    type: input.type ?? 'fact',
    lifecycle: input.lifecycle ?? 'semantic',
    source: {
      kind: 'manual',
      actor: 'system',
    },
    scope: input.scope,
    scores: {
      confidence: input.confidence ?? 0.8,
      importance: input.importance ?? 0.7,
      explicitness: input.explicitness ?? 0.9,
    },
    timestamps: {
      createdAt: input.updatedAt,
      updatedAt: input.updatedAt,
    },
    state: {
      active: true,
      archived: false,
    },
    evidence: {
      references: [],
    },
    tags: input.tags ?? [],
    relatedEntities: [],
    stats: {
      accessCount: 0,
      retrievalCount: 0,
    },
  };
}

test('retrieval respects scope and returns empty results without throwing', async () => {
  const databasePath = createTempDbPath('retrieval');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({ content: '我偏好中文输出。', scope: { userId: 'u1' } });
  app.evermemoryStore({ content: '我偏好英文输出。', scope: { userId: 'u2' } });

  const scoped = await app.evermemoryRecall({ query: '中文', scope: { userId: 'u1' } });
  assert.equal(scoped.total, 1);
  assert.equal(scoped.items[0]?.scope.userId, 'u1');

  const empty = await app.evermemoryRecall({ query: '不存在的记忆', scope: { userId: 'u1' } });
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.items, []);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('retrieval increments retrievalCount and lastAccessedAt for recalled memories', async () => {
  const databasePath = createTempDbPath('retrieval-feedback');
  const app = initializeEverMemory({ databasePath });

  const stored = app.evermemoryStore({
    content: '项目决策：发布前必须先执行质量门禁。',
    type: 'decision',
    scope: { userId: 'u-retrieval-feedback', project: 'evermemory' },
  });
  assert.equal(stored.accepted, true);
  assert.ok(stored.memory?.id);

  const before = app.memoryRepo.findById(stored.memory?.id ?? '');
  assert.equal(before?.stats.retrievalCount, 0);
  assert.equal(before?.timestamps.lastAccessedAt, undefined);

  const recall = await app.evermemoryRecall({
    query: '质量门禁',
    scope: { userId: 'u-retrieval-feedback', project: 'evermemory' },
    mode: 'keyword',
    limit: 5,
  });
  assert.ok(recall.total >= 1);

  const after = app.memoryRepo.findById(stored.memory?.id ?? '');
  assert.ok((after?.stats.retrievalCount ?? 0) >= 1);
  assert.ok(Boolean(after?.timestamps.lastAccessedAt));

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('retrieval scope isolation keeps project/user/global records separated', async () => {
  const databasePath = createTempDbPath('retrieval-scope-isolation');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({
    content: '项目A：发布窗口在周五。',
    type: 'project',
    scope: { userId: 'u-scope-1', project: 'project-a' },
  });
  app.evermemoryStore({
    content: '项目B：发布窗口在周一。',
    type: 'project',
    scope: { userId: 'u-scope-1', project: 'project-b' },
  });
  app.evermemoryStore({
    content: '全局规则：高风险动作先确认。',
    type: 'constraint',
    scope: { global: true },
  });

  const projectA = await app.evermemoryRecall({
    query: '发布窗口',
    scope: { userId: 'u-scope-1', project: 'project-a' },
    mode: 'keyword',
    limit: 10,
  });
  assert.equal(projectA.total, 1);
  assert.equal(projectA.items[0]?.scope.project, 'project-a');

  const projectB = await app.evermemoryRecall({
    query: '发布窗口',
    scope: { userId: 'u-scope-1', project: 'project-b' },
    mode: 'keyword',
    limit: 10,
  });
  assert.equal(projectB.total, 1);
  assert.equal(projectB.items[0]?.scope.project, 'project-b');

  const global = await app.evermemoryRecall({
    query: '高风险动作',
    scope: { global: true },
    mode: 'keyword',
    limit: 10,
  });
  assert.equal(global.total, 1);
  assert.equal(global.items[0]?.scope.global, true);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('retrieval enforces configured maxRecall across direct recall and intent recall', async () => {
  const databasePath = createTempDbPath('retrieval-max-recall');
  const app = initializeEverMemory({
    databasePath,
    maxRecall: 2,
  });

  app.evermemoryStore({
    content: '发布计划一：先检查回滚路径。',
    scope: { userId: 'u-max-recall', project: 'evermemory' },
    type: 'project',
  });
  app.evermemoryStore({
    content: '发布计划二：更新里程碑后再执行。',
    scope: { userId: 'u-max-recall', project: 'evermemory' },
    type: 'project',
  });
  app.evermemoryStore({
    content: '发布计划三：先做质量门禁。',
    scope: { userId: 'u-max-recall', project: 'evermemory' },
    type: 'project',
  });

  const direct = await app.evermemoryRecall({
    query: '发布计划',
    scope: { userId: 'u-max-recall', project: 'evermemory' },
    mode: 'keyword',
    limit: 10,
  });
  assert.equal(direct.limit, 2);
  assert.equal(direct.total, 2);

  const deepIntent: IntentRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    sessionId: 's-max-recall',
    rawText: '结合之前发布计划继续推进下一步。',
    intent: {
      type: 'planning',
      confidence: 0.9,
    },
    signals: {
      urgency: 'medium',
      emotionalTone: 'neutral',
      actionNeed: 'analysis',
      memoryNeed: 'deep',
      preferenceRelevance: 0.2,
      correctionSignal: 0,
    },
    entities: [],
    retrievalHints: {
      preferredTypes: ['project', 'task'],
      preferredScopes: ['project', 'user'],
      preferredTimeBias: 'durable',
    },
  };

  const fromIntent = await app.retrievalService.recallForIntent({
    query: '',
    scope: { userId: 'u-max-recall', project: 'evermemory' },
    intent: deepIntent,
    limit: 12,
  });
  assert.equal(fromIntent.limit, 2);
  assert.equal(fromIntent.total, 2);

  const event = app.debugRepo.listRecent('retrieval_executed', 1)[0];
  assert.equal(event?.payload.maxRecall, 2);
  assert.equal(event?.payload.limit, 2);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('retrieval ranking prefers broader keyword coverage and stronger quality signals', async () => {
  const databasePath = createTempDbPath('retrieval-ranking');
  const app = initializeEverMemory({ databasePath });

  const now = new Date();
  const recentIso = now.toISOString();
  const oldIso = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();

  const highCoverage = createMemory({
    content: '检索 排序策略：先按关键词覆盖，再看重要性与时效。',
    scope: { userId: 'u-rank-1' },
    updatedAt: recentIso,
    tags: ['retrieval', 'ranking'],
    importance: 0.95,
    confidence: 0.95,
    explicitness: 1,
    type: 'project',
  });
  const partialCoverage = createMemory({
    content: '检索 排序策略历史记录。',
    scope: { userId: 'u-rank-1' },
    updatedAt: recentIso,
    tags: ['排序'],
    importance: 0.7,
    confidence: 0.7,
    explicitness: 0.7,
    type: 'project',
  });
  const staleCoverage = createMemory({
    content: '检索 排序策略（旧版本）。',
    scope: { userId: 'u-rank-1' },
    updatedAt: oldIso,
    tags: ['retrieval'],
    importance: 0.6,
    confidence: 0.6,
    explicitness: 0.6,
    type: 'project',
  });

  app.memoryRepo.insert(partialCoverage);
  app.memoryRepo.insert(staleCoverage);
  app.memoryRepo.insert(highCoverage);

  const result = await app.evermemoryRecall({
    query: '检索 排序',
    scope: { userId: 'u-rank-1' },
    limit: 5,
  });

  assert.equal(result.total, 3);
  assert.equal(result.items[0]?.id, highCoverage.id);
  assert.equal(result.items[2]?.id, staleCoverage.id);

  const retrievalEvents = app.debugRepo.listRecent('retrieval_executed', 5);
  assert.ok(retrievalEvents.length >= 1);
  assert.ok(Array.isArray((retrievalEvents[0]?.payload.topScores ?? null) as unknown));

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('retrieval ranking respects type priority order when request defines types', async () => {
  const databasePath = createTempDbPath('retrieval-type-priority');
  const app = initializeEverMemory({ databasePath });
  const timestamp = new Date().toISOString();

  const constraintMemory = createMemory({
    content: '执行关键动作前先确认。',
    scope: { userId: 'u-rank-2' },
    updatedAt: timestamp,
    tags: ['确认'],
    type: 'constraint',
    importance: 0.75,
    confidence: 0.8,
  });
  const projectMemory = createMemory({
    content: '项目执行关键动作前先确认。',
    scope: { userId: 'u-rank-2' },
    updatedAt: timestamp,
    tags: ['确认'],
    type: 'project',
    importance: 0.75,
    confidence: 0.8,
  });

  app.memoryRepo.insert(projectMemory);
  app.memoryRepo.insert(constraintMemory);

  const result = await app.retrievalService.recall({
    query: '确认',
    scope: { userId: 'u-rank-2' },
    types: ['constraint', 'project'],
    limit: 5,
  });

  assert.equal(result.total, 2);
  assert.equal(result.items[0]?.type, 'constraint');
  assert.equal(result.items[1]?.type, 'project');

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('retrieval keyword ranking weights are configurable via config', async () => {
  const defaultDbPath = createTempDbPath('retrieval-weight-default');
  const weightedDbPath = createTempDbPath('retrieval-weight-custom');
  const defaultApp = initializeEverMemory({ databasePath: defaultDbPath });
  const weightedApp = initializeEverMemory({
    databasePath: weightedDbPath,
    retrieval: {
      keywordWeights: {
        keyword: 0,
        recency: 0,
        importance: 0,
        confidence: 0,
        explicitness: 0,
        scopeMatch: 0,
        typePriority: 1,
        lifecyclePriority: 0,
      },
    },
  });

  const recentIso = new Date().toISOString();
  const oldIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const defaultConstraint = createMemory({
    content: '执行关键动作前先确认。',
    scope: { userId: 'u-rank-weight' },
    updatedAt: oldIso,
    type: 'constraint',
  });
  const defaultProject = createMemory({
    content: '项目执行关键动作前先确认。',
    scope: { userId: 'u-rank-weight' },
    updatedAt: recentIso,
    type: 'project',
  });

  defaultApp.memoryRepo.insert(defaultConstraint);
  defaultApp.memoryRepo.insert(defaultProject);
  weightedApp.memoryRepo.insert({
    ...defaultConstraint,
    id: randomUUID(),
  });
  weightedApp.memoryRepo.insert({
    ...defaultProject,
    id: randomUUID(),
  });

  const request: EverMemoryRecallToolInput = {
    query: '确认',
    scope: { userId: 'u-rank-weight' },
    types: ['constraint', 'project'],
    limit: 5,
  };

  const defaultResult = await defaultApp.evermemoryRecall(request);
  const weightedResult = await weightedApp.evermemoryRecall(request);

  assert.equal(defaultResult.items[0]?.type, 'project');
  assert.equal(weightedResult.items[0]?.type, 'constraint');

  defaultApp.database.connection.close();
  rmSync(defaultDbPath, { force: true });
  weightedApp.database.connection.close();
  rmSync(weightedDbPath, { force: true });
});

test('structured mode ignores keyword query and returns filter-matched memories', async () => {
  const databasePath = createTempDbPath('retrieval-structured-mode');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({
    content: '发布窗口在周五下午。',
    scope: { userId: 'u-rank-3' },
    type: 'project',
  });
  app.evermemoryStore({
    content: '部署前先确认回滚方案。',
    scope: { userId: 'u-rank-3' },
    type: 'constraint',
  });

  const keyword = await app.evermemoryRecall({
    query: '完全不存在的关键词',
    scope: { userId: 'u-rank-3' },
    mode: 'keyword',
    limit: 10,
  });
  assert.equal(keyword.total, 0);

  const structured = await app.evermemoryRecall({
    query: '完全不存在的关键词',
    scope: { userId: 'u-rank-3' },
    mode: 'structured',
    limit: 10,
  });
  assert.equal(structured.total, 2);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('hybrid mode falls back to keyword when semantic sidecar is disabled', async () => {
  const databasePath = createTempDbPath('retrieval-hybrid-fallback');
  const app = initializeEverMemory({ databasePath, semantic: { enabled: false } });

  app.evermemoryStore({
    content: '部署前先确认回滚方案。',
    scope: { userId: 'u-rank-4' },
    type: 'constraint',
  });

  const result = await app.evermemoryRecall({
    query: '确认',
    scope: { userId: 'u-rank-4' },
    mode: 'hybrid',
    limit: 5,
  });
  assert.equal(result.total, 1);

  const event = app.debugRepo.listRecent('retrieval_executed', 1)[0];
  assert.equal(event?.payload.requestedMode, 'hybrid');
  assert.equal(event?.payload.mode, 'keyword');
  assert.equal(event?.payload.fallback, true);
  assert.equal(event?.payload.semanticEnabled, false);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('hybrid mode uses semantic sidecar hits when enabled', async () => {
  const databasePath = createTempDbPath('retrieval-hybrid-enabled');
  const app = initializeEverMemory({
    databasePath,
    semantic: {
      enabled: true,
      maxCandidates: 100,
      minScore: 0.05,
    },
  });

  app.evermemoryStore({
    content: '部署前先确认回滚方案，并检查发布窗口。',
    scope: { userId: 'u-rank-5', project: 'evermemory' },
    type: 'constraint',
  });
  app.evermemoryStore({
    content: '输出保持简洁。',
    scope: { userId: 'u-rank-5', project: 'evermemory' },
    type: 'style',
  });

  const result = await app.evermemoryRecall({
    query: '回滚 发布',
    scope: { userId: 'u-rank-5', project: 'evermemory' },
    mode: 'hybrid',
    limit: 5,
  });
  assert.ok(result.total >= 1);

  const event = app.debugRepo.listRecent('retrieval_executed', 1)[0];
  assert.equal(event?.payload.requestedMode, 'hybrid');
  assert.equal(event?.payload.mode, 'hybrid');
  assert.equal(event?.payload.fallback, false);
  assert.equal(event?.payload.semanticEnabled, true);
  assert.ok(typeof event?.payload.semanticHits === 'number');
  assert.ok((event?.payload.semanticHits as number) >= 1);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('hybrid retrieval weights are normalized and emitted in debug payload', async () => {
  const databasePath = createTempDbPath('retrieval-hybrid-weights');
  const app = initializeEverMemory({
    databasePath,
    semantic: {
      enabled: true,
      maxCandidates: 100,
      minScore: 0.05,
    },
    retrieval: {
      hybridWeights: {
        keyword: 0,
        semantic: 2,
        base: 0,
      },
    },
  });

  app.evermemoryStore({
    content: '部署前先确认回滚方案。',
    scope: { userId: 'u-rank-hybrid-weights', project: 'evermemory' },
    type: 'constraint',
  });

  const result = await app.evermemoryRecall({
    query: '部署 回滚',
    scope: { userId: 'u-rank-hybrid-weights', project: 'evermemory' },
    mode: 'hybrid',
    limit: 5,
  });
  assert.ok(result.total >= 1);

  const event = app.debugRepo.listRecent('retrieval_executed', 1)[0];
  assert.equal(event?.payload.mode, 'hybrid');
  const weights = (event?.payload as { weights?: { hybrid?: { keyword?: number; semantic?: number; base?: number } } }).weights;
  assert.equal(weights?.hybrid?.keyword, 0);
  assert.equal(weights?.hybrid?.semantic, 1);
  assert.equal(weights?.hybrid?.base, 0);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('recallForIntent deep mode derives non-empty focused query', async () => {
  const databasePath = createTempDbPath('retrieval-deep-query');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({
    content: '项目里程碑计划：Phase 2 完成后进入 Phase 3，优先风险控制与质量门禁。',
    scope: { userId: 'u-rank-6', project: 'evermemory' },
    type: 'project',
  });

  const deepIntent: IntentRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    sessionId: 's-deep-query',
    rawText: '结合之前的项目计划与里程碑安排，继续推进下一步，并保持风险控制与质量门禁。',
    intent: {
      type: 'planning',
      confidence: 0.9,
    },
    signals: {
      urgency: 'medium',
      emotionalTone: 'neutral',
      actionNeed: 'analysis',
      memoryNeed: 'deep',
      preferenceRelevance: 0.2,
      correctionSignal: 0,
    },
    entities: [],
    retrievalHints: {
      preferredTypes: ['project', 'task'],
      preferredScopes: ['project', 'user'],
      preferredTimeBias: 'durable',
    },
  };

  const result = await app.retrievalService.recallForIntent({
    query: '',
    scope: { userId: 'u-rank-6', project: 'evermemory' },
    intent: deepIntent,
    limit: 8,
  });
  assert.ok(result.total >= 1);

  const event = app.debugRepo.listRecent('retrieval_executed', 1)[0];
  assert.equal(typeof event?.payload.query, 'string');
  assert.ok((event?.payload.query as string).trim().length > 0);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('recallForIntent deep mode ignores timestamp prefix numeric noise and keeps semantic token', async () => {
  const databasePath = createTempDbPath('retrieval-deep-query-timestamp');
  const app = initializeEverMemory({ databasePath });
  const tag = 'RDLPROG-TST-20260313';

  app.evermemoryStore({
    content: `项目状态：${tag} 已完成记忆保存修复，下一步是记忆衰减策略。`,
    scope: { userId: 'u-rank-7', project: 'evermemory' },
    type: 'project',
  });

  const deepIntent: IntentRecord = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    sessionId: 's-deep-query-timestamp',
    rawText: `[Fri 2026-03-13 10:54 GMT+8] ${tag} 的当前进展和下一步是什么？`,
    intent: {
      type: 'status_update',
      confidence: 0.9,
    },
    signals: {
      urgency: 'medium',
      emotionalTone: 'neutral',
      actionNeed: 'analysis',
      memoryNeed: 'deep',
      preferenceRelevance: 0.1,
      correctionSignal: 0,
    },
    entities: [],
    retrievalHints: {
      preferredTypes: ['project', 'summary'],
      preferredScopes: ['project', 'user'],
      preferredTimeBias: 'recent',
    },
  };

  const result = await app.retrievalService.recallForIntent({
    query: '',
    scope: { userId: 'u-rank-7', project: 'evermemory' },
    intent: deepIntent,
    limit: 8,
  });
  assert.ok(result.total >= 1);

  const event = app.debugRepo.listRecent('retrieval_executed', 1)[0];
  assert.notEqual((event?.payload.query as string), '2026');
  assert.ok((event?.payload.query as string).includes('rdlprog') || (event?.payload.query as string).includes('RDLPROG'));

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('project-oriented recall routes project progress/current stage/next step/last decision queries with debug evidence', async () => {
  const databasePath = createTempDbPath('retrieval-project-routes');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({
    content: '项目连续性摘要（evermemory）：状态：Batch B 开发中；关键约束：只做 Batch B 范围；最近决策：先做项目召回路由；下一步：补齐测试。',
    type: 'summary',
    scope: { userId: 'u-route-1', project: 'evermemory' },
    tags: ['active_project_summary', 'project_continuity'],
    source: { kind: 'runtime_project', actor: 'system' },
  });
  app.evermemoryStore({
    content: '项目状态更新：项目(evermemory)；输入: 继续推进；执行: 完成路由规则；结果: recall 命中稳定。',
    type: 'project',
    scope: { userId: 'u-route-1', project: 'evermemory' },
    tags: ['project_state'],
    source: { kind: 'runtime_project', actor: 'system' },
  });
  app.evermemoryStore({
    content: '最近决策：优先项目总结/项目状态/决策三类记忆。',
    type: 'decision',
    scope: { userId: 'u-route-1', project: 'evermemory' },
    source: { kind: 'runtime_project', actor: 'system' },
  });
  app.evermemoryStore({
    content: '下一步：补充 recall 路由与过滤测试。',
    type: 'commitment',
    scope: { userId: 'u-route-1', project: 'evermemory' },
    tags: ['next_step'],
    source: { kind: 'runtime_project', actor: 'system' },
  });

  const progress = await app.messageReceived({
    sessionId: 'session-route-1',
    messageId: 'msg-route-progress',
    text: '项目进展到哪里了？',
    scope: { userId: 'u-route-1', project: 'evermemory' },
  });
  assert.ok(progress.recall.total >= 1);

  const stage = await app.messageReceived({
    sessionId: 'session-route-1',
    messageId: 'msg-route-stage',
    text: '当前阶段是什么？',
    scope: { userId: 'u-route-1', project: 'evermemory' },
  });
  assert.ok(stage.recall.total >= 1);

  const nextStep = await app.messageReceived({
    sessionId: 'session-route-1',
    messageId: 'msg-route-next',
    text: '下一步做什么？',
    scope: { userId: 'u-route-1', project: 'evermemory' },
  });
  assert.ok(nextStep.recall.total >= 1);

  const decision = await app.messageReceived({
    sessionId: 'session-route-1',
    messageId: 'msg-route-decision',
    text: '上次最后决策是什么？',
    scope: { userId: 'u-route-1', project: 'evermemory' },
  });
  assert.ok(decision.recall.total >= 1);
  assert.ok(decision.recall.items.some((item) => item.type === 'decision' || item.type === 'summary'));
  const events = app.debugRepo.listRecent('retrieval_executed', 20);
  const routedKinds = new Set(events.map((event) => String(event.payload.routeKind)));
  assert.ok(routedKinds.has('project_progress'));
  assert.ok(routedKinds.has('current_stage'));
  assert.ok(routedKinds.has('next_step'));
  assert.ok(routedKinds.has('last_decision'));
  assert.ok(events.some((event) => event.payload.projectOriented === true));

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('project route does not trigger on generic next-step question without project context', async () => {
  const databasePath = createTempDbPath('retrieval-route-gating');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({
    content: '下一步做什么：先确认输入，再执行动作。',
    type: 'commitment',
    scope: { userId: 'u-route-gating-1' },
    source: { kind: 'manual', actor: 'system' },
  });

  const result = await app.evermemoryRecall({
    query: '下一步做什么？',
    scope: { userId: 'u-route-gating-1' },
    mode: 'keyword',
    limit: 3,
  });
  assert.equal(result.total, 1);

  const event = app.debugRepo.listRecent('retrieval_executed', 1)[0];
  assert.equal(event?.payload.routeKind, 'none');
  assert.equal(event?.payload.routeApplied, false);
  assert.equal(event?.payload.routeReason, 'pattern_without_project_context');

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('project-oriented recall suppresses test samples when runtime memories are sufficient', async () => {
  const databasePath = createTempDbPath('retrieval-test-pollution');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({
    content: '项目进展摘要（evermemory）：状态：Batch B 进行中；关键约束：保护关键路径；最近决策：先路由后优化；下一步：补证据测试。',
    type: 'summary',
    scope: { userId: 'u-pollution-1', project: 'evermemory' },
    tags: ['active_project_summary', 'project_continuity'],
    source: { kind: 'runtime_project', actor: 'system' },
  });
  app.evermemoryStore({
    content: '最近决策：先完成项目进展召回路由，再做其他优化。',
    type: 'decision',
    scope: { userId: 'u-pollution-1', project: 'evermemory' },
    source: { kind: 'runtime_project', actor: 'system' },
  });
  app.evermemoryStore({
    content: 'openclaw-smoke E2E-7788 sample: 项目进展测试样本。',
    type: 'project',
    scope: { userId: 'u-pollution-1', project: 'evermemory' },
    source: { kind: 'test', actor: 'system' },
    tags: ['e2e', 'smoke', 'test_sample'],
  });
  app.evermemoryStore({
    content: 'shared-scope test sample: 项目进展当前阶段样本。',
    type: 'summary',
    scope: { userId: 'u-pollution-1', project: 'evermemory' },
    source: { kind: 'test', actor: 'system' },
    tags: ['smoke'],
  });

  const result = await app.evermemoryRecall({
    query: '项目进展',
    scope: { userId: 'u-pollution-1', project: 'evermemory' },
    mode: 'keyword',
    limit: 2,
  });
  assert.equal(result.total, 2);
  assert.ok(result.items.every((item) => item.source.kind !== 'test'));

  const event = app.debugRepo.listRecent('retrieval_executed', 1)[0];
  assert.equal(event?.payload.routeKind, 'project_progress');
  assert.equal(event?.payload.projectOriented, true);
  const candidatePolicy = event?.payload.candidatePolicy as {
    suppressedTestCandidates?: number;
    retainedTestCandidates?: number;
  };
  assert.ok((candidatePolicy?.suppressedTestCandidates ?? 0) >= 1);
  assert.equal(candidatePolicy?.retainedTestCandidates ?? 0, 0);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('project-oriented recall suppresses low-value runtime noise and records policy evidence', async () => {
  const databasePath = createTempDbPath('retrieval-low-value-noise');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({
    content: '项目进展摘要（evermemory）：状态：Batch 2 recall hardening；关键约束：只做 Batch 2；最近决策：先稳定路由；下一步：补真实连续性测试。',
    type: 'summary',
    scope: { userId: 'u-low-noise-1', project: 'evermemory' },
    tags: ['active_project_summary', 'project_continuity'],
    source: { kind: 'runtime_project', actor: 'system' },
  });
  app.evermemoryStore({
    content: '项目操作提示：openclaw system event should be called after delivery.',
    type: 'project',
    scope: { userId: 'u-low-noise-1', project: 'evermemory' },
    tags: ['noise_sample'],
    source: { kind: 'runtime_project', actor: 'system' },
  });
  app.evermemoryStore({
    content: '项目模板提示：call evermemory_recall before writing the final answer.',
    type: 'project',
    scope: { userId: 'u-low-noise-1', project: 'evermemory' },
    tags: ['noise_sample_2'],
    source: { kind: 'runtime_project', actor: 'system' },
  });
  app.evermemoryStore({
    content: '最近决策：优先保留项目连续性摘要并返回可执行下一步。',
    type: 'decision',
    scope: { userId: 'u-low-noise-1', project: 'evermemory' },
    source: { kind: 'runtime_project', actor: 'system' },
  });

  const result = await app.evermemoryRecall({
    query: '项目进展',
    scope: { userId: 'u-low-noise-1', project: 'evermemory' },
    mode: 'keyword',
    limit: 2,
  });
  assert.equal(result.total, 1);
  assert.ok(result.items.some((item) => item.type === 'summary'));
  assert.ok(result.items.every((item) => !item.content.includes('openclaw system event')));
  assert.ok(result.items.every((item) => !item.content.includes('call evermemory_recall')));

  const event = app.debugRepo.listRecent('retrieval_executed', 1)[0];
  const candidatePolicy = event?.payload.candidatePolicy as {
    suppressedLowValueCandidates?: number;
    retainedLowValueCandidates?: number;
    filterMode?: string;
  };
  assert.ok((candidatePolicy?.suppressedLowValueCandidates ?? 0) >= 1);
  assert.equal(candidatePolicy?.retainedLowValueCandidates ?? 0, 0);
  assert.equal(candidatePolicy?.filterMode, 'project_strict');

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('project-oriented ranking boosts summary/project/decision over non-project constraint blocks', async () => {
  const databasePath = createTempDbPath('retrieval-project-priority');
  const app = initializeEverMemory({ databasePath });
  const now = new Date().toISOString();

  const highConstraint = createMemory({
    content: '项目进展提示：执行前先确认。',
    scope: { userId: 'u-priority-1', project: 'evermemory' },
    updatedAt: now,
    type: 'constraint',
    importance: 1,
    confidence: 1,
    explicitness: 1,
  });
  const projectSummary = createMemory({
    content: '项目进展连续性摘要（evermemory）：状态：Batch B 完成中；关键约束：范围收敛；最近决策：优先项目召回；下一步：跑完整验证。',
    scope: { userId: 'u-priority-1', project: 'evermemory' },
    updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    type: 'summary',
    tags: ['active_project_summary', 'project_continuity'],
    importance: 0.7,
    confidence: 0.7,
    explicitness: 0.7,
  });
  const projectState = createMemory({
    content: '项目状态更新：项目(evermemory) 当前项目进展为 Batch B recall 路由。',
    scope: { userId: 'u-priority-1', project: 'evermemory' },
    updatedAt: now,
    type: 'project',
    tags: ['project_state'],
    importance: 0.7,
    confidence: 0.7,
    explicitness: 0.7,
  });
  const decision = createMemory({
    content: '最近决策：项目进展召回优先返回 summary/project/decision。',
    scope: { userId: 'u-priority-1', project: 'evermemory' },
    updatedAt: now,
    type: 'decision',
    importance: 0.7,
    confidence: 0.7,
    explicitness: 0.7,
  });

  app.memoryRepo.insert(highConstraint);
  app.memoryRepo.insert(projectSummary);
  app.memoryRepo.insert(projectState);
  app.memoryRepo.insert(decision);

  const result = await app.evermemoryRecall({
    query: '项目进展',
    scope: { userId: 'u-priority-1', project: 'evermemory' },
    mode: 'keyword',
    limit: 3,
  });

  assert.equal(result.total, 3);
  const returnedTypes = new Set(result.items.map((item) => item.type));
  assert.ok(returnedTypes.has('summary'));
  assert.ok(returnedTypes.has('project'));
  assert.ok(returnedTypes.has('decision'));

  const event = app.debugRepo.listRecent('retrieval_executed', 1)[0];
  const optimization = event?.payload.recallOptimization as {
    highValueItemsSelected?: number;
    duplicateItemsRemoved?: number;
    routeAnchorItemsSelected?: number;
    selectedTypeCounts?: Record<string, number>;
  };
  assert.ok((optimization?.highValueItemsSelected ?? 0) >= 1);
  assert.equal(optimization?.routeAnchorItemsSelected, 3);
  assert.ok((optimization?.selectedTypeCounts?.summary ?? 0) >= 1);
  assert.ok((optimization?.selectedTypeCounts?.project ?? 0) >= 1);
  assert.ok((optimization?.selectedTypeCounts?.decision ?? 0) >= 1);
  assert.equal(typeof optimization?.duplicateItemsRemoved, 'number');

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});
