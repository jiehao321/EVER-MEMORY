/**
 * RC3: Lifecycle tiering tests.
 * - Per-sourceGrade stale thresholds (derived=14d, inferred=21d, primary=30d)
 * - summary/project count limits per project
 * - Briefing access (accessCount) does NOT protect from archival; only retrievalCount does
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { initializeEverMemory } from '../../../src/index.js';
import type { MemoryItem, MemoryScope, SourceGrade } from '../../../src/types.js';
import { createTempDbPath } from '../../helpers.js';

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

function makeMemory(
  scope: MemoryScope,
  content: string,
  overrides: Partial<MemoryItem> = {},
): MemoryItem {
  const ts = overrides.timestamps?.updatedAt ?? new Date().toISOString();
  return {
    id: overrides.id ?? randomUUID(),
    content,
    type: overrides.type ?? 'fact',
    lifecycle: overrides.lifecycle ?? 'episodic',
    source: overrides.source ?? { kind: 'manual', actor: 'user' },
    scope,
    scores: overrides.scores ?? { confidence: 0.8, importance: 0.5, explicitness: 0.8 },
    timestamps: {
      createdAt: overrides.timestamps?.createdAt ?? ts,
      updatedAt: ts,
      lastAccessedAt: overrides.timestamps?.lastAccessedAt,
    },
    state: overrides.state ?? { active: true, archived: false },
    evidence: overrides.evidence ?? { references: [] },
    tags: overrides.tags ?? [],
    relatedEntities: overrides.relatedEntities ?? [],
    sourceGrade: (overrides.sourceGrade ?? 'primary') as SourceGrade,
    stats: overrides.stats ?? { accessCount: 0, retrievalCount: 0 },
  };
}

// ─── Stale threshold per sourceGrade ─────────────────────────────────────────

test('RC3: derived memory archived after 14 days (not 30)', async () => {
  const dbPath = createTempDbPath('rc3-derived-threshold');
  const app = initializeEverMemory({ databasePath: dbPath });
  const scope: MemoryScope = { userId: 'u-rc3-1', project: 'rc3' };

  // 20 days ago → past derived threshold (14d) but under primary threshold (30d)
  const staleTs = daysAgo(20);
  app.memoryRepo.insert(makeMemory(scope, 'derived memory 20 days old', {
    id: 'derived-stale',
    sourceGrade: 'derived',
    timestamps: { createdAt: staleTs, updatedAt: staleTs, lastAccessedAt: staleTs },
    stats: { accessCount: 0, retrievalCount: 0 },
  }));

  const result = await app.housekeeping(scope);
  assert.ok(result.archivedCount >= 1, 'derived memory should be archived after 14d');

  const after = app.memoryRepo.findById('derived-stale');
  assert.equal(after?.state.archived, true);

  app.database.connection.close();
  rmSync(dbPath, { force: true });
});

test('RC3: primary memory NOT archived at 20 days (threshold is 30d)', async () => {
  const dbPath = createTempDbPath('rc3-primary-threshold');
  const app = initializeEverMemory({ databasePath: dbPath });
  const scope: MemoryScope = { userId: 'u-rc3-2', project: 'rc3' };

  const ts = daysAgo(20);
  app.memoryRepo.insert(makeMemory(scope, 'primary memory 20 days old', {
    id: 'primary-fresh',
    sourceGrade: 'primary',
    timestamps: { createdAt: ts, updatedAt: ts, lastAccessedAt: ts },
    stats: { accessCount: 0, retrievalCount: 0 },
  }));

  const result = await app.housekeeping(scope);
  assert.equal(result.archivedCount, 0, 'primary memory should NOT be archived at 20d');

  const after = app.memoryRepo.findById('primary-fresh');
  assert.equal(after?.state.archived, false);

  app.database.connection.close();
  rmSync(dbPath, { force: true });
});

test('RC3: inferred memory archived after 21 days but not at 18 days', async () => {
  const dbPath = createTempDbPath('rc3-inferred-threshold');
  const app = initializeEverMemory({ databasePath: dbPath });
  const scope: MemoryScope = { userId: 'u-rc3-3', project: 'rc3' };

  const ts22 = daysAgo(22);
  const ts18 = daysAgo(18);

  app.memoryRepo.insert(makeMemory(scope, 'inferred stale 22d', {
    id: 'inferred-stale',
    sourceGrade: 'inferred',
    timestamps: { createdAt: ts22, updatedAt: ts22, lastAccessedAt: ts22 },
    stats: { accessCount: 0, retrievalCount: 0 },
  }));

  app.memoryRepo.insert(makeMemory(scope, 'inferred fresh 18d', {
    id: 'inferred-fresh',
    sourceGrade: 'inferred',
    timestamps: { createdAt: ts18, updatedAt: ts18, lastAccessedAt: ts18 },
    stats: { accessCount: 0, retrievalCount: 0 },
  }));

  await app.housekeeping(scope);

  assert.equal(app.memoryRepo.findById('inferred-stale')?.state.archived, true, '22d inferred should be archived');
  assert.equal(app.memoryRepo.findById('inferred-fresh')?.state.archived, false, '18d inferred should NOT be archived');

  app.database.connection.close();
  rmSync(dbPath, { force: true });
});

// ─── Briefing access does not protect from archival ───────────────────────────

test('RC3: briefing-only access (accessCount>0 retrievalCount=0) does not protect from archival', async () => {
  const dbPath = createTempDbPath('rc3-briefing-exempt');
  const app = initializeEverMemory({ databasePath: dbPath });
  const scope: MemoryScope = { userId: 'u-rc3-4', project: 'rc3' };

  const staleTs = daysAgo(35);
  app.memoryRepo.insert(makeMemory(scope, 'briefing-only accessed memory', {
    id: 'briefing-only',
    sourceGrade: 'primary',
    timestamps: { createdAt: staleTs, updatedAt: staleTs, lastAccessedAt: staleTs },
    // High accessCount from briefing, but zero retrievalCount (never explicitly recalled)
    stats: { accessCount: 5, retrievalCount: 0 },
  }));

  const result = await app.housekeeping(scope);
  assert.ok(result.archivedCount >= 1, 'briefing-only memory should be archived despite high accessCount');

  const after = app.memoryRepo.findById('briefing-only');
  assert.equal(after?.state.archived, true);

  app.database.connection.close();
  rmSync(dbPath, { force: true });
});

test('RC3: memory with retrievalCount>=1 is protected from archival', async () => {
  const dbPath = createTempDbPath('rc3-retrieval-protects');
  const app = initializeEverMemory({ databasePath: dbPath });
  const scope: MemoryScope = { userId: 'u-rc3-5', project: 'rc3' };

  const staleTs = daysAgo(35);
  app.memoryRepo.insert(makeMemory(scope, 'explicitly recalled memory', {
    id: 'recalled-once',
    sourceGrade: 'primary',
    timestamps: { createdAt: staleTs, updatedAt: staleTs, lastAccessedAt: staleTs },
    stats: { accessCount: 1, retrievalCount: 1 },
  }));

  const result = await app.housekeeping(scope);
  assert.equal(result.archivedCount, 0, 'explicitly recalled memory should NOT be archived');

  const after = app.memoryRepo.findById('recalled-once');
  assert.equal(after?.state.archived, false);

  app.database.connection.close();
  rmSync(dbPath, { force: true });
});

// ─── Kind limits per project ──────────────────────────────────────────────────

test('RC3: summary memories beyond limit (3) are archived oldest-first', async () => {
  const dbPath = createTempDbPath('rc3-summary-limit');
  const app = initializeEverMemory({ databasePath: dbPath });
  const scope: MemoryScope = { userId: 'u-rc3-6', project: 'rc3' };

  // Insert 5 summary memories with distinct dates
  for (let i = 1; i <= 5; i++) {
    app.memoryRepo.insert(makeMemory(scope, `summary ${i}`, {
      id: `summary-${i}`,
      type: 'summary',
      lifecycle: 'semantic',
      timestamps: {
        createdAt: new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      stats: { accessCount: 0, retrievalCount: 0 },
    }));
  }

  const result = await app.housekeeping(scope);
  assert.equal(result.kindLimitArchivedCount, 2, '2 oldest summaries archived to reach limit of 3');

  // summary-1 and summary-2 (oldest) should be archived
  assert.equal(app.memoryRepo.findById('summary-1')?.state.archived, true);
  assert.equal(app.memoryRepo.findById('summary-2')?.state.archived, true);
  // summary-3, 4, 5 should remain active
  assert.equal(app.memoryRepo.findById('summary-3')?.state.archived, false);
  assert.equal(app.memoryRepo.findById('summary-4')?.state.archived, false);
  assert.equal(app.memoryRepo.findById('summary-5')?.state.archived, false);

  app.database.connection.close();
  rmSync(dbPath, { force: true });
});

test('RC3: project memories beyond limit (5) are archived oldest-first', async () => {
  const dbPath = createTempDbPath('rc3-project-limit');
  const app = initializeEverMemory({ databasePath: dbPath });
  const scope: MemoryScope = { userId: 'u-rc3-7', project: 'rc3' };

  for (let i = 1; i <= 7; i++) {
    app.memoryRepo.insert(makeMemory(scope, `project state ${i}`, {
      id: `project-${i}`,
      type: 'project',
      lifecycle: 'episodic',
      timestamps: {
        createdAt: new Date(Date.now() - (8 - i) * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      },
      stats: { accessCount: 0, retrievalCount: 0 },
    }));
  }

  const result = await app.housekeeping(scope);
  assert.equal(result.kindLimitArchivedCount, 2, '2 oldest project memories archived to reach limit of 5');

  assert.equal(app.memoryRepo.findById('project-1')?.state.archived, true);
  assert.equal(app.memoryRepo.findById('project-2')?.state.archived, true);
  assert.equal(app.memoryRepo.findById('project-3')?.state.archived, false);

  app.database.connection.close();
  rmSync(dbPath, { force: true });
});

test('RC3: kind limits not triggered when count is within bounds', async () => {
  const dbPath = createTempDbPath('rc3-kind-within-bounds');
  const app = initializeEverMemory({ databasePath: dbPath });
  const scope: MemoryScope = { userId: 'u-rc3-8', project: 'rc3' };

  for (let i = 1; i <= 3; i++) {
    app.memoryRepo.insert(makeMemory(scope, `summary ${i}`, {
      id: `s-${i}`, type: 'summary', lifecycle: 'semantic',
      stats: { accessCount: 0, retrievalCount: 0 },
    }));
  }

  const result = await app.housekeeping(scope);
  assert.equal(result.kindLimitArchivedCount, 0, 'no archival when at or below limit');

  app.database.connection.close();
  rmSync(dbPath, { force: true });
});
