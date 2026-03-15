import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeEverMemory } from '../../src/index.js';

test('openclaw continuity matrix accumulates memory, profile, and briefing across 5 sessions', async () => {
  const app = initializeEverMemory({ databasePath: ':memory:' });
  const scope = { userId: 'u-openclaw-matrix', project: 'continuity-matrix' };

  try {
    const session1 = app.sessionStart({
      sessionId: 'continuity-matrix-s1',
      userId: scope.userId,
      project: scope.project,
    });
    assert.equal(session1.briefing.sections.identity.length, 0);

    app.evermemoryStore({
      content: '我是前端开发，主要用 React 和 TypeScript',
      scope,
      type: 'preference',
      lifecycle: 'semantic',
      tags: ['tech_stack', 'React', 'TypeScript', 'frontend'],
      relatedEntities: ['React', 'TypeScript'],
    });

    await app.messageReceived({
      sessionId: 'continuity-matrix-s1',
      messageId: 'continuity-matrix-s1-msg',
      text: '我是前端开发，主要用 React 和 TypeScript',
      scope,
    });

    const session1End = await app.sessionEnd({
      sessionId: 'continuity-matrix-s1',
      messageId: 'continuity-matrix-s1-end',
      scope,
      inputText: '用户自我介绍：前端开发，主要技术栈 React 和 TypeScript。',
      actionSummary: '记录用户技术背景与偏好，供后续 briefing 和 profile 使用。',
      outcomeSummary: '状态：已建立初始用户画像；下一步：记录构建工具技术决策。',
      evidenceRefs: ['continuity-matrix-s1-msg'],
    });
    assert.ok((session1End.autoMemory?.accepted ?? 0) >= 1);

    const session2 = app.sessionStart({
      sessionId: 'continuity-matrix-s2',
      userId: scope.userId,
      project: scope.project,
    });
    assert.ok(session2.briefing.sections.identity.length >= 1);
    assert.ok(session2.briefing.sections.identity.some((line) => line.includes('偏好推断') || line.includes('沟通风格')));

    app.evermemoryStore({
      content: '我们决定用 Vite 替代 Webpack',
      scope,
      type: 'decision',
      lifecycle: 'semantic',
      tags: ['build_tool', 'Vite', 'Webpack'],
      relatedEntities: ['Vite', 'Webpack'],
    });

    await app.messageReceived({
      sessionId: 'continuity-matrix-s2',
      messageId: 'continuity-matrix-s2-msg',
      text: '我们决定用 Vite 替代 Webpack',
      scope,
    });

    const session2End = await app.sessionEnd({
      sessionId: 'continuity-matrix-s2',
      messageId: 'continuity-matrix-s2-end',
      scope,
      inputText: '技术决策更新：我们决定用 Vite 替代 Webpack。',
      actionSummary: '同步构建工具决策，并延续上一轮记录的前端技术背景。',
      outcomeSummary: '状态：构建链路切换方向明确；下一步：记录 npm 安装踩坑警告。',
      evidenceRefs: ['continuity-matrix-s2-msg'],
    });
    assert.equal(session2End.profileUpdated, true);

    const profileAfterSession2 = app.evermemoryProfile({ userId: scope.userId });
    assert.ok(profileAfterSession2.profile);
    assert.match(profileAfterSession2.profile?.stable.explicitPreferences.tech_stack?.value ?? '', /React/i);
    assert.match(profileAfterSession2.profile?.stable.explicitPreferences.tech_stack?.value ?? '', /TypeScript/i);

    const session3 = app.sessionStart({
      sessionId: 'continuity-matrix-s3',
      userId: scope.userId,
      project: scope.project,
    });
    assert.ok(session3.briefing.sections.identity.length >= session2.briefing.sections.identity.length);
    assert.ok(
      session3.briefing.sections.recentContinuity.some((line) => line.includes('Vite') || line.includes('Webpack')),
    );

    app.evermemoryStore({
      content: '注意：直接用 npm install 会破坏 lock file，必须用 npm ci',
      scope,
      type: 'constraint',
      lifecycle: 'semantic',
      tags: ['warning', 'npm', 'lockfile', 'npm_ci'],
      relatedEntities: ['npm install', 'npm ci', 'lock file'],
    });

    await app.messageReceived({
      sessionId: 'continuity-matrix-s3',
      messageId: 'continuity-matrix-s3-msg',
      text: '注意：直接用 npm install 会破坏 lock file，必须用 npm ci',
      scope,
    });

    const session3End = await app.sessionEnd({
      sessionId: 'continuity-matrix-s3',
      messageId: 'continuity-matrix-s3-end',
      scope,
      inputText: '注意：直接用 npm install 会破坏 lock file，必须用 npm ci。',
      actionSummary: '补充 npm 安装警告，避免团队继续误用 npm install。',
      outcomeSummary: '状态：踩坑规则已记录并可复用；下一步：在安装新包时验证主动提醒。',
      evidenceRefs: ['continuity-matrix-s3-msg'],
    });
    assert.ok(session3End.learningInsights >= 1);

    const session4 = app.sessionStart({
      sessionId: 'continuity-matrix-s4',
      userId: scope.userId,
      project: scope.project,
    });
    assert.ok(session4.userProfile);
    assert.ok(session4.userProfile?.explicitPreferences.tech_stack?.includes('React'));

    app.evermemoryStore({
      content: '准备安装一个新的 npm 包，需要遵守既有安装约束',
      scope,
      type: 'fact',
      lifecycle: 'working',
      tags: ['npm', 'package_install'],
      relatedEntities: ['npm package'],
    });

    const session4Message = await app.messageReceived({
      sessionId: 'continuity-matrix-s4',
      messageId: 'continuity-matrix-s4-msg',
      text: '我要安装一个新的 npm 包',
      scope,
    });
    assert.equal(session4Message.recall.total, 0);

    const session4Recall = await app.evermemoryRecall({
      query: 'npm install npm ci lock file',
      scope,
      types: ['constraint'],
      lifecycles: ['semantic'],
      mode: 'keyword',
      limit: 5,
    });
    assert.ok(session4Recall.total >= 1);
    assert.ok(
      session4Recall.items.some((item) =>
        item.content.includes('npm install') && item.content.includes('npm ci')
      ),
    );

    const session4End = await app.sessionEnd({
      sessionId: 'continuity-matrix-s4',
      messageId: 'continuity-matrix-s4-end',
      scope,
      inputText: '准备安装新 npm 包时，先回忆已有安装约束。',
      actionSummary: '触发安装场景，验证系统能主动召回 npm ci 警告。',
      outcomeSummary: '状态：主动提醒生效；下一步：做最终 briefing 与智能度核验。',
      evidenceRefs: ['continuity-matrix-s4-msg'],
    });
    assert.ok((session4End.autoMemory?.accepted ?? 0) >= 1);

    const session5 = app.sessionStart({
      sessionId: 'continuity-matrix-s5',
      userId: scope.userId,
      project: scope.project,
    });
    assert.ok(session5.briefing.sections.identity.some((line) => line.includes('偏好推断') || line.includes('沟通风格')));
    assert.ok(
      session5.briefing.sections.constraints.some((line) => line.includes('npm ci'))
      || session5.briefing.sections.activeProjects.some((line) => line.includes('npm ci')),
    );
    assert.ok(
      session5.briefing.sections.activeProjects.some((line) => line.includes('下一步：') || line.includes('项目连续性摘要')),
    );

    app.evermemoryStore({
      content: '第五轮总结：验证跨 session 连续性矩阵通过',
      scope,
      type: 'summary',
      lifecycle: 'episodic',
      tags: ['continuity_matrix', 'final_check'],
    });

    await app.messageReceived({
      sessionId: 'continuity-matrix-s5',
      messageId: 'continuity-matrix-s5-msg',
      text: '请总结这 5 轮 session 的连续性结果',
      scope,
    });

    const session5End = await app.sessionEnd({
      sessionId: 'continuity-matrix-s5',
      messageId: 'continuity-matrix-s5-end',
      scope,
      inputText: '总结 5 轮 session 的记忆累积、profile 进化和 briefing 演变。',
      actionSummary: '核验跨 session 连续性矩阵是否完整闭环。',
      outcomeSummary: '状态：连续性矩阵完成验收；下一步：保持回归测试常驻。',
      evidenceRefs: ['continuity-matrix-s5-msg'],
    });
    assert.ok((session5End.autoMemory?.accepted ?? 0) >= 1);

    const smartnessReport = await app.evermemorySmartness({ userId: scope.userId });
    const smartnessScore = Number(smartnessReport.match(/智能度评分：(\d+)\/100/u)?.[1] ?? '0');
    assert.ok(smartnessScore > 0);

    const finalProfile = app.evermemoryProfile({ userId: scope.userId });
    assert.ok(finalProfile.profile);
    assert.match(finalProfile.profile?.stable.explicitPreferences.tech_stack?.value ?? '', /React/i);
    assert.ok(finalProfile.profile?.derived.communicationStyle);

    const finalStatus = app.evermemoryStatus({ userId: scope.userId, sessionId: 'continuity-matrix-s5' });
    assert.ok((finalStatus.memoryCount ?? 0) >= 5);
  } finally {
    app.database.connection.close();
  }
});
