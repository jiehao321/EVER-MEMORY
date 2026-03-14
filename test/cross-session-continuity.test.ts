import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import { createTempDbPath } from './helpers.js';

test('cross session continuity recall stays accurate after multi-day progression', async () => {
  const databasePath = createTempDbPath('cross-session-continuity');
  const app = initializeEverMemory({ databasePath });

  const scope = { userId: 'u-cross-session', project: 'phase-a-t-008' };

  const sessions = [
    {
      sessionId: 'cross-session-1',
      message: 'Phase A 启动：建立 EverMemory 长周期测试项目，定义初始摘要、决策和下一步。',
      inputText: '初始化 briefing：项目摘要聚焦 recall gate，约束是所有阶段必须记录下一步。',
      actionSummary: '决策：采用长周期连续性矩阵，下一步是补充项目里程碑。',
      outcomeSummary: '状态：Kickoff 完成，关键约束：所有会话结尾都要写清楚下一步。',
    },
    {
      sessionId: 'cross-session-2',
      message: '第二天更新：完成项目架构梳理，准备引入 release gate 指标。',
      inputText: '更新项目进展，并把 release gate 务必覆盖多 session 测试写入。',
      actionSummary: '决策：release gate 覆盖 continuity matrix；下一步：把跨 session 用例都写完。',
      outcomeSummary: '状态：进度到 40%，关键约束：禁止跳过决策复核，下一步：撰写 Session 3 约束。',
    },
    {
      sessionId: 'cross-session-3',
      message: '第三天：发现新的环境约束，需要兼容 debug route project_progress。',
      inputText: '补充新的运行约束，并同步给团队。',
      actionSummary: '决策：所有 project_progress 路由都要记录；下一步：在测试中验证 routeKind。',
      outcomeSummary: '状态：约束增加，关键约束：routeKind 必须是 project_progress，下一步：阶段 Beta 质量门禁。',
    },
    {
      sessionId: 'cross-session-4',
      message: '第四天：阶段完成，刷新摘要，并准备最终召回验证。',
      inputText: '记录阶段完成以及新的指导摘要，准备 Session 5 复盘。',
      actionSummary: '决策：延长 Beta 质量门禁以覆盖长周期记忆，并冻结旧摘要。',
      outcomeSummary: '状态：阶段完成，关键约束：禁止留下“待补充”占位符，下一步：Session 5 用新的会话验证召回。',
    },
  ];

  for (const session of sessions) {
    await app.messageReceived({
      sessionId: session.sessionId,
      messageId: `${session.sessionId}-msg`,
      text: session.message,
      scope,
    });
    const endResult = app.sessionEnd({
      sessionId: session.sessionId,
      messageId: `${session.sessionId}-end`,
      scope,
      inputText: session.inputText,
      actionSummary: session.actionSummary,
      outcomeSummary: session.outcomeSummary,
      evidenceRefs: [`${session.sessionId}-msg`],
    });
    assert.equal(endResult.sessionId, session.sessionId);
    assert.ok((endResult.autoMemory?.accepted ?? 0) >= 1);
  }

  const session5Id = 'cross-session-5';
  app.sessionStart({ sessionId: session5Id, userId: scope.userId, project: scope.project });
  const progressQuestion = await app.messageReceived({
    sessionId: session5Id,
    messageId: `${session5Id}-progress`,
    text: '项目进展是什么？需要最新的跨 session 摘要。',
    scope,
  });
  assert.ok(progressQuestion.recall);
  const followup = await app.messageReceived({
    sessionId: session5Id,
    messageId: `${session5Id}-query`,
    text: '请召回最新的项目连续性摘要、决策和约束，不要遗漏跨 session 背景。',
    scope,
  });
  assert.ok(followup.recall);

  const recall = await app.evermemoryRecall({
    query: '项目连续性 摘要 决策 约束 下一步',
    scope,
    limit: 10,
    mode: 'keyword',
  });

  assert.ok(recall.total >= 3);
  assert.ok(recall.items.some((item) => item.type === 'summary' || item.type === 'project'));
  const summaryItems = recall.items.filter(
    (item) => item.type === 'summary' || (item.tags ?? []).includes('active_project_summary'),
  );
  assert.ok(summaryItems.length >= 1);
  assert.ok(summaryItems.every((item) => !item.content.includes('待补充') && !item.content.includes('待确认')));
  assert.ok(
    recall.items.some((item) => item.content.includes('延长 Beta 质量门禁') || item.content.includes('决策：延长 Beta')),
    'should recall the latest decision about extending the Beta quality gate',
  );

  const retrievalEvents = app
    .debugRepo
    .listRecent('retrieval_executed', 15)
    .filter((event) => String(event.payload.hasProjectScope) === 'true');
  assert.ok(retrievalEvents.some((event) => event.payload.routeKind === 'project_progress'));

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});
