import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { initializeEverMemory } from '../../src/index.js';

const scope = {
  userId: 'perf-user',
  chatId: 'perf-chat',
  project: 'perf-project',
};

const limits = {
  sessionStart: 100,
  messageReceived: 200,
  sessionEnd: 500,
};

const seedTypes = ['project', 'decision', 'task', 'constraint', 'preference'] as const;

function median(times: number[]): number {
  const sorted = [...times].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

async function measure(fn: () => Promise<void> | void, runs = 5): Promise<number> {
  const times: number[] = [];
  for (let index = 0; index < runs; index += 1) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  return median(times);
}

describe('Performance Benchmark', () => {
  const app = initializeEverMemory({ databasePath: ':memory:' });
  let sequence = 0;

  function nextId(prefix: string): string {
    sequence += 1;
    return `${prefix}-${sequence}`;
  }

  function seedMemories(count = 50): void {
    for (let index = 0; index < count; index += 1) {
      const stored = app.evermemoryStore({
        content: `性能基准记忆 ${index + 1}：项目 Apollo 当前状态、约束、决策与偏好摘要。`,
        type: seedTypes[index % seedTypes.length],
        scope,
        tags: ['perf', `seed-${index % 10}`],
      });
      assert.equal(stored.accepted, true, `seed memory ${index + 1} should be accepted`);
    }
  }

  async function prepareSession(sessionId: string): Promise<void> {
    app.sessionStart({
      ...scope,
      sessionId,
      channel: 'test',
    });
    await app.messageReceived({
      text: '我需要查看项目状态并确认下一步计划。',
      sessionId,
      messageId: nextId('prep-msg'),
      scope,
      recallLimit: 5,
      channel: 'test',
    });
  }

  before(() => {
    seedMemories();
  });

  after(() => {
    app.database.connection.close();
  });

  it('sessionStart completes within 100ms', async () => {
    const ms = await measure(() => {
      app.sessionStart({
        ...scope,
        sessionId: nextId('start-session'),
        channel: 'test',
      });
    });
    console.log(`sessionStart median: ${ms.toFixed(1)}ms`);
    assert.ok(ms < limits.sessionStart, `sessionStart too slow: ${ms.toFixed(1)}ms > ${limits.sessionStart}ms`);
  });

  it('messageReceived completes within 200ms', async () => {
    const ms = await measure(async () => {
      const sessionId = nextId('message-session');
      app.sessionStart({
        ...scope,
        sessionId,
        channel: 'test',
      });
      await app.messageReceived({
        text: '我需要查看项目状态',
        sessionId,
        messageId: nextId('message'),
        scope,
        recallLimit: 5,
        channel: 'test',
      });
    });
    console.log(`messageReceived median: ${ms.toFixed(1)}ms`);
    assert.ok(ms < limits.messageReceived, `messageReceived too slow: ${ms.toFixed(1)}ms > ${limits.messageReceived}ms`);
  });

  it('sessionEnd completes within 500ms', async () => {
    const ms = await measure(async () => {
      const sessionId = nextId('end-session');
      await prepareSession(sessionId);
      await app.sessionEnd({
        sessionId,
        messageId: nextId('end-message'),
        scope,
        channel: 'test',
        inputText: '测试性能',
        actionSummary: '执行了性能测试',
        outcomeSummary: '测试完成',
      });
    });
    console.log(`sessionEnd median: ${ms.toFixed(1)}ms`);
    assert.ok(ms < limits.sessionEnd, `sessionEnd too slow: ${ms.toFixed(1)}ms > ${limits.sessionEnd}ms`);
  });
});
