#!/usr/bin/env node
import process from 'node:process';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.EVERMEMORY_EMBEDDING_PROVIDER = 'none';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(scriptDir);
const distDir = join(rootDir, 'dist');

if (!existsSync(distDir)) {
  console.error('Run npm run build first');
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createTempDbPath(name) {
  const dir = join(
    tmpdir(),
    `evermemory-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(dir, { recursive: true });
  return join(dir, 'evermemory.db');
}

function formatResult(ok, label, elapsedMs, detail) {
  const mark = ok ? '✓' : '✗';
  const suffix = detail ? ` ${detail}` : '';
  return `${mark} ${label} (${elapsedMs.toFixed(1)}ms)${suffix}`;
}

let app;
let tempDbPath;
let cleanedUp = false;

function cleanup() {
  if (cleanedUp) {
    return;
  }
  cleanedUp = true;

  try {
    app?.database?.connection?.close();
  } catch {}

  try {
    if (tempDbPath) {
      rmSync(dirname(tempDbPath), { recursive: true, force: true });
    }
  } catch {}
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    cleanup();
    process.exit(1);
  });
}
process.on('exit', cleanup);

async function runSection(label, fn) {
  const startedAt = performance.now();
  try {
    const detail = await fn();
    console.log(formatResult(true, label, performance.now() - startedAt, detail));
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(formatResult(false, label, performance.now() - startedAt, message));
    return false;
  }
}

let allPassed = true;

allPassed = (await runSection('Dist files exist', () => {
  const requiredFiles = [
    join(rootDir, 'dist', 'index.js'),
    join(rootDir, 'openclaw.plugin.json'),
    join(rootDir, 'plugin.json'),
  ];

  for (const file of requiredFiles) {
    assert(existsSync(file), `Missing ${file.replace(`${rootDir}/`, '')}`);
  }

  return 'dist/index.js, openclaw.plugin.json, plugin.json';
})) && allPassed;

if (!allPassed) {
  cleanup();
  process.exit(1);
}

const { initializeEverMemory } = await import(new URL('../dist/index.js', import.meta.url));

tempDbPath = createTempDbPath('e2e-smoke');
app = initializeEverMemory({
  databasePath: tempDbPath,
  semantic: { enabled: false },
});

const scope = { userId: 'e2e-smoke-user', project: 'e2e-smoke-project' };

allPassed = (await runSection('Store and recall memory', async () => {
  const content = 'E2E smoke memory: release checklist owner is Alex.';
  const stored = app.evermemoryStore({
    content,
    type: 'fact',
    scope,
    tags: ['e2e-smoke'],
  });

  assert(stored.accepted === true, `Store rejected: ${stored.reason ?? 'unknown'}`);
  const recalled = await app.evermemoryRecall({
    query: 'release checklist owner Alex',
    scope,
    mode: 'keyword',
    limit: 5,
  });

  assert(recalled.total >= 1, 'Expected at least one recalled memory');
  assert(
    recalled.items.some((item) => item.content === content),
    'Stored memory was not returned by recall',
  );

  return `matched ${recalled.total} item(s)`;
})) && allPassed;

allPassed = (await runSection('Status returns valid data', () => {
  const status = app.evermemoryStatus({ userId: scope.userId });

  assert(typeof status.memoryCount === 'number', 'status.memoryCount must be a number');
  assert(status.memoryCount >= 1, 'status.memoryCount must be >= 1');
  assert(typeof status.databasePath === 'string', 'status.databasePath must be a string');
  assert(typeof status.activeMemoryCount === 'number', 'status.activeMemoryCount must be a number');

  return `memoryCount=${status.memoryCount}`;
})) && allPassed;

allPassed = (await runSection('Performance thresholds', async () => {
  for (let index = 0; index < 100; index += 1) {
    const result = app.evermemoryStore({
      content: `E2E performance memory ${index + 1}: smoke benchmark content.`,
      type: index % 2 === 0 ? 'fact' : 'project',
      scope,
      tags: ['e2e-smoke', 'perf'],
    });
    assert(result.accepted === true, `Bulk store failed at item ${index + 1}`);
  }

  const recallStart = performance.now();
  const recall = await app.evermemoryRecall({
    query: 'smoke benchmark content',
    scope,
    mode: 'keyword',
    limit: 10,
  });
  const recallMs = performance.now() - recallStart;

  const statusStart = performance.now();
  const status = app.evermemoryStatus({ userId: scope.userId });
  const statusMs = performance.now() - statusStart;

  assert(recall.total >= 1, 'Performance recall returned no items');
  assert(status.memoryCount >= 101, `Expected >= 101 memories, got ${status.memoryCount}`);
  assert(recallMs < 300, `Recall too slow: ${recallMs.toFixed(1)}ms`);
  assert(statusMs < 100, `Status too slow: ${statusMs.toFixed(1)}ms`);

  return `recall=${recallMs.toFixed(1)}ms status=${statusMs.toFixed(1)}ms`;
})) && allPassed;

allPassed = (await runSection('Hybrid recall falls back gracefully', async () => {
  const result = await app.evermemoryRecall({
    query: 'release checklist owner',
    scope,
    mode: 'hybrid',
    limit: 5,
  });

  assert(result.strategyUsed === 'keyword', `Expected keyword fallback, got ${result.strategyUsed}`);
  assert(result.semanticFallback === true, 'Expected semanticFallback=true');
  assert(result.degradedReason === 'semantic_disabled', `Unexpected degradedReason: ${result.degradedReason}`);

  return `strategy=${result.strategyUsed}`;
})) && allPassed;

cleanup();
process.exit(allPassed ? 0 : 1);
