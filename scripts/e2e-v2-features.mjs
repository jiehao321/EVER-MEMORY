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

function storeMemory(content, type, scope, tags = []) {
  const result = app.evermemoryStore({
    content,
    type,
    scope,
    tags,
  });

  assert(result.accepted === true, `Store rejected: ${result.reason ?? 'unknown'}`);
  assert(result.memory?.id, 'Store did not return a memory id');
  return result.memory;
}

let totalSections = 0;
let passedSections = 0;
let allPassed = true;

async function executeSection(label, fn) {
  totalSections += 1;
  const passed = await runSection(label, fn);
  if (passed) {
    passedSections += 1;
  }
  allPassed = passed && allPassed;
}

await executeSection('Dist files exist', () => {
  const requiredFiles = [
    join(rootDir, 'dist', 'index.js'),
    join(rootDir, 'openclaw.plugin.json'),
    join(rootDir, 'plugin.json'),
  ];

  for (const file of requiredFiles) {
    assert(existsSync(file), `Missing ${file.replace(`${rootDir}/`, '')}`);
  }

  return 'dist/index.js, openclaw.plugin.json, plugin.json';
});

if (!allPassed) {
  cleanup();
  console.log(`Summary: ${passedSections}/${totalSections} sections passed`);
  process.exit(1);
}

const { initializeEverMemory } = await import(new URL('../dist/index.js', import.meta.url));

tempDbPath = createTempDbPath('e2e-v2-features');
app = initializeEverMemory({
  databasePath: tempDbPath,
  semantic: { enabled: false },
});

const scope = { userId: 'e2e-v2-user', project: 'e2e-v2-project' };

await executeSection('Schema v18 migration', () => {
  const rows = app.database.connection
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all();
  const tableNames = new Set(rows.map((row) => row.name));
  const expectedTables = [
    'memory_items',
    'memory_relations',
    'graph_stats',
    'retrieval_feedback',
    'preference_drift_log',
    'tuning_overrides',
  ];

  for (const table of expectedTables) {
    assert(tableNames.has(table), `Missing table: ${table}`);
  }

  return `tables=${expectedTables.join(', ')}`;
});

await executeSection('evermemory_edit tool (update + delete)', async () => {
  const memory = storeMemory('Original editable content', 'fact', scope, ['e2e-v2', 'edit']);

  const updated = await app.evermemoryEdit({
    memoryId: memory.id,
    action: 'update',
    newContent: 'Updated content',
    callerScope: scope,
  });

  assert(updated.success === true, `Update failed: ${updated.error ?? 'unknown'}`);
  assert(updated.current?.content === 'Updated content', 'Updated content was not persisted');

  const deleted = await app.evermemoryEdit({
    memoryId: memory.id,
    action: 'delete',
    callerScope: scope,
  });

  assert(deleted.success === true, `Delete failed: ${deleted.error ?? 'unknown'}`);
  assert(deleted.current === null, 'Deleted memory should return current=null');

  return `updated=${updated.current?.id ?? memory.id} deleted`;
});

await executeSection('evermemory_browse tool', () => {
  const browseScope = { userId: 'e2e-v2-browse-user', project: 'e2e-v2-browse-project' };
  const entries = [
    ['Browse fact one', 'fact'],
    ['Browse preference one', 'preference'],
    ['Browse project one', 'project'],
    ['Browse fact two', 'fact'],
    ['Browse preference two', 'preference'],
  ];

  for (const [content, type] of entries) {
    storeMemory(content, type, browseScope, ['e2e-v2', 'browse']);
  }

  const result = app.evermemoryBrowse({
    type: 'preference',
    limit: 10,
    sortBy: 'recent',
    scope: browseScope,
  });

  assert(result.items.length >= 2, `Expected at least 2 preferences, got ${result.items.length}`);
  assert(result.items.every((item) => item.type === 'preference'), 'Browse returned a non-preference item');

  return `preferences=${result.items.length}`;
});

await executeSection('evermemory_relations tool (add + list + graph)', () => {
  const relationScope = { userId: 'e2e-v2-rel-user', project: 'e2e-v2-rel-project' };
  const left = storeMemory('Relations source memory', 'fact', relationScope, ['e2e-v2', 'relations']);
  const right = storeMemory('Relations target memory', 'fact', relationScope, ['e2e-v2', 'relations']);

  const added = app.evermemoryRelations({
    action: 'add',
    memoryId: left.id,
    targetId: right.id,
    relationType: 'supports',
    confidence: 0.9,
  });

  assert(added.added, 'Relation add did not return an added relation');

  const listed = app.evermemoryRelations({
    action: 'list',
    memoryId: left.id,
  });

  assert((listed.relations?.length ?? 0) >= 1, 'Expected at least one listed relation');

  const graph = app.evermemoryRelations({
    action: 'graph',
    memoryId: left.id,
    depth: 1,
  });

  assert(Array.isArray(graph.graph), 'Graph response must be an array');

  return `relations=${listed.relations.length} graph=${graph.graph.length}`;
});

await executeSection('Contradiction monitor', () => {
  const contradictionScope = { userId: 'e2e-v2-contr-user', project: 'e2e-v2-contr-project' };
  const first = storeMemory('User prefers dark mode.', 'preference', contradictionScope, ['e2e-v2', 'contradiction']);
  const second = storeMemory('User prefers light mode.', 'preference', contradictionScope, ['e2e-v2', 'contradiction']);

  const relation = app.evermemoryRelations({
    action: 'add',
    memoryId: first.id,
    targetId: second.id,
    relationType: 'contradicts',
    confidence: 0.8,
  });

  assert(relation.added, 'Failed to add contradicts relation');

  if (typeof app.contradictionMonitor?.checkForContradictions === 'function') {
    const refreshed = app.memoryRepo.findById(first.id);
    assert(refreshed, 'Stored contradiction memory could not be reloaded');
    const alerts = app.contradictionMonitor.checkForContradictions('e2e-v2-contradiction-session', refreshed);
    assert(Array.isArray(alerts), 'Contradiction monitor did not return an array');
    return `alerts=${alerts.length}`;
  }

  return 'monitor unavailable, relation add verified';
});

await executeSection('Memory compression service', () => {
  const compressionScope = { userId: 'e2e-v2-compress-user', project: 'e2e-v2-compress-project' };
  const contents = [
    'Release checklist fact alpha owner Alex weekly sync milestone.',
    'Release checklist fact beta owner Alex weekly sync milestone.',
    'Release checklist fact gamma owner Alex weekly sync milestone.',
    'Release checklist fact delta owner Alex weekly sync milestone.',
    'Release checklist fact epsilon owner Alex weekly sync milestone.',
  ];

  for (const content of contents) {
    storeMemory(content, 'fact', compressionScope, ['e2e-v2', 'compression']);
  }

  if (app.compressionService && typeof app.compressionService.compress === 'function') {
    const result = app.compressionService.compress({ scope: compressionScope, dryRun: true });
    assert(typeof result.clustersFound === 'number', 'Compression result missing clustersFound');
    assert(typeof result.memoriesCompressed === 'number', 'Compression result missing memoriesCompressed');
    return `clusters=${result.clustersFound} dryRun=true`;
  }

  app.database.connection
    .prepare('SELECT compressed_from_json, compression_level FROM memory_items LIMIT 0')
    .run();

  return 'compression columns verified';
});

await executeSection('Full lifecycle with new features', async () => {
  const lifecycleScope = { userId: 'e2e-v2-life-user', project: 'e2e-v2-life-project' };
  const sessionId = 'e2e-v2-session';
  const start = app.sessionStart({
    sessionId,
    userId: lifecycleScope.userId,
    project: lifecycleScope.project,
    channel: 'test',
  });

  assert(start.sessionId === sessionId, 'sessionStart returned an unexpected sessionId');

  storeMemory('Lifecycle memory one: prefers concise status updates.', 'preference', lifecycleScope, ['e2e-v2', 'lifecycle']);
  storeMemory('Lifecycle memory two: project codename is Atlas.', 'project', lifecycleScope, ['e2e-v2', 'lifecycle']);
  const recalledMemory = storeMemory(
    'Lifecycle memory three: deployment owner is Morgan.',
    'fact',
    lifecycleScope,
    ['e2e-v2', 'lifecycle'],
  );

  const message = await app.messageReceived({
    sessionId,
    messageId: 'e2e-v2-message',
    text: 'Who is the deployment owner for Atlas?',
    scope: lifecycleScope,
    channel: 'test',
    recallLimit: 5,
  });

  assert(message.intent && typeof message.intent === 'object', 'messageReceived result missing intent');
  assert(message.recall && typeof message.recall === 'object', 'messageReceived result missing recall');
  assert(Array.isArray(message.behaviorRules ?? []), 'messageReceived behaviorRules must be an array');
  assert(message.recall.total >= 1, 'messageReceived recall returned no items');
  assert(
    message.recall.items.some((item) => item.id === recalledMemory.id || item.content.includes('deployment owner is Morgan')),
    'messageReceived recall did not include the expected memory',
  );

  const end = await app.sessionEnd({
    sessionId,
    messageId: 'e2e-v2-message',
    scope: lifecycleScope,
    channel: 'test',
    inputText: 'Who is the deployment owner for Atlas?',
    actionSummary: 'Checked deployment ownership.',
    outcomeSummary: 'Confirmed Morgan owns deployment.',
  });

  assert(end.sessionId === sessionId, 'sessionEnd returned an unexpected sessionId');

  return `recalled=${message.recall.total} autoMemory=${end.autoMemory?.accepted ?? 0}`;
});

await executeSection('Status includes new dimensions', () => {
  const status = app.evermemoryStatus({ userId: scope.userId });

  assert(typeof status.memoryCount === 'number', 'status.memoryCount must be a number');
  assert(typeof status.databasePath === 'string', 'status.databasePath must be a string');
  assert(typeof status.semanticStatus === 'string', 'status.semanticStatus must be a string');
  assert('atRiskMemories' in status, 'status.atRiskMemories must exist');

  return `memoryCount=${status.memoryCount} semantic=${status.semanticStatus}`;
});

cleanup();
console.log(`Summary: ${passedSections}/${totalSections} sections passed`);
process.exit(allPassed ? 0 : 1);
