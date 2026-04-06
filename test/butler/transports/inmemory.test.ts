import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InMemoryTransport } from '../../../src/core/butler/transports/inmemory.js';
import type { ButlerMessage } from '../../../src/core/butler/protocol/types.js';

describe('InMemoryTransport', () => {
  it('ingests messages through the registered handler', async () => {
    const received: ButlerMessage[] = [];
    const transport = new InMemoryTransport();
    transport.start(async (message: ButlerMessage) => {
      received.push(message);
      return {
        type: 'status',
        id: 'status-1',
        status: {
          mode: 'reduced',
          uptime: 1,
          totalCycles: 2,
          pendingTasks: 3,
          activeGoals: 4,
          activeInsights: 5,
        },
      };
    });

    const response = await transport.ingest({
      type: 'shutdown',
      id: 'shutdown-1',
      reason: 'test',
    });

    assert.equal(received.length, 1);
    assert.equal(received[0]?.type, 'shutdown');
    assert.equal(response?.type, 'status');
  });

  it('treats send as a no-op', () => {
    const transport = new InMemoryTransport();

    assert.doesNotThrow(() => {
      transport.send({
        type: 'status',
        id: 'status-1',
        status: {
          mode: 'reduced',
          uptime: 0,
          totalCycles: 0,
          pendingTasks: 0,
          activeGoals: 0,
          activeInsights: 0,
        },
      });
    });
  });

  it('returns null after stop clears the handler', async () => {
    const transport = new InMemoryTransport();
    transport.start(async () => ({
      type: 'shutdown',
      id: 'shutdown-1',
    }));
    transport.stop();

    const response = await transport.ingest({
      type: 'shutdown',
      id: 'shutdown-2',
    });

    assert.equal(response, null);
  });
});
