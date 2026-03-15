#!/usr/bin/env node
import process from 'node:process';

const limits = {
  sessionStart: 100,
  messageReceived: 200,
  sessionEnd: 500,
};

const scope = {
  userId: 'perf-user',
  chatId: 'perf-chat',
  project: 'perf-project',
};

const seedTypes = ['project', 'decision', 'task', 'constraint', 'preference'];

function median(times) {
  const sorted = [...times].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

async function measure(fn, runs = 5) {
  const times = [];
  for (let index = 0; index < runs; index += 1) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  return median(times);
}

function formatLine(label, ms, limit) {
  const status = ms < limit ? '✓' : '✗';
  return `${label.padEnd(18)} ${ms.toFixed(1)}ms (limit: ${limit}ms) ${status}`;
}

function formatBulkLine(label, totalMs, count) {
  return `${label.padEnd(18)} ${totalMs.toFixed(1)}ms (${(totalMs / count).toFixed(1)}ms/op)`;
}

async function loadInitializer() {
  try {
    const module = await import('../dist/index.js');
    if (typeof module.initializeEverMemory !== 'function') {
      throw new Error('dist build does not export initializeEverMemory');
    }
    return module.initializeEverMemory;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[evermemory:perf-benchmark] failed to load ../dist/index.js: ${detail}`);
    console.error('[evermemory:perf-benchmark] run `npm run build` first');
    process.exit(1);
  }
}

const initializeEverMemory = await loadInitializer();
const app = initializeEverMemory({ databasePath: ':memory:' });
let sequence = 0;

function nextId(prefix) {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

function seedMemories(count = 50) {
  for (let index = 0; index < count; index += 1) {
    const result = app.evermemoryStore({
      content: `性能基准记忆 ${index + 1}：项目 Apollo 当前状态、约束、决策与偏好摘要。`,
      type: seedTypes[index % seedTypes.length],
      scope,
      tags: ['perf', `seed-${index % 10}`],
    });
    if (!result.accepted) {
      throw new Error(`failed to seed memory ${index + 1}: ${result.reason ?? 'unknown'}`);
    }
  }
}

async function prepareSession(sessionId) {
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

async function main() {
  try {
    seedMemories();

    const sessionStartMs = await measure(() => {
      app.sessionStart({
        ...scope,
        sessionId: nextId('start-session'),
        channel: 'test',
      });
    });

    const messageReceivedMs = await measure(async () => {
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

    const sessionEndMs = await measure(async () => {
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

    const storeTotalMs = await measure(() => {
      for (let index = 0; index < 100; index += 1) {
        app.evermemoryStore({
          content: `批量写入性能测试 ${nextId('store')}：记录当前项目状态和执行偏好。`,
          type: seedTypes[index % seedTypes.length],
          scope,
          tags: ['perf', 'bulk-store'],
        });
      }
    });

    const recallTotalMs = await measure(async () => {
      for (let index = 0; index < 100; index += 1) {
        await app.evermemoryRecall({
          query: '项目状态 下一步 决策',
          scope,
          limit: 5,
        });
      }
    });

    const pass = sessionStartMs < limits.sessionStart
      && messageReceivedMs < limits.messageReceived
      && sessionEndMs < limits.sessionEnd;

    console.log('EverMemory Performance Benchmark');
    console.log('================================');
    console.log(formatLine('sessionStart:', sessionStartMs, limits.sessionStart));
    console.log(formatLine('messageReceived:', messageReceivedMs, limits.messageReceived));
    console.log(formatLine('sessionEnd:', sessionEndMs, limits.sessionEnd));
    console.log(formatBulkLine('store (x100):', storeTotalMs, 100));
    console.log(formatBulkLine('recall (x100):', recallTotalMs, 100));
    console.log('================================');
    console.log(`Result: ${pass ? 'PASS' : 'FAIL'}`);

    app.database.connection.close();
    if (!pass) {
      process.exit(1);
    }
  } catch (error) {
    app.database.connection.close();
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[evermemory:perf-benchmark] ${detail}`);
    process.exit(1);
  }
}

await main();
