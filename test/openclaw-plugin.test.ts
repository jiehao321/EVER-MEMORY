import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import memoryPlugin from '../src/openclaw/plugin.js';
import { createTempDbPath } from './helpers.js';

type HookHandler = (event: unknown, context: unknown) => unknown | Promise<unknown>;

function createMockApi(databasePath: string) {
  const hooks = new Map<string, HookHandler[]>();
  const toolRegistrations: Array<{ tool: unknown; opts?: { name?: string; names?: string[] } }> = [];
  const services: Array<{ id: string; start: () => void | Promise<void>; stop?: () => void | Promise<void> }> =
    [];

  const logger = {
    info() {},
    warn() {},
    error() {},
    debug() {},
  };

  const api = {
    pluginConfig: { databasePath, debugEnabled: true },
    resolvePath(input: string) {
      return input;
    },
    logger,
    on(name: string, handler: HookHandler) {
      const handlers = hooks.get(name) ?? [];
      handlers.push(handler);
      hooks.set(name, handlers);
    },
    registerTool(tool: unknown, opts?: { name?: string; names?: string[] }) {
      toolRegistrations.push({ tool, opts });
    },
    registerService(service: { id: string; start: () => void | Promise<void>; stop?: () => void | Promise<void> }) {
      services.push(service);
    },
    registerHook() {},
    registerHttpRoute() {},
    registerChannel() {},
    registerGatewayMethod() {},
    registerCli() {},
    registerProvider() {},
    registerCommand() {},
    registerContextEngine() {},
  };

  return { api, hooks, toolRegistrations, services };
}

async function runHook(
  hooks: Map<string, HookHandler[]>,
  name: string,
  event: unknown,
  context: unknown,
): Promise<unknown> {
  let lastResult: unknown = undefined;
  for (const handler of hooks.get(name) ?? []) {
    const result = await handler(event, context);
    if (result !== undefined) {
      lastResult = result;
    }
  }
  return lastResult;
}

function resolveTools(
  toolRegistrations: Array<{ tool: unknown; opts?: { name?: string; names?: string[] } }>,
  context: Record<string, unknown>,
) {
  const tools = new Map<string, any>();

  for (const registration of toolRegistrations) {
    const produced = typeof registration.tool === 'function'
      ? (registration.tool as (ctx: Record<string, unknown>) => unknown)(context)
      : registration.tool;
    const list = Array.isArray(produced) ? produced : [produced];

    for (const tool of list) {
      if (!tool || typeof tool !== 'object') {
        continue;
      }

      const names = new Set<string>();
      const toolName = typeof (tool as { name?: unknown }).name === 'string'
        ? (tool as { name: string }).name
        : undefined;
      if (toolName) {
        names.add(toolName);
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

test('OpenClaw adapter registers services/tools/hooks and injects recall context', async () => {
  const databasePath = createTempDbPath('openclaw-plugin');
  const { api, hooks, toolRegistrations, services } = createMockApi(databasePath);

  await memoryPlugin.register(api);
  assert.equal(services.length, 1);
  await services[0].start();

  await runHook(
    hooks,
    'session_start',
    { sessionId: 'session-openclaw-1', sessionKey: 'chat-openclaw-1' },
    { sessionId: 'session-openclaw-1', sessionKey: 'chat-openclaw-1' },
  );

  const runtimeContext = {
    sessionId: 'session-openclaw-1',
    sessionKey: 'chat-openclaw-1',
    requesterSenderId: 'user-openclaw-1',
    messageChannel: 'test',
  };

  const tools = resolveTools(toolRegistrations, runtimeContext);
  const storeTool = tools.get('memory_store');
  const recallTool = tools.get('memory_recall');
  const statusTool = tools.get('evermemory_status');

  assert.ok(storeTool);
  assert.ok(recallTool);
  assert.ok(statusTool);

  const storeResult = await storeTool.execute('tc-1', {
    content: '项目计划：先做质量审查，再推进开发实现。',
    type: 'project',
    tags: ['plan', 'quality'],
  });
  assert.equal(storeResult.details.accepted, true);

  const recallResult = await recallTool.execute('tc-2', {
    query: '项目计划',
    limit: 3,
  });
  assert.ok(recallResult.details.total >= 1);

  const hookResult = await runHook(
    hooks,
    'before_agent_start',
    {
      prompt: '结合之前项目计划，给我今天的推进建议。',
      messages: [],
    },
    {
      sessionId: 'session-openclaw-1',
      sessionKey: 'chat-openclaw-1',
      channelId: 'test',
      runId: 'run-openclaw-1',
    },
  );

  assert.ok(hookResult && typeof hookResult === 'object');
  const prependContext = (hookResult as { prependContext?: unknown }).prependContext;
  assert.equal(typeof prependContext, 'string');
  assert.match(String(prependContext), /evermemory-context/i);

  const statusResult = await statusTool.execute('tc-3', {});
  assert.ok(statusResult.details.memoryCount >= 1);

  await runHook(
    hooks,
    'agent_end',
    {
      success: true,
      messages: [
        { role: 'user', content: '请继续推进' },
        { role: 'assistant', content: '我会先执行质量检查' },
      ],
    },
    {
      sessionId: 'session-openclaw-1',
      sessionKey: 'chat-openclaw-1',
      runId: 'run-openclaw-1',
    },
  );

  await runHook(
    hooks,
    'session_end',
    { sessionId: 'session-openclaw-1', messageCount: 2 },
    { sessionId: 'session-openclaw-1', sessionKey: 'chat-openclaw-1' },
  );

  await services[0].stop?.();
  rmSync(databasePath, { force: true });
});
