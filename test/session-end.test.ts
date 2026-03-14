import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import { createTempDbPath } from './helpers.js';

test('sessionEnd writes experience and can trigger lightweight reflection', async () => {
  const databasePath = createTempDbPath('session-end');
  const app = initializeEverMemory({ databasePath });

  await app.messageReceived({
    sessionId: 'session-end-1',
    messageId: 'session-end-msg-0',
    text: '项目推进计划：先做质量门禁，再推进下一阶段。',
    scope: { userId: 'u-session-end-1', project: 'evermemory' },
  });

  const result = app.sessionEnd({
    sessionId: 'session-end-1',
    messageId: 'session-end-msg-1',
    scope: { userId: 'u-session-end-1', project: 'evermemory' },
    inputText: '更正一下，先确认再执行。',
    actionSummary: '直接执行了高风险动作',
    outcomeSummary: '用户要求先确认',
    evidenceRefs: ['session-end-msg-1'],
  });

  assert.equal(result.sessionId, 'session-end-1');
  assert.ok(result.experience.id.length > 0);
  assert.ok(result.reflection);
  assert.ok((result.promotedRules?.length ?? 0) >= 1);
  assert.equal(result.reflection?.state.promoted, true);
  assert.ok((result.autoMemory?.generated ?? 0) >= 1);
  assert.ok((result.autoMemory?.accepted ?? 0) >= 1);
  assert.ok((result.autoMemory?.generatedByKind?.project_summary ?? 0) >= 1);
  assert.ok((result.autoMemory?.acceptedByKind?.project_summary ?? 0) >= 1);

  const autoMemories = app.memoryRepo.search({
    scope: { userId: 'u-session-end-1', project: 'evermemory' },
    types: ['project', 'constraint', 'decision', 'summary', 'commitment'],
    archived: false,
    activeOnly: true,
    limit: 20,
  });
  assert.ok(autoMemories.length >= 1);
  assert.ok(autoMemories.some((item) => item.source.kind === 'runtime_project' || item.source.kind === 'reflection_derived'));
  const continuitySummary = autoMemories.find((item) => item.type === 'summary' && item.tags.includes('active_project_summary'));
  assert.ok(continuitySummary);
  assert.ok(continuitySummary?.content.includes('状态：'));
  assert.ok(continuitySummary?.content.includes('关键约束：'));
  assert.ok(continuitySummary?.content.includes('最近决策：'));
  assert.ok(continuitySummary?.content.includes('下一步：'));

  const followup = app.sessionStart({
    sessionId: 'session-end-2',
    userId: 'u-session-end-1',
    project: 'evermemory',
  });
  assert.ok(followup.briefing.sections.recentContinuity.length >= 1);
  assert.ok(followup.briefing.sections.activeProjects.some((item) => item.includes('项目连续性摘要')));
  assert.ok(followup.briefing.sections.activeProjects.some((item) => item.includes('下一步：')));

  const endEvent = app.debugRepo.listRecent('session_end_processed', 1)[0];
  assert.ok(endEvent);
  assert.ok((endEvent.payload.autoMemoryGeneratedByKind as Record<string, number>).project_summary >= 1);
  assert.ok((endEvent.payload.projectSummaryAccepted as number) >= 1);

  const reflectTool = app.evermemoryReflect({ sessionId: 'session-end-1', mode: 'light' });
  assert.ok(reflectTool.summary.processedExperiences >= 1);

  const status = app.evermemoryStatus({ userId: 'u-session-end-1', sessionId: 'session-end-1' });
  assert.ok((status.experienceCount ?? 0) >= 1);
  assert.ok((status.reflectionCount ?? 0) >= 1);
  assert.ok((status.activeRuleCount ?? 0) >= 1);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('sessionEnd auto memory extraction prefers intent raw text and skips operator policy noise', async () => {
  const databasePath = createTempDbPath('session-end-noise');
  const app = initializeEverMemory({ databasePath });

  await app.messageReceived({
    sessionId: 'session-end-noise-1',
    messageId: 'session-end-noise-msg-0',
    text: '[Fri 2026-03-13 10:44 GMT+8] 项目代号CLEANMEM-1，先修复记忆保存，再做记忆衰减。',
    scope: { userId: 'u-session-end-noise', project: 'evermemory' },
  });

  const result = app.sessionEnd({
    sessionId: 'session-end-noise-1',
    messageId: 'session-end-noise-msg-1',
    scope: { userId: 'u-session-end-noise', project: 'evermemory' },
    inputText: 'Skills store policy (operator configured): Do not claim exclusivity.',
    actionSummary: '[[reply_to_current]] 确认：项目代号CLEANMEM-1，顺序先保存后衰减。',
    outcomeSummary: 'run_success',
    evidenceRefs: ['session-end-noise-msg-1'],
  });

  assert.ok((result.autoMemory?.accepted ?? 0) >= 1);

  const autoMemories = app.memoryRepo.search({
    scope: { userId: 'u-session-end-noise', project: 'evermemory' },
    archived: false,
    activeOnly: true,
    limit: 20,
  });
  assert.ok(autoMemories.length >= 1);
  assert.ok(autoMemories.some((item) => item.content.includes('CLEANMEM-1')));
  assert.ok(autoMemories.every((item) => !item.content.includes('Skills store policy')));
  assert.ok(autoMemories.some((item) => item.type === 'summary' && item.tags.includes('active_project_summary')));

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('project continuity recall stays stable across sessions for progress/stage/next-step/decision queries', async () => {
  const databasePath = createTempDbPath('session-end-project-continuity');
  const app = initializeEverMemory({ databasePath });

  await app.messageReceived({
    sessionId: 'session-continuity-1',
    messageId: 'msg-continuity-0',
    text: '项目 Apollo 进入 Batch 2，当前阶段做 recall hardening，需要稳定项目连续性。',
    scope: { userId: 'u-continuity-1', project: 'apollo' },
  });

  const end = app.sessionEnd({
    sessionId: 'session-continuity-1',
    messageId: 'msg-continuity-1',
    scope: { userId: 'u-continuity-1', project: 'apollo' },
    inputText: '项目进展：Batch 2 已开始，当前阶段是 recall 路由与排序强化。',
    actionSummary: '最近决策：优先 summary/project/decision 协同，并压制测试样本与低价值噪声。',
    outcomeSummary: '下一步：补真实项目连续性测试，并执行 check/build/test。',
    evidenceRefs: ['msg-continuity-1'],
  });
  assert.ok((end.autoMemory?.accepted ?? 0) >= 3);

  app.sessionStart({
    sessionId: 'session-continuity-2',
    userId: 'u-continuity-1',
    project: 'apollo',
  });

  const progress = await app.messageReceived({
    sessionId: 'session-continuity-2',
    messageId: 'msg-continuity-progress',
    text: '项目进展是什么？',
    scope: { userId: 'u-continuity-1', project: 'apollo' },
  });
  assert.ok(progress.recall.total >= 1);
  assert.ok(progress.recall.total <= 4);
  assert.ok(progress.recall.items.some((item) => item.type === 'summary'));

  const stage = await app.messageReceived({
    sessionId: 'session-continuity-2',
    messageId: 'msg-continuity-stage',
    text: '当前阶段是什么？',
    scope: { userId: 'u-continuity-1', project: 'apollo' },
  });
  assert.ok(stage.recall.total >= 1);
  assert.ok(stage.recall.total <= 4);

  const nextStep = await app.messageReceived({
    sessionId: 'session-continuity-2',
    messageId: 'msg-continuity-next',
    text: '下一步是什么？',
    scope: { userId: 'u-continuity-1', project: 'apollo' },
  });
  assert.ok(nextStep.recall.total >= 1);
  assert.ok(nextStep.recall.total <= 3);
  assert.ok(nextStep.recall.items.some((item) => item.type === 'commitment' || item.type === 'decision'));

  const decision = await app.messageReceived({
    sessionId: 'session-continuity-2',
    messageId: 'msg-continuity-decision',
    text: '最近决策是什么？',
    scope: { userId: 'u-continuity-1', project: 'apollo' },
  });
  assert.ok(decision.recall.total >= 1);
  assert.ok(decision.recall.total <= 3);
  assert.ok(decision.recall.items.some((item) => item.type === 'decision'));

  const queried = [...progress.recall.items, ...stage.recall.items, ...nextStep.recall.items, ...decision.recall.items];
  assert.ok(queried.every((item) => !item.content.includes('test sample')));
  assert.ok(queried.every((item) => !item.content.includes('AGENTS.md instructions')));

  const retrievalEvents = app.debugRepo.listRecent('retrieval_executed', 40)
    .filter((event) => String(event.payload.hasProjectScope) === 'true');
  const routeKinds = new Set(retrievalEvents.map((event) => String(event.payload.routeKind)));
  assert.ok(routeKinds.has('project_progress'));
  assert.ok(routeKinds.has('current_stage'));
  assert.ok(routeKinds.has('next_step'));
  assert.ok(routeKinds.has('last_decision'));
  assert.ok(retrievalEvents.some((event) => event.payload.routeReason === 'scope_project' || event.payload.routeReason === 'project_signal'));
  assert.ok(retrievalEvents.some((event) => {
    const optimization = event.payload.recallOptimization as { routeAnchorItemsSelected?: number } | undefined;
    return (optimization?.routeAnchorItemsSelected ?? 0) >= 1;
  }));

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('sessionEnd does not over-generate decision or project summary from weak generic signals', async () => {
  const databasePath = createTempDbPath('session-end-boundary');
  const app = initializeEverMemory({ databasePath });

  await app.messageReceived({
    sessionId: 'session-boundary-1',
    messageId: 'msg-boundary-0',
    text: '我们继续处理这个项目。',
    scope: { userId: 'u-boundary-1', project: 'boundary-project' },
  });

  const result = app.sessionEnd({
    sessionId: 'session-boundary-1',
    messageId: 'msg-boundary-1',
    scope: { userId: 'u-boundary-1', project: 'boundary-project' },
    inputText: '继续推进当前任务。',
    actionSummary: '继续处理当前事项。',
    outcomeSummary: 'run_success',
    evidenceRefs: ['msg-boundary-1'],
  });

  const autoMemories = app.memoryRepo.search({
    scope: { userId: 'u-boundary-1', project: 'boundary-project' },
    archived: false,
    activeOnly: true,
    limit: 20,
  });

  assert.ok((result.autoMemory?.generatedByKind?.decision ?? 0) === 0);
  assert.ok((result.autoMemory?.generatedByKind?.project_summary ?? 0) === 0);
  assert.ok(autoMemories.every((item) => item.type !== 'decision'));
  assert.ok(autoMemories.every((item) => !(item.type === 'summary' && item.tags.includes('active_project_summary'))));

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});
