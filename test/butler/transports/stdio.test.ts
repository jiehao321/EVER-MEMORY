import assert from 'node:assert/strict';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, it } from 'node:test';
import { StdioTransport } from '../../../src/core/butler/transports/stdio.js';
import type { ButlerMessage } from '../../../src/core/butler/protocol/types.js';

function createLogger() {
  return {
    info: (_message: string, _meta?: Record<string, unknown>) => undefined,
    warn: (_message: string, _meta?: Record<string, unknown>) => undefined,
    error: (_message: string, _meta?: Record<string, unknown>) => undefined,
    debug: (_message: string, _meta?: Record<string, unknown>) => undefined,
  };
}

describe('StdioTransport', () => {
  it('reads JSON lines, calls the handler, and writes JSON line responses', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const received: ButlerMessage[] = [];
    const transport = new StdioTransport(input, output, createLogger());
    transport.start(async (message: ButlerMessage) => {
      received.push(message);
      return {
        type: 'status',
        id: 'status-1',
        status: {
          mode: 'steward',
          uptime: 10,
          totalCycles: 11,
          pendingTasks: 12,
          activeGoals: 13,
          activeInsights: 14,
        },
      };
    });

    const outputPromise = once(output, 'data');
    input.write(`${JSON.stringify({ type: 'shutdown', id: 'shutdown-1', reason: 'test' })}\n`);
    const [chunk] = await outputPromise;
    const parsed = JSON.parse(chunk.toString()) as ButlerMessage;

    assert.equal(received.length, 1);
    assert.equal(received[0]?.type, 'shutdown');
    assert.deepEqual(parsed, {
      type: 'status',
      id: 'status-1',
      status: {
        mode: 'steward',
        uptime: 10,
        totalCycles: 11,
        pendingTasks: 12,
        activeGoals: 13,
        activeInsights: 14,
      },
    });
  });

  it('ignores empty lines and invalid JSON', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let calls = 0;
    const transport = new StdioTransport(input, output, createLogger());
    transport.start(async () => {
      calls += 1;
      return null;
    });

    input.write('\n');
    input.write('not-json\n');
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(calls, 0);
    assert.equal(output.read(), null);
  });
});
