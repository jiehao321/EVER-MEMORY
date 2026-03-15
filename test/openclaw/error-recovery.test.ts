import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { initializeEverMemory } from '../../src/index.js';

type App = ReturnType<typeof initializeEverMemory>;

describe('Error Recovery', () => {
  const apps: App[] = [];

  function createApp(): App {
    const app = initializeEverMemory({ databasePath: ':memory:' });
    apps.push(app);
    return app;
  }

  afterEach(() => {
    while (apps.length > 0) {
      apps.pop()?.database.connection.close();
    }
  });

  it('sessionStart with empty userId does not throw', () => {
    const app = createApp();

    const result = app.sessionStart({
      sessionId: 'recovery-start-empty-user',
      userId: '',
      chatId: 'chat-recovery',
    });

    assert.equal(result.sessionId, 'recovery-start-empty-user');
    assert.equal(result.scope.userId, '');
    assert.ok(Array.isArray(result.briefing.sections.identity));
    assert.ok(app.getRuntimeSessionContext('recovery-start-empty-user'));
  });

  it('messageReceived with empty text returns valid result', async () => {
    const app = createApp();

    const result = await app.messageReceived({
      sessionId: 'recovery-empty-text',
      messageId: 'msg-empty-text',
      text: '',
      scope: { userId: 'u-empty-text', project: 'apollo' },
    });

    assert.equal(typeof result.intent.intent.type, 'string');
    assert.ok(result.intent.intent.type.length > 0);
    assert.deepEqual(result.recall.items, []);
    assert.equal(result.recall.total, 0);
  });

  it('sessionEnd with minimal input does not throw', async () => {
    const app = createApp();

    const result = await app.sessionEnd({
      sessionId: 'recovery-min-end',
      messageId: '',
      scope: { userId: '', project: '' },
      inputText: '',
      actionSummary: '',
      outcomeSummary: '',
      evidenceRefs: [],
    });

    assert.equal(result.sessionId, 'recovery-min-end');
    assert.equal(result.autoMemory?.generated ?? 0, 0);
    assert.equal(result.autoMemory?.accepted ?? 0, 0);
    assert.ok(result.experience.id.length > 0);
  });

  it('store with 100KB content handles gracefully', () => {
    const app = createApp();
    const content = 'x'.repeat(100_000);

    const result = app.evermemoryStore({
      content,
      scope: { userId: 'u-long-content', project: 'load-test' },
    });

    assert.equal(typeof result.accepted, 'boolean');
    assert.equal(typeof result.reason, 'string');
    if (result.accepted) {
      assert.equal(result.memory?.content.length, 100_000);
    } else {
      assert.equal(result.memory, null);
    }
  });

  it('recall with unknown scope returns empty results', async () => {
    const app = createApp();

    const result = await app.evermemoryRecall({
      query: 'recent decisions',
      scope: { userId: 'missing-user', project: 'missing-project' },
    });

    assert.deepEqual(result.items, []);
    assert.equal(result.total, 0);
  });

  it('concurrent sessionStart calls do not corrupt state', async () => {
    const app = createApp();
    const userId = 'u-concurrent';

    const results = await Promise.all([
      Promise.resolve(app.sessionStart({ sessionId: 'concurrent-1', userId, project: 'apollo' })),
      Promise.resolve(app.sessionStart({ sessionId: 'concurrent-2', userId, project: 'apollo' })),
      Promise.resolve(app.sessionStart({ sessionId: 'concurrent-3', userId, project: 'apollo' })),
    ]);

    assert.deepEqual(results.map((item) => item.sessionId).sort(), ['concurrent-1', 'concurrent-2', 'concurrent-3']);
    for (const sessionId of ['concurrent-1', 'concurrent-2', 'concurrent-3']) {
      const runtime = app.getRuntimeSessionContext(sessionId);
      assert.ok(runtime);
      assert.equal(runtime?.sessionId, sessionId);
      assert.equal(runtime?.scope.userId, userId);
      assert.ok(runtime?.bootBriefing);
    }
  });

  it('new session after sessionEnd works correctly', async () => {
    const app = createApp();
    const scope = { userId: 'u-reuse', project: 'apollo' };

    app.sessionStart({ sessionId: 'reuse-1', userId: scope.userId, project: scope.project });
    await app.messageReceived({
      sessionId: 'reuse-1',
      messageId: 'reuse-1-msg',
      text: 'Apollo 进入 Batch 7，需要继续加固 recall。',
      scope,
    });
    const ended = await app.sessionEnd({
      sessionId: 'reuse-1',
      messageId: 'reuse-1-end',
      scope,
      inputText: '项目状态：Batch 7，当前阶段是 recall hardening。',
      actionSummary: '最近决策：先保稳定性，再扩测试范围。',
      outcomeSummary: '下一步：补异常恢复测试并执行回归。',
      evidenceRefs: ['reuse-1-end'],
    });

    assert.ok((ended.autoMemory?.accepted ?? 0) >= 1);
    app.sessionStart({ sessionId: 'reuse-2', userId: scope.userId, project: scope.project });
    const followup = await app.messageReceived({
      sessionId: 'reuse-2',
      messageId: 'reuse-2-msg',
      text: '最近决策是什么？',
      scope,
    });

    assert.ok(followup.recall.total >= 1);
    assert.ok(followup.recall.items.some((item) => item.content.includes('稳定性') || item.content.includes('Batch 7')));
    assert.equal(app.getRuntimeSessionContext('reuse-2')?.sessionId, 'reuse-2');
  });

  it('import with malformed JSON returns errors without crashing', async () => {
    const app = createApp();

    const result = await app.import('{ broken json ]]', 'json', { userId: 'u-import-json' });

    assert.equal(result.imported, 0);
    assert.ok(result.errors.length > 0);
  });

  it('import with invalid markdown returns zero imports', async () => {
    const app = createApp();

    const result = await app.import('plain text without markdown headings', 'markdown', { userId: 'u-import-md' });

    assert.equal(result.imported, 0);
    assert.equal(result.errors.length, 0);
  });
});
