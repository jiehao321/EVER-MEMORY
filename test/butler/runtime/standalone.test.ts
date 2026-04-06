import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ButlerTransport } from '../../../src/core/butler/transports/types.js';
import type { ButlerMessage } from '../../../src/core/butler/protocol/types.js';
import { ButlerAgent } from '../../../src/core/butler/agent.js';
import { createStandaloneStorage } from '../../../src/core/butler/adapters/sqlite.js';
import { ButlerRuntime } from '../../../src/core/butler/runtime/standalone.js';

class StubTransport implements ButlerTransport {
  public startCalls = 0;
  public stopCalls = 0;
  public handler?: (message: ButlerMessage) => Promise<ButlerMessage | null>;

  start(onMessage: (message: ButlerMessage) => Promise<ButlerMessage | null>): void {
    this.startCalls += 1;
    this.handler = onMessage;
  }

  send(_message: ButlerMessage): void {
    return undefined;
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
});
