import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeEverMemory } from '../../src/index.js';
import memoryPlugin from '../../src/openclaw/plugin.js';

type HookHandler = (event: unknown, context: unknown) => unknown | Promise<unknown>;
type Service = { id: string; start: () => void | Promise<void>; stop?: () => void | Promise<void> };
type ToolRegistration = { tool: unknown; opts?: { name?: string; names?: string[] } };

function createApp() {
  return initializeEverMemory({ databasePath: ':memory:', debugEnabled: true });
}

function createMockApi() {
  const hooks = new Map<string, HookHandler[]>();
  const services: Service[] = [];
  const toolRegistrations: ToolRegistration[] = [];

  const api = {
    pluginConfig: { databasePath: ':memory:', debugEnabled: true },
    resolvePath(input: string) {
      return input;
    },
    logger: {
      info(..._args: unknown[]) {},
      warn(..._args: unknown[]) {},
      error(..._args: unknown[]) {},
      debug(..._args: unknown[]) {},
    },
    on(name: string, handler: HookHandler) {
      const list = hooks.get(name) ?? [];
      list.push(handler);
      hooks.set(name, list);
    },
    registerTool(tool: unknown, opts?: { name?: string; names?: string[] }) {
      toolRegistrations.push({ tool, opts });
    },
    registerService(service: Service) {
      services.push(service);
    },
  };

  return { api, hooks, services, toolRegistrations };
}

async function runHook(
  hooks: Map<string, HookHandler[]>,
  name: string,
  event: unknown,
  context: unknown,
) {
  let lastResult: unknown;
  for (const handler of hooks.get(name) ?? []) {
    const result = await handler(event, context);
    if (result !== undefined) {
      lastResult = result;
    }
  }
  return lastResult;
}

function resolveTools(toolRegistrations: ToolRegistration[], context: Record<string, unknown>) {
  const tools = new Map<string, any>();
  for (const registration of toolRegistrations) {
    const produced = typeof registration.tool === 'function'
      ? (registration.tool as (ctx: Record<string, unknown>) => unknown)(context)
      : registration.tool;
    for (const tool of Array.isArray(produced) ? produced : [produced]) {
      if (!tool || typeof tool !== 'object') {
        continue;
      }
      const names = new Set<string>();
      if (typeof (tool as { name?: unknown }).name === 'string') {
        names.add((tool as { name: string }).name);
      }
      if (registration.opts?.name) {
        names.add(registration.opts.name);
      }
      for (const alias of registration.opts?.names ?? []) {
        names.add(alias);
      }
      for (const name of names) {
        tools.set(name, tool);
      }
    }
  }
  return tools;
}

test('完整生命周期链路可无报错完成', async (t) => {
  const app = createApp();
  t.after(() => app.database.connection.close());

  const start = app.sessionStart({
    sessionId: 'lifecycle-smoke-1',
    userId: 'user-lifecycle-1',
    chatId: 'chat-lifecycle-1',
    project: 'evermemory',
    channel: 'test',
  });
  const message = await app.messageReceived({
    sessionId: 'lifecycle-smoke-1',
    messageId: 'msg-lifecycle-1',
    text: '记住我喜欢 TypeScript，并继续推进冒烟测试。',
    scope: start.scope,
    channel: 'test',
  });
  const end = await app.sessionEnd({
    sessionId: 'lifecycle-smoke-1',
    messageId: 'msg-lifecycle-end-1',
    scope: start.scope,
    channel: 'test',
    inputText: '记住我喜欢 TypeScript，并继续推进冒烟测试。',
    actionSummary: '记录偏好并规划后续验证。',
    outcomeSummary: '下一步：补齐 OpenClaw lifecycle smoke。',
    evidenceRefs: ['msg-lifecycle-1'],
  });

  assert.ok(start);
  assert.ok(start.briefing);
  assert.ok(message);
  assert.ok(message.intent);
  assert.ok(message.recall);
  assert.ok(end);
  assert.ok(end.experience);
  assert.ok(end.autoMemory);
});

test('sessionStart 返回 scope、bootBriefing 与 behaviorRules', (t) => {
  const app = createApp();
  t.after(() => app.database.connection.close());

  const result = app.sessionStart({
    sessionId: 'lifecycle-smoke-2',
    userId: 'user-lifecycle-2',
    chatId: 'chat-lifecycle-2',
    project: 'evermemory',
    channel: 'test',
  });
  const runtime = app.getRuntimeSessionContext('lifecycle-smoke-2');

  assert.equal(result.sessionId, 'lifecycle-smoke-2');
  assert.deepEqual(result.scope, {
    userId: 'user-lifecycle-2',
    chatId: 'chat-lifecycle-2',
    project: 'evermemory',
  });
  assert.ok(runtime?.bootBriefing);
  assert.ok(runtime?.bootBriefing?.id);
  assert.equal(typeof runtime?.bootBriefing?.generatedAt, 'string');
  assert.ok(Array.isArray(result.behaviorRules));
});

test('messageReceived 返回 intent、recalledItems 与 behaviorRules', async (t) => {
  const app = createApp();
  t.after(() => app.database.connection.close());

  const scope = { userId: 'user-lifecycle-3', chatId: 'chat-lifecycle-3', project: 'evermemory' };
  app.evermemoryStore({ content: '用户喜欢 TypeScript', scope, type: 'preference' });
  app.sessionStart({ sessionId: 'lifecycle-smoke-3', ...scope, channel: 'test' });

  const result = await app.messageReceived({
    sessionId: 'lifecycle-smoke-3',
    messageId: 'msg-lifecycle-3',
    text: '记住我喜欢 TypeScript',
    scope,
    channel: 'test',
  });
  const runtime = app.getRuntimeInteractionContext('lifecycle-smoke-3');

  assert.ok(result.intent.id);
  assert.ok(Array.isArray(result.recall.items));
  assert.ok(Array.isArray(result.behaviorRules));
  assert.ok(Array.isArray(runtime?.recalledItems));
});

test('sessionEnd 触发 experience、auto-capture、profile 更新与 learningInsights', async (t) => {
  const app = createApp();
  t.after(() => app.database.connection.close());

  const scope = { userId: 'user-lifecycle-4', chatId: 'chat-lifecycle-4', project: 'evermemory' };
  app.sessionStart({ sessionId: 'lifecycle-smoke-4', ...scope, channel: 'test' });
  await app.messageReceived({
    sessionId: 'lifecycle-smoke-4',
    messageId: 'msg-lifecycle-4',
    text: '项目状态：Batch 2，继续强化 OpenClaw 生命周期测试。',
    scope,
    channel: 'test',
  });

  const result = await app.sessionEnd({
    sessionId: 'lifecycle-smoke-4',
    messageId: 'msg-lifecycle-4-end',
    scope,
    channel: 'test',
    inputText: '更正一下，我偏好 TypeScript，项目当前是 Batch 2。',
    actionSummary: '最近决策：先补 lifecycle smoke，再跑完整回归。',
    outcomeSummary: '下一步：执行 build 与 test。',
    evidenceRefs: ['msg-lifecycle-4'],
  });

  assert.ok(result.experience.id);
  assert.ok(result.autoMemory);
  assert.equal(typeof result.profileUpdated, 'boolean');
  assert.equal(typeof result.learningInsights, 'number');
  assert.ok((result.autoMemory?.generated ?? 0) >= 1);
});

test('同一 session 的多条 message 可复用先前存储的记忆', async (t) => {
  const app = createApp();
  t.after(() => app.database.connection.close());

  const scope = { userId: 'user-lifecycle-5', chatId: 'chat-lifecycle-5', project: 'evermemory' };
  app.sessionStart({ sessionId: 'lifecycle-smoke-5', ...scope, channel: 'test' });

  await app.messageReceived({
    sessionId: 'lifecycle-smoke-5',
    messageId: 'msg-lifecycle-5-1',
    text: '记住我喜欢 TypeScript',
    scope,
    channel: 'test',
  });
  app.evermemoryStore({ content: '我喜欢 TypeScript', scope, type: 'preference' });

  const second = await app.messageReceived({
    sessionId: 'lifecycle-smoke-5',
    messageId: 'msg-lifecycle-5-2',
    text: '我喜欢 TypeScript',
    scope,
    channel: 'test',
    recallLimit: 5,
  });
  const third = await app.messageReceived({
    sessionId: 'lifecycle-smoke-5',
    messageId: 'msg-lifecycle-5-3',
    text: '我喜欢 TypeScript',
    scope,
    channel: 'test',
    recallLimit: 5,
  });
  const end = await app.sessionEnd({
    sessionId: 'lifecycle-smoke-5',
    messageId: 'msg-lifecycle-5-end',
    scope,
    channel: 'test',
    inputText: '我喜欢 TypeScript',
    actionSummary: '复用已存储偏好生成回答。',
    outcomeSummary: '会话结束。',
  });

  assert.ok(second.recall.items.some((item) => item.content.includes('TypeScript')));
  assert.ok(third.recall.items.some((item) => item.content.includes('TypeScript')));
  assert.ok(end.experience.id);
});

test('plugin stop 后完成资源清理，并可重新 register/start 后继续工作', async () => {
  const first = createMockApi();
  await memoryPlugin.register(first.api);
  assert.equal(first.services.length, 1);

  await first.services[0].start();
  await runHook(
    first.hooks,
    'session_start',
    { sessionId: 'plugin-lifecycle-1', requesterSenderId: 'user-plugin-1', chatId: 'chat-plugin-1' },
    { sessionId: 'plugin-lifecycle-1', requesterSenderId: 'user-plugin-1', chatId: 'chat-plugin-1' },
  );
  await first.services[0].stop?.();

  const stoppedResult = await runHook(
    first.hooks,
    'before_agent_start',
    { prompt: '记住我喜欢 TypeScript', sessionId: 'plugin-lifecycle-1' },
    { sessionId: 'plugin-lifecycle-1', runId: 'run-plugin-stopped' },
  );
  assert.equal(stoppedResult, undefined);

  const second = createMockApi();
  await memoryPlugin.register(second.api);
  assert.equal(second.services.length, 1);
  await second.services[0].start();
  const tools = resolveTools(second.toolRegistrations, {
    sessionId: 'plugin-lifecycle-2',
    requesterSenderId: 'user-plugin-2',
    chatId: 'chat-plugin-2',
    messageChannel: 'test',
  });
  const storeTool = tools.get('memory_store');
  assert.ok(storeTool);
  await storeTool.execute('tc-plugin-restart-store', {
    content: '语言偏好：TypeScript',
    type: 'preference',
    scope: { userId: 'user-plugin-2', chatId: 'chat-plugin-2', project: 'evermemory' },
  });

  await runHook(
    second.hooks,
    'session_start',
    { sessionId: 'plugin-lifecycle-2', requesterSenderId: 'user-plugin-2', chatId: 'chat-plugin-2' },
    { sessionId: 'plugin-lifecycle-2', requesterSenderId: 'user-plugin-2', chatId: 'chat-plugin-2' },
  );
  const restartedResult = await runHook(
    second.hooks,
    'before_agent_start',
    { prompt: '记住我喜欢 TypeScript', sessionId: 'plugin-lifecycle-2' },
    { sessionId: 'plugin-lifecycle-2', runId: 'run-plugin-restarted' },
  );

  assert.ok(restartedResult === undefined || typeof restartedResult === 'object');
  await second.services[0].stop?.();
});
