import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import memoryPlugin from '../../src/openclaw/plugin.js';
import { registerHooks } from '../../src/openclaw/hooks/index.js';
import { createTempDbPath } from '../helpers.js';

type HookHandler = (event: unknown, context: unknown) => unknown | Promise<unknown>;
type Service = { id: string; start: (_ctx?: unknown) => void | Promise<void>; stop?: (_ctx?: unknown) => void | Promise<void> };

function createHookApi(hooks: Map<string, HookHandler[]>) {
  return {
    on(name: string, handler: HookHandler) {
      const handlers = hooks.get(name) ?? [];
      handlers.push(handler);
      hooks.set(name, handlers);
    },
    logger: {
      info: (..._args: unknown[]) => undefined,
      warn: (..._args: unknown[]) => undefined,
      error: (..._args: unknown[]) => undefined,
      debug: (..._args: unknown[]) => undefined,
    },
  };
}

async function runHook(
  hooks: Map<string, HookHandler[]>,
  name: string,
  event: unknown,
  context: unknown,
): Promise<unknown> {
  let lastResult: unknown;
  for (const handler of hooks.get(name) ?? []) {
    const result = await handler(event, context);
    if (result !== undefined) {
      lastResult = result;
    }
  }
  return lastResult;
}

function createPluginApi(databasePath: string, butlerEnabled = true) {
  const hooks = new Map<string, HookHandler[]>();
  const services: Service[] = [];
  const infoLogs: string[] = [];
  const warnLogs: string[] = [];

  const api = {
    pluginConfig: {
      databasePath,
      debugEnabled: true,
      butler: { enabled: butlerEnabled },
    },
    resolvePath(input: string) {
      return input;
    },
    logger: {
      info(...args: unknown[]) {
        infoLogs.push(args.map((arg) => String(arg)).join(' '));
      },
      warn(...args: unknown[]) {
        warnLogs.push(args.map((arg) => String(arg)).join(' '));
      },
      error(..._args: unknown[]) {},
      debug(..._args: unknown[]) {},
    },
    runtime: {
      logging: {
        getChildLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
      },
    },
    on(name: string, handler: HookHandler) {
      const handlers = hooks.get(name) ?? [];
      handlers.push(handler);
      hooks.set(name, handlers);
    },
    registerTool() {},
    registerService(service: Service) {
      services.push(service);
    },
    registerMemoryPromptSection() {},
    registerHook() {},
    registerHttpRoute() {},
    registerChannel() {},
    registerGatewayMethod() {},
    registerCli() {},
    registerProvider() {},
    registerCommand() {},
    registerContextEngine() {},
  };

  return { api, hooks, services, infoLogs, warnLogs };
}

test('registerHooks checks the scheduler before the Butler message cycle', async () => {
  const hooks = new Map<string, HookHandler[]>();
  const callOrder: string[] = [];

  registerHooks({
    api: createHookApi(hooks),
    evermemory: {
      sessionStart: () => ({ ok: true }),
      messageReceived: async () => ({
        sessionId: 'session-scheduler-order',
        messageId: 'msg-scheduler-order',
        intent: { intent: { type: 'other' } },
        recall: { items: [], total: 0, limit: 5 },
        behaviorRules: [],
      }),
      sessionEnd: async () => ({ ok: true }),
      debugRepo: { log: (..._args: unknown[]) => undefined },
    },
    sessionScopes: new Map(),
  } as never, {
    agent: {
      async runCycle() {
        callOrder.push('runCycle');
        return {
          cycleId: 'cycle-1',
          hook: 'message_received',
          observedAt: '2026-04-04T00:00:00.000Z',
          observationSummary: 'ok',
          decisionsJson: '{}',
          actionsJson: '{}',
          llmInvoked: false,
          durationMs: 1,
        };
      },
      getState() {
        return null;
      },
    } as never,
    overlayGenerator: {
      async generateOverlay() {
        throw new Error('overlay should not be generated when state is missing');
      },
    } as never,
    attentionService: {
      getCriticalInsights() {
        return [];
      },
    } as never,
    llmProbe: async () => {
      callOrder.push('llmProbe');
    },
    scheduler: {
      async checkAndTick() {
        callOrder.push('scheduler');
        return true;
      },
    } as never,
  });

  await runHook(
    hooks,
    'before_agent_start',
    { prompt: 'Continue Butler scheduler wiring.' },
    { sessionId: 'session-scheduler-order', repoName: 'evermemory' },
  );

  assert.deepEqual(callOrder, ['llmProbe', 'scheduler', 'runCycle']);
});

test('registerHooks logs scheduler failures and continues the Butler cycle', async () => {
  const hooks = new Map<string, HookHandler[]>();
  const callOrder: string[] = [];
  const warnings: string[] = [];

  registerHooks({
    api: {
      ...createHookApi(hooks),
      logger: {
        info: (..._args: unknown[]) => undefined,
        warn(...args: unknown[]) {
          warnings.push(args.map((arg) => String(arg)).join(' '));
        },
        error: (..._args: unknown[]) => undefined,
        debug: (..._args: unknown[]) => undefined,
      },
    },
    evermemory: {
      sessionStart: () => ({ ok: true }),
      messageReceived: async () => ({
        sessionId: 'session-scheduler-failure',
        messageId: 'msg-scheduler-failure',
        intent: { intent: { type: 'other' } },
        recall: { items: [], total: 0, limit: 5 },
        behaviorRules: [],
      }),
      sessionEnd: async () => ({ ok: true }),
      debugRepo: { log: (..._args: unknown[]) => undefined },
    },
    sessionScopes: new Map(),
  } as never, {
    agent: {
      async runCycle() {
        callOrder.push('runCycle');
        return {
          cycleId: 'cycle-1',
          hook: 'message_received',
          observedAt: '2026-04-04T00:00:00.000Z',
          observationSummary: 'ok',
          decisionsJson: '{}',
          actionsJson: '{}',
          llmInvoked: false,
          durationMs: 1,
        };
      },
      getState() {
        return null;
      },
    } as never,
    overlayGenerator: {
      async generateOverlay() {
        throw new Error('overlay should not be generated when state is missing');
      },
    } as never,
    attentionService: {
      getCriticalInsights() {
        return [];
      },
    } as never,
    scheduler: {
      async checkAndTick() {
        callOrder.push('scheduler');
        throw new Error('scheduler exploded');
      },
    } as never,
  });

  const result = await runHook(
    hooks,
    'before_agent_start',
    { prompt: 'Continue Butler scheduler wiring after failure.' },
    { sessionId: 'session-scheduler-failure', repoName: 'evermemory' },
  );

  assert.deepEqual(callOrder, ['scheduler', 'runCycle']);
  assert.ok(result === undefined || typeof result === 'object');
  assert.match(String(warnings[0] ?? ''), /Butler before_agent_start_scheduler failed/i);
});

test('plugin service starts and stops the Butler scheduler when Butler is enabled', async () => {
  const databasePath = createTempDbPath('openclaw-plugin-scheduler-enabled');
  const { api, services, infoLogs } = createPluginApi(databasePath, true);

  try {
    await memoryPlugin.register(api as never);
    assert.equal(services.length, 1);

    await services[0].start();
    await services[0].stop?.();

    assert.ok(infoLogs.some((message) => message.includes('ButlerScheduler started')));
    assert.ok(infoLogs.some((message) => message.includes('ButlerScheduler stopped')));
  } finally {
    rmSync(databasePath, { force: true });
  }
});

test('plugin service does not start the Butler scheduler when Butler is disabled', async () => {
  const databasePath = createTempDbPath('openclaw-plugin-scheduler-disabled');
  const { api, services, infoLogs } = createPluginApi(databasePath, false);

  try {
    await memoryPlugin.register(api as never);
    assert.equal(services.length, 1);

    await services[0].start();
    await services[0].stop?.();

    assert.equal(infoLogs.some((message) => message.includes('ButlerScheduler started')), false);
  } finally {
    rmSync(databasePath, { force: true });
  }
});
