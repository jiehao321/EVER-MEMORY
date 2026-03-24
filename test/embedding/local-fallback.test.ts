import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import memoryPlugin from '../../src/openclaw/plugin.js';
import {
  LocalEmbeddingProvider,
  LOCAL_EMBEDDING_DEPENDENCY_ERROR_CODE,
} from '../../src/embedding/local.js';
import { EmbeddingManager } from '../../src/embedding/manager.js';
import { createTempDbPath } from '../helpers.js';

type HookHandler = (event: unknown, context: unknown) => unknown | Promise<unknown>;

async function hasTransformersDependency(): Promise<boolean> {
  try {
    const module = await import('@xenova/transformers');
    return typeof module.pipeline === 'function';
  } catch {
    return false;
  }
}

const transformersAvailable = await hasTransformersDependency();

function createMockApi(databasePath: string) {
  const hooks = new Map<string, HookHandler[]>();
  const services: Array<{ id: string; start: () => void | Promise<void>; stop?: () => void | Promise<void> }> =
    [];
  const infoLogs: string[] = [];
  const warnLogs: string[] = [];

  const api = {
    pluginConfig: { databasePath, debugEnabled: true },
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
    registerService(service: { id: string; start: () => void | Promise<void>; stop?: () => void | Promise<void> }) {
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

  return { api, hooks, infoLogs, services, warnLogs };
}

test(
  'LocalEmbeddingProvider throws a recognizable dependency error when transformers is unavailable',
  {
    // This fallback path is only meaningful when the optional dependency is absent.
    skip: transformersAvailable
      ? '@xenova/transformers is installed in this environment'
      : false,
  },
  async () => {
  const provider = new LocalEmbeddingProvider();
  const errors: string[] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map((arg) => String(arg)).join(' '));
  };

  try {
    await assert.rejects(
      async () => provider.initialize(),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(
          (error as Error & { code?: string }).code,
          LOCAL_EMBEDDING_DEPENDENCY_ERROR_CODE,
        );
        assert.match(
          error.message,
          /@xenova\/transformers not installed\. Run: npm install @xenova\/transformers/,
        );
        return true;
      },
    );
    assert.ok(
      errors.some((message) => message.includes('LocalEmbeddingProvider: @xenova/transformers not installed.')),
    );
  } finally {
    console.error = originalConsoleError;
    await provider.dispose();
  }
  },
);

test(
  'EmbeddingManager falls back to NoOp provider when local embeddings cannot initialize',
  {
    // This fallback path is only meaningful when the optional dependency is absent.
    skip: transformersAvailable
      ? '@xenova/transformers is installed in this environment'
      : false,
  },
  async () => {
  const manager = new EmbeddingManager();
  const warnings: string[] = [];
  const originalConsoleWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(' '));
  };

  try {
    manager.configure({ provider: 'local' });

    const embedding = await manager.embed('semantic fallback smoke test');

    assert.equal(embedding, null);
    assert.equal(manager.providerKind, 'none');
    assert.equal(manager.isReady(), false);
    assert.ok(
      warnings.some((message) => message.includes('Local embedding provider failed to initialize. Falling back to NoOp provider.')),
    );
  } finally {
    console.warn = originalConsoleWarn;
    await manager.dispose();
  }
  },
);

test(
  'LocalEmbeddingProvider initializes successfully when transformers is available',
  {
    skip: transformersAvailable
      ? false
      : '@xenova/transformers is not installed in this environment',
  },
  async () => {
    const provider = new LocalEmbeddingProvider();
    const fakePipeline = async () => ({
      data: new Float32Array([1, 2, 3]),
      dims: [1, 3],
    });

    // Avoid loading a real model here; the success-path contract is that a
    // successful pipeline factory leaves the provider ready for use.
    (
      provider as unknown as {
        _initialize(): Promise<(input: string) => Promise<{ data: Float32Array; dims: number[] }>>;
      }
    )._initialize = async () => fakePipeline;

    await provider.initialize();

    assert.equal(provider.isReady(), true);
    await provider.dispose();
    assert.equal(provider.isReady(), false);
  },
);

test('OpenClaw plugin defaults to the local embedding provider', async () => {
  const databasePath = createTempDbPath('openclaw-plugin-default-local');
  const { api, infoLogs, services } = createMockApi(databasePath);
  const originalProvider = process.env.EVERMEMORY_EMBEDDING_PROVIDER;
  delete process.env.EVERMEMORY_EMBEDDING_PROVIDER;

  try {
    await memoryPlugin.register(api as any);
    assert.equal(services.length, 1);

    await services[0].start();

    assert.ok(
      infoLogs.some((message) => message.includes('[EverMemory] Using local embedding provider (default)')),
    );

    await services[0].stop?.();
  } finally {
    if (originalProvider === undefined) {
      delete process.env.EVERMEMORY_EMBEDDING_PROVIDER;
    } else {
      process.env.EVERMEMORY_EMBEDDING_PROVIDER = originalProvider;
    }
    rmSync(databasePath, { force: true });
  }
});

test('LocalEmbeddingProvider l2 normalization returns a new array without mutating input', () => {
  const provider = new LocalEmbeddingProvider();
  const input = new Float32Array([3, 4]);

  const normalized = (
    provider as unknown as { _l2Normalize(vector: Float32Array): Float32Array }
  )._l2Normalize(input);

  assert.notEqual(normalized, input);
  assert.deepEqual(Array.from(input), [3, 4]);
  assert.ok(Math.abs(normalized[0] - 0.6) < 1e-6);
  assert.ok(Math.abs(normalized[1] - 0.8) < 1e-6);
});
