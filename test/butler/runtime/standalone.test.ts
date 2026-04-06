import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ButlerTransport } from '../../../src/core/butler/transports/types.js';
import type { ButlerMessage } from '../../../src/core/butler/protocol/types.js';
import type { LlmGateway, LlmRequest, LlmResponse } from '../../../src/core/butler/types.js';
import { ButlerAgent } from '../../../src/core/butler/agent.js';
import { createStandaloneStorage } from '../../../src/core/butler/adapters/sqlite.js';
import { ButlerRuntime } from '../../../src/core/butler/runtime/standalone.js';

class StubTransport implements ButlerTransport {
  public startCalls = 0;
  public stopCalls = 0;
  public sentMessages: ButlerMessage[] = [];
  public handler?: (message: ButlerMessage) => Promise<ButlerMessage | null>;

  start(onMessage: (message: ButlerMessage) => Promise<ButlerMessage | null>): void {
    this.startCalls += 1;
    this.handler = onMessage;
  }

  send(_message: ButlerMessage): void {
    this.sentMessages.push(_message);
  }

  stop(): void {
    this.stopCalls += 1;
    this.handler = undefined;
  }
}

function createLogger() {
  return {
    info: (_message: string, _meta?: Record<string, unknown>) => undefined,
    warn: (_message: string, _meta?: Record<string, unknown>) => undefined,
    error: (_message: string, _meta?: Record<string, unknown>) => undefined,
    debug: (_message: string, _meta?: Record<string, unknown>) => undefined,
  };
}

function createGateway(readiness: 'ready' | 'untested' | 'unavailable'): LlmGateway {
  return {
    invoke: async (_request: LlmRequest): Promise<LlmResponse> => ({
      content: 'ok',
      provider: 'openai',
    }),
    getReadiness: () => readiness,
    getProvider: () => 'openai',
  };
}

describe('ButlerRuntime', () => {
  it('constructs the standalone runtime and exposes its ButlerAgent', () => {
    const { storage, db } = createStandaloneStorage(':memory:');
    const transport = new StubTransport();
    const runtime = new ButlerRuntime({
      storage,
      clock: {
        now: () => 0,
        isoNow: () => '2026-04-04T00:00:00.000Z',
      },
      transport,
      scheduler: { enabled: false },
      logger: createLogger(),
    });

    assert.equal(runtime.isRunning(), false);
    assert.equal(runtime.getAgent() instanceof ButlerAgent, true);
    db.close();
  });

  it('toggles running state through start and stop and is idempotent', () => {
    const { storage, db } = createStandaloneStorage(':memory:');
    const transport = new StubTransport();
    const runtime = new ButlerRuntime({
      storage,
      clock: {
        now: () => 0,
        isoNow: () => '2026-04-04T00:00:00.000Z',
      },
      transport,
      scheduler: { enabled: false },
      logger: createLogger(),
    });

    runtime.start();
    runtime.start();
    assert.equal(runtime.isRunning(), true);
    assert.equal(transport.startCalls, 1);
    assert.equal(typeof transport.handler, 'function');

    runtime.stop();
    runtime.stop();
    assert.equal(runtime.isRunning(), false);
    assert.equal(transport.stopCalls, 1);

    db.close();
  });

  it('upgrades the persisted mode to steward when an LLM gateway is available', () => {
    const { storage, db } = createStandaloneStorage(':memory:');
    const transport = new StubTransport();

    new ButlerRuntime({
      storage,
      llm: createGateway('untested'),
      clock: {
        now: () => 0,
        isoNow: () => '2026-04-04T00:00:00.000Z',
      },
      transport,
      scheduler: { enabled: false },
      logger: createLogger(),
    });

    assert.equal(storage.state.load()?.mode, 'steward');
    db.close();
  });

  it('keeps the persisted mode reduced when the LLM gateway is unavailable', () => {
    const { storage, db } = createStandaloneStorage(':memory:');
    const transport = new StubTransport();

    const runtime = new ButlerRuntime({
      storage,
      llm: createGateway('unavailable'),
      clock: {
        now: () => 0,
        isoNow: () => '2026-04-04T00:00:00.000Z',
      },
      transport,
      scheduler: { enabled: false },
      logger: createLogger(),
    });

    assert.equal(runtime.getAgent().isReduced(), true);
    assert.equal(storage.state.load()?.mode, 'reduced');
    db.close();
  });

  it('exposes a protocol-backed host in standalone mode and sends outbound messages through the transport', async () => {
    const { storage, db } = createStandaloneStorage(':memory:');
    const transport = new StubTransport();
    const runtime = new ButlerRuntime({
      storage,
      clock: {
        now: () => 0,
        isoNow: () => '2026-04-04T00:00:00.000Z',
      },
      transport,
      scheduler: { enabled: false },
      logger: createLogger(),
    });

    runtime.start();

    const host = (runtime as unknown as { getHost?: () => { askUser?: (question: string, options?: { context?: string }) => Promise<string | null> } }).getHost?.();
    assert.equal(typeof host?.askUser, 'function');

    const pendingAnswer = host?.askUser?.('Need approval?', { context: 'ctx' });
    assert.equal(transport.sentMessages.length, 1);
    assert.equal(transport.sentMessages[0]?.type, 'question');
    assert.equal(transport.sentMessages[0]?.questionText, 'Need approval?');

    const question = transport.sentMessages[0];
    await transport.handler?.({
      type: 'answer',
      id: 'answer-1',
      questionId: question.id,
      answer: 'approved',
    });

    assert.equal(await pendingAnswer, 'approved');

    runtime.stop();
    db.close();
  });
});
