import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import { createTempDbPath } from './helpers.js';

test('sessionStart builds briefing and stores runtime context', () => {
  const databasePath = createTempDbPath('session-start');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({
    content: '叫我 Alex',
    scope: { userId: 'user-1' },
  });

  const result = app.sessionStart({
    sessionId: 'session-1',
    userId: 'user-1',
    chatId: 'chat-1',
  });

  assert.equal(result.sessionId, 'session-1');
  assert.ok(Array.isArray(result.briefing.sections.identity));

  const runtime = app.getRuntimeSessionContext('session-1');
  assert.ok(runtime);
  assert.equal(runtime?.sessionId, 'session-1');
  assert.ok(runtime?.bootBriefing);
  const bootEvent = app.debugRepo.listRecent('boot_generated', 1)[0];
  assert.ok(bootEvent);
  assert.equal(typeof (bootEvent.payload.sectionCounts as Record<string, number>).identity, 'number');

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('sessionStart composes project continuity summary from project memories', () => {
  const databasePath = createTempDbPath('session-start-project-summary');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({
    content: '项目状态更新：Phase A 已完成，正在推进 Batch A。',
    type: 'project',
    lifecycle: 'episodic',
    scope: { userId: 'user-ps-1', project: 'evermemory' },
  });
  app.evermemoryStore({
    content: '关键约束：优先保护关键路径，禁止无关 scope 漂移。',
    type: 'constraint',
    lifecycle: 'semantic',
    scope: { userId: 'user-ps-1', project: 'evermemory' },
  });
  app.evermemoryStore({
    content: '最近决策：先完成 Batch A 的自动沉淀链路。',
    type: 'decision',
    lifecycle: 'semantic',
    scope: { userId: 'user-ps-1', project: 'evermemory' },
  });
  app.evermemoryStore({
    content: '下一步：补齐 session_end 与 briefing 的最小测试。',
    type: 'commitment',
    lifecycle: 'semantic',
    scope: { userId: 'user-ps-1', project: 'evermemory' },
  });

  const result = app.sessionStart({
    sessionId: 'session-ps-1',
    userId: 'user-ps-1',
    project: 'evermemory',
  });

  assert.ok(result.briefing.sections.activeProjects.length >= 1);
  const summary = result.briefing.sections.activeProjects[0];
  assert.ok(summary.includes('项目连续性摘要'));
  assert.ok(summary.includes('状态：'));
  assert.ok(summary.includes('关键约束：'));
  assert.ok(summary.includes('最近决策：'));
  assert.ok(summary.includes('下一步：'));

  const bootEvent = app.debugRepo.listRecent('boot_generated', 1)[0];
  assert.ok(bootEvent);
  assert.ok((bootEvent.payload.projectSummaryCount as number) >= 1);
  assert.ok((bootEvent.payload.sectionCounts as Record<string, number>).activeProjects >= 1);
  const optimization = bootEvent.payload.briefingOptimization as Record<string, number>;
  assert.equal(typeof optimization.duplicateBlocksRemoved, 'number');
  assert.equal(typeof optimization.tokenPrunedBlocks, 'number');
  assert.ok((optimization.highValueBlocksKept ?? 0) >= 1);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('sessionStart briefing optimization removes duplicate cross-section blocks and keeps high-value sections', () => {
  const databasePath = createTempDbPath('session-start-briefing-opt');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({
    content: '项目连续性摘要（evermemory）：状态：Batch B 处理中；关键约束：保持 deterministic；最近决策：优先 recall 路由；下一步：补测试。',
    type: 'summary',
    lifecycle: 'semantic',
    scope: { userId: 'user-opt-1', project: 'evermemory' },
    tags: ['active_project_summary', 'project_continuity'],
    source: { kind: 'runtime_project', actor: 'system' },
  });
  app.evermemoryStore({
    content: '最近决策：优先 recall 路由。',
    type: 'decision',
    lifecycle: 'semantic',
    scope: { userId: 'user-opt-1', project: 'evermemory' },
    source: { kind: 'runtime_project', actor: 'system' },
  });

  const result = app.sessionStart({
    sessionId: 'session-opt-1',
    userId: 'user-opt-1',
    project: 'evermemory',
  });
  assert.ok(result.briefing.sections.activeProjects.length >= 1);

  const bootEvent = app.debugRepo.listRecent('boot_generated', 1)[0];
  assert.ok(bootEvent);
  const optimization = bootEvent.payload.briefingOptimization as Record<string, number>;
  assert.ok((optimization.duplicateBlocksRemoved ?? 0) >= 1);
  assert.ok((optimization.highValueBlocksKept ?? 0) >= 1);
  assert.ok((optimization.actualApproxTokens ?? 0) <= (optimization.tokenTarget ?? 0));

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});
