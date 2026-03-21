import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import { evermemoryStatusLayered } from '../src/tools/status.js';
import { createTempDbPath } from './helpers.js';

test('recall, briefing, and status return structured outputs with improved status counts', async () => {
  const databasePath = createTempDbPath('tools');
  const app = initializeEverMemory({ databasePath, semantic: { enabled: false } });

  app.evermemoryStore({
    content: '我偏好中文输出。',
    scope: { userId: 'user-2' },
    tags: ['language'],
  });
  app.evermemoryStore({
    content: '不要过度展开。',
    scope: { userId: 'user-2' },
  });

  const recall = await app.evermemoryRecall({
    query: '中文',
    scope: { userId: 'user-2' },
  });
  assert.equal(recall.total, 1);

  const briefing = app.evermemoryBriefing({
    scope: { userId: 'user-2' },
  });
  assert.ok(Array.isArray(briefing.sections.identity));

  const status = app.evermemoryStatus({ userId: 'user-2' });
  const smartness = await app.evermemorySmartness({ userId: 'user-2' });
  assert.ok(status.schemaVersion >= 1);
  assert.equal(status.scopeResolvedFrom, 'user');
  assert.equal(status.databasePath, databasePath);
  assert.equal(status.memoryCount, 2);
  assert.equal(status.activeMemoryCount, 2);
  assert.equal(status.countsByType.preference, 1);
  assert.equal(status.countsByType.constraint, 1);
  assert.equal(status.countsByLifecycle.semantic, 2);
  assert.equal(status.activeRuleCount, 0);
  assert.equal(status.archivedMemoryCount, 0);
  assert.equal(status.semanticIndexCount, 0);
  assert.equal(status.profileCount, 1);
  assert.equal(status.latestProfile?.userId, 'user-2');
  assert.ok((status.recentDebugByKind?.memory_write_decision ?? 0) >= 1);
  assert.ok(Array.isArray(status.latestDebugEvents));
  assert.equal(status.latestWriteDecision?.accepted, true);
  assert.equal(status.latestRetrieval?.mode, 'keyword');
  assert.match(smartness, /智能度评分：/);
  assert.match(smartness, /记忆深度：/);

  const intent = app.evermemoryIntent({
    message: '请给出下一步计划',
    sessionId: 'session-tools-1',
    scope: { userId: 'user-2' },
  });
  assert.equal(intent.intent.type, 'planning');

  await app.sessionEnd({
    sessionId: 'session-tools-1',
    messageId: 'session-tools-msg-1',
    scope: { userId: 'user-2' },
    inputText: '更正一下，先确认再执行',
    actionSummary: '执行前确认',
    outcomeSummary: '用户确认通过',
    evidenceRefs: ['session-tools-msg-1'],
  });

  const reflect = app.evermemoryReflect({
    sessionId: 'session-tools-1',
    mode: 'light',
  });
  assert.ok(reflect.summary.processedExperiences >= 1);
  const rules = app.evermemoryRules({
    scope: { userId: 'user-2' },
    limit: 5,
  });
  assert.ok(Array.isArray(rules.rules));

  const statusAfter = app.evermemoryStatus({ sessionId: 'session-tools-1' });
  assert.equal(statusAfter.scopeResolvedFrom, 'global');
  assert.ok((statusAfter.experienceCount ?? 0) >= 1);
  assert.ok((statusAfter.reflectionCount ?? 0) >= 1);
  assert.equal(typeof statusAfter.activeRuleCount, 'number');
  assert.equal(statusAfter.archivedMemoryCount, 0);
  assert.equal(statusAfter.semanticIndexCount, 0);
  assert.ok((statusAfter.profileCount ?? 0) >= 1);
  assert.ok((statusAfter.recentDebugByKind?.session_end_processed ?? 0) >= 1);
  assert.ok((statusAfter.latestDebugEvents?.length ?? 0) >= 1);
  assert.ok((statusAfter.latestProfileRecompute?.memoryCount ?? 0) >= 1);
  assert.ok((statusAfter.continuityKpis?.sampleWindow.sessionEndEvents ?? 0) >= 1);
  assert.ok((statusAfter.continuityKpis?.autoMemory.generated ?? 0) >= 1);
  assert.ok((statusAfter.continuityKpis?.autoMemory.accepted ?? 0) >= 1);
  assert.equal(typeof statusAfter.continuityKpis?.retrievalPolicy.suppressedTestCandidates, 'number');
  assert.equal(typeof statusAfter.continuityKpis?.retrievalPolicy.projectRoutedExecutions, 'number');

  const globalStatus = app.evermemoryStatus();
  assert.equal(globalStatus.scopeResolvedFrom, 'global');

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('status layering returns summary, detail, and debug variants', () => {
  const databasePath = createTempDbPath('tools-status-layered');
  const app = initializeEverMemory({ databasePath, semantic: { enabled: false } });

  app.evermemoryStore({
    content: '部署前先确认。',
    scope: { userId: 'user-layered' },
    type: 'constraint',
  });

  const baseInput = {
    database: app.database,
    memoryRepo: app.memoryRepo,
    briefingRepo: app.briefingRepo,
    debugRepo: app.debugRepo,
    experienceRepo: app.experienceRepo,
    reflectionRepo: app.reflectionRepo,
    behaviorRepo: app.behaviorRepo,
    semanticRepo: app.semanticRepo,
    profileRepo: app.profileRepo,
    userId: 'user-layered',
  };

  const summary = evermemoryStatusLayered(baseInput);
  assert.equal(summary.health, 'critical');
  assert.ok(summary.alerts.length <= 3);
  assert.ok(summary.alerts.some((alert) => alert.code === 'semantic_disabled'));

  const detail = evermemoryStatusLayered({ ...baseInput, output: 'detail' });
  assert.equal(detail.memoryCount, 1);
  assert.equal(detail.summary?.health, 'critical');

  const debug = evermemoryStatusLayered({ ...baseInput, output: 'debug' });
  assert.ok(Array.isArray(debug.latestDebugEvents));
  assert.equal(typeof debug.recentDebugEvents, 'number');

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});
