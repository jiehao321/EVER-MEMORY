import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type Database from 'better-sqlite3';
import type {
  ButlerInsight,
  ButlerPersistentState,
  ButlerTask,
  LlmInvocation,
  NarrativeThread,
} from '../../src/core/butler/types.js';
import type { ActionRecord } from '../../src/core/butler/actions/types.js';
import { ButlerActionRepository } from '../../src/storage/butlerActionRepo.js';
import { ButlerInsightRepository } from '../../src/storage/butlerInsightRepo.js';
import { ButlerQuestionRepository } from '../../src/storage/butlerQuestionRepo.js';
import { ButlerSearchRepository } from '../../src/storage/butlerSearchRepo.js';
import { ButlerStateRepository } from '../../src/storage/butlerStateRepo.js';
import { ButlerTaskRepository } from '../../src/storage/butlerTaskRepo.js';
import { LlmInvocationRepository } from '../../src/storage/llmInvocationRepo.js';
import { NarrativeRepository } from '../../src/storage/narrativeRepo.js';
import { createInMemoryDb } from './helpers.js';

function buildState(overrides: Partial<ButlerPersistentState> = {}): ButlerPersistentState {
  return {
    currentStrategyFrame: overrides.currentStrategyFrame ?? {
      currentMode: 'planning',
      likelyUserGoal: 'ship phase 1',
      topPriorities: ['finish migrations'],
      constraints: ['keep schema additive'],
      lastUpdatedAt: '2026-03-23T00:00:00.000Z',
    },
    selfModel: overrides.selfModel ?? {
      overlayAcceptanceRate: 0.9,
      insightPrecision: 0.75,
      avgCycleLatencyMs: 120,
      totalCycles: 3,
      lastEvaluatedAt: '2026-03-23T00:00:00.000Z',
    },
    workingMemory: overrides.workingMemory ?? [
      { key: 'active_task', value: 'phase-1', createdAt: '2026-03-23T00:00:00.000Z' },
    ],
    mode: overrides.mode ?? 'reduced',
    lastCycleAt: overrides.lastCycleAt ?? '2026-03-23T00:00:00.000Z',
    lastCycleVersion: overrides.lastCycleVersion ?? 1,
  };
}

function buildThread(overrides: Partial<NarrativeThread> = {}): NarrativeThread {
  return {
    id: overrides.id ?? 'thread-1',
    theme: overrides.theme ?? 'Phase 1 delivery',
    objective: overrides.objective ?? 'finish persistence work',
    currentPhase: overrides.currentPhase ?? 'converging',
    momentum: overrides.momentum ?? 'steady',
    recentEvents: overrides.recentEvents ?? ['migrations added'],
    blockers: overrides.blockers ?? [],
    likelyNextTurn: overrides.likelyNextTurn ?? 'implement repos',
    strategicImportance: overrides.strategicImportance ?? 0.8,
    scopeJson: overrides.scopeJson ?? JSON.stringify({ project: 'evermemory' }),
    startedAt: overrides.startedAt ?? '2026-03-23T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-03-23T00:00:00.000Z',
    closedAt: overrides.closedAt,
  };
}

function buildTask(overrides: Partial<ButlerTask> = {}): ButlerTask {
  return {
    id: overrides.id ?? 'task-1',
    type: overrides.type ?? 'observe',
    priority: overrides.priority ?? 3,
    status: overrides.status ?? 'queued',
    trigger: overrides.trigger,
    payloadJson: overrides.payloadJson ?? JSON.stringify({ source: 'test' }),
    budgetClass: overrides.budgetClass ?? 'low',
    scheduledAt: overrides.scheduledAt,
    leaseUntil: overrides.leaseUntil,
    attemptCount: overrides.attemptCount ?? 0,
    maxAttempts: overrides.maxAttempts ?? 3,
    idempotencyKey: overrides.idempotencyKey,
    resultJson: overrides.resultJson,
    error: overrides.error,
    createdAt: overrides.createdAt ?? '2026-03-23T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-03-23T00:00:00.000Z',
  };
}

function buildInsight(overrides: Partial<ButlerInsight> = {}): ButlerInsight {
  return {
    id: overrides.id ?? 'insight-1',
    kind: overrides.kind ?? 'continuity',
    scopeJson: overrides.scopeJson ?? JSON.stringify({ project: 'evermemory' }),
    title: overrides.title ?? 'Momentum is steady',
    summary: overrides.summary ?? 'Implementation is progressing without blockers.',
    confidence: overrides.confidence ?? 0.8,
    importance: overrides.importance ?? 0.7,
    freshUntil: overrides.freshUntil ?? '2099-01-01T00:00:00.000Z',
    sourceRefsJson: overrides.sourceRefsJson ?? JSON.stringify(['task-1']),
    modelUsed: overrides.modelUsed ?? 'test-model',
    cycleTraceId: overrides.cycleTraceId ?? 'cycle-1',
    surfacedCount: overrides.surfacedCount ?? 0,
    lastSurfacedAt: overrides.lastSurfacedAt,
    createdAt: overrides.createdAt ?? '2026-03-23T00:00:00.000Z',
  };
}

function buildInvocation(overrides: Partial<LlmInvocation> = {}): LlmInvocation {
  return {
    id: overrides.id ?? 'invocation-1',
    taskType: overrides.taskType ?? 'summarize',
    traceId: overrides.traceId ?? 'trace-1',
    provider: overrides.provider ?? 'openai',
    model: overrides.model ?? 'gpt-test',
    promptTokens: overrides.promptTokens ?? 10,
    completionTokens: overrides.completionTokens ?? 5,
    latencyMs: overrides.latencyMs ?? 100,
    cacheHit: overrides.cacheHit ?? false,
    success: overrides.success ?? true,
    createdAt: overrides.createdAt ?? '2026-03-23T00:00:00.000Z',
  };
}

function buildActionRecord(overrides: Partial<ActionRecord> = {}): ActionRecord {
  return {
    id: overrides.id ?? 'action-1',
    cycleId: overrides.cycleId ?? 'cycle-1',
    actionType: overrides.actionType ?? 'store_memory',
    paramsJson: overrides.paramsJson ?? JSON.stringify({ content: 'remember this' }),
    resultJson: overrides.resultJson,
    status: overrides.status ?? 'pending',
    rollbackJson: overrides.rollbackJson,
    budgetCostMs: overrides.budgetCostMs ?? 25,
    createdAt: overrides.createdAt ?? '2026-04-04T00:00:00.000Z',
    completedAt: overrides.completedAt,
  };
}

function toNewActionRecord(record: ActionRecord): Omit<ActionRecord, 'id'> {
  const { id: _id, ...rest } = record;
  return rest;
}

describe('Butler repositories', () => {
  let db: Database.Database | undefined;

  afterEach(() => db?.close());

  it('loads, saves, and updates the singleton butler state', () => {
    db = createInMemoryDb();
    const repo = new ButlerStateRepository(db);

    assert.equal(repo.load(), null);

    repo.save(buildState());
    repo.updateMode('reduced');

    const state = repo.load();
    assert.equal(state?.mode, 'reduced');
    assert.equal(state?.currentStrategyFrame.currentMode, 'planning');
    assert.equal(state?.workingMemory[0]?.key, 'active_task');
  });

  it('adds, leases, completes, and counts tasks', () => {
    db = createInMemoryDb();
    const repo = new ButlerTaskRepository(db);

    const id = repo.addTask({
      type: 'observe',
      priority: 2,
      payload: { note: 'first' },
      idempotencyKey: 'idem-1',
    });
    repo.addTask({
      type: 'analyze',
      priority: 7,
      scheduledAt: '2099-01-01T00:00:00.000Z',
    });

    const leased = repo.leaseTasks(5, 5);
    assert.equal(leased.length, 1);
    assert.equal(leased[0]?.id, id);
    assert.equal(leased[0]?.status, 'running');
    assert.equal(repo.getPendingCount(), 1);
    assert.equal(repo.getByIdempotencyKey('idem-1')?.id, id);

    repo.completeTask(id, { ok: true });
    assert.equal(repo.getByIdempotencyKey('idem-1')?.status, 'completed');
  });

  it('updates narrative threads and filters active rows', () => {
    db = createInMemoryDb();
    const repo = new NarrativeRepository(db);

    const { id: _ignoredId, ...newThread } = buildThread();
    const id = repo.insert({
      ...newThread,
    });
    repo.update(id, {
      currentPhase: 'stabilizing',
      blockers: ['waiting for review'],
    });

    const active = repo.findActive({ project: 'evermemory' });
    assert.equal(active.length, 1);
    assert.equal(active[0]?.currentPhase, 'stabilizing');
    assert.deepEqual(active[0]?.blockers, ['waiting for review']);

    repo.close(id);
    assert.equal(repo.findById(id)?.closedAt !== undefined, true);
    assert.equal(repo.findActive().length, 0);
  });

  it('stores insights, queries fresh rows, and tracks surfacing', () => {
    db = createInMemoryDb();
    const repo = new ButlerInsightRepository(db);

    const id = repo.insert({
      kind: 'anomaly',
      scope: { project: 'evermemory' },
      title: 'Unexpected retry spike',
      summary: 'Retries increased during lease operations.',
      sourceRefs: ['task-1'],
      freshUntil: '2099-01-01T00:00:00.000Z',
    });
    const expiredInsight = buildInsight({
      kind: 'theme',
      freshUntil: '2000-01-01T00:00:00.000Z',
    });
    repo.insert({
      kind: expiredInsight.kind,
      scope: expiredInsight.scopeJson ? JSON.parse(expiredInsight.scopeJson) as Record<string, unknown> : undefined,
      title: expiredInsight.title,
      summary: expiredInsight.summary,
      confidence: expiredInsight.confidence,
      importance: expiredInsight.importance,
      freshUntil: expiredInsight.freshUntil,
      sourceRefs: expiredInsight.sourceRefsJson ? JSON.parse(expiredInsight.sourceRefsJson) as string[] : undefined,
      modelUsed: expiredInsight.modelUsed,
      cycleTraceId: expiredInsight.cycleTraceId,
    });

    assert.equal(repo.findById(id)?.kind, 'anomaly');
    assert.equal(repo.findByKind('anomaly', 10).length, 1);
    assert.equal(repo.findFresh(10).length, 1);

    repo.markSurfaced(id);
    assert.equal(repo.findById(id)?.surfacedCount, 1);
    assert.equal(repo.deleteExpired(), 1);
  });

  it('records invocation audit rows and aggregates usage', () => {
    db = createInMemoryDb();
    const repo = new LlmInvocationRepository(db);

    const { id: _ignoredInvocationId, ...firstInvocation } = buildInvocation();
    const { id: _ignoredSecondInvocationId, ...secondInvocation } = buildInvocation({
      traceId: 'trace-1',
      promptTokens: 7,
      completionTokens: 3,
    });
    repo.insert(firstInvocation);
    repo.insert(secondInvocation);

    assert.deepEqual(repo.getSessionUsage('trace-1'), { totalTokens: 25, count: 2 });
    assert.deepEqual(repo.getDailyUsage('2026-03-23'), { totalTokens: 25, count: 2 });
  });

  it('stores butler actions, updates status, and counts rows by day', () => {
    db = createInMemoryDb();
    const repo = new ButlerActionRepository(db);

    const first = buildActionRecord();
    const second = buildActionRecord({
      cycleId: 'cycle-1',
      actionType: 'ask_user',
      paramsJson: JSON.stringify({ question: 'Need clarification?' }),
      createdAt: '2026-04-04T12:00:00.000Z',
    });
    const third = buildActionRecord({
      cycleId: 'cycle-2',
      actionType: 'search_knowledge',
      createdAt: '2026-04-05T00:00:00.000Z',
    });

    const firstId = repo.insert(toNewActionRecord(first));
    const secondId = repo.insert(toNewActionRecord(second));
    repo.insert(toNewActionRecord(third));
    repo.updateStatus(secondId, 'completed', JSON.stringify({ answer: 'yes' }), '2026-04-04T12:00:03.000Z');

    const cycleRows = repo.findByCycleId('cycle-1');

    assert.equal(firstId.length > 0, true);
    assert.equal(cycleRows.length, 2);
    assert.equal(cycleRows[0]?.status, 'pending');
    assert.equal(cycleRows[1]?.status, 'completed');
    assert.equal(cycleRows[1]?.resultJson, JSON.stringify({ answer: 'yes' }));
    assert.equal(cycleRows[1]?.completedAt, '2026-04-04T12:00:03.000Z');
    assert.equal(repo.getDailyCount('2026-04-04'), 2);
    assert.equal(repo.getDailyCount('2026-04-05'), 1);
  });

  it('stores butler questions, updates status, and counts asked rows by day', () => {
    db = createInMemoryDb();
    const repo = new ButlerQuestionRepository(db);

    repo.insert({
      id: 'question-1',
      gapType: 'stale',
      questionText: 'Is this still accurate?',
      contextJson: JSON.stringify({ reason: 'stale memory' }),
      status: 'pending',
      answerText: undefined,
      memoryIdsJson: JSON.stringify(['memory-1']),
      askedAt: '2026-04-04T09:00:00.000Z',
      answeredAt: undefined,
      createdAt: '2026-04-04T08:55:00.000Z',
    });
    repo.insert({
      id: 'question-2',
      gapType: 'incomplete',
      questionText: 'What is the status?',
      contextJson: undefined,
      status: 'pending',
      answerText: undefined,
      memoryIdsJson: undefined,
      askedAt: '2026-04-05T09:00:00.000Z',
      answeredAt: undefined,
      createdAt: '2026-04-05T08:55:00.000Z',
    });

    repo.updateStatus('question-1', 'answered', {
      answerText: 'Still valid.',
      answeredAt: '2026-04-04T09:01:00.000Z',
    });

    assert.equal(repo.findById('question-1')?.status, 'answered');
    assert.equal(repo.findById('question-1')?.answerText, 'Still valid.');
    assert.equal(repo.findById('question-1')?.answeredAt, '2026-04-04T09:01:00.000Z');
    assert.deepEqual(repo.findByStatus('pending').map((row) => row.id), ['question-2']);
    assert.equal(repo.getDailyCount('2026-04-04'), 1);
    assert.equal(repo.getDailyCount('2026-04-05'), 1);
  });

  it('stores butler searches and returns recent rows first', () => {
    db = createInMemoryDb();
    const repo = new ButlerSearchRepository(db);

    repo.insert({
      id: 'search-1',
      query: 'phase 2 plan',
      gapId: 'gap-1',
      resultsCount: 2,
      resultsJson: JSON.stringify([{ source: 'memory' }]),
      synthesizedJson: JSON.stringify({ summary: 'phase 2 active' }),
      createdAt: '2026-04-04T09:00:00.000Z',
    });
    repo.insert({
      id: 'search-2',
      query: 'open questions',
      gapId: undefined,
      resultsCount: 1,
      resultsJson: JSON.stringify([{ source: 'docs' }]),
      synthesizedJson: undefined,
      createdAt: '2026-04-04T10:00:00.000Z',
    });

    assert.equal(repo.findById('search-1')?.gapId, 'gap-1');
    assert.deepEqual(repo.findRecent(2).map((row) => row.id), ['search-2', 'search-1']);
  });
});
