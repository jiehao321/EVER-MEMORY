import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { initializeEverMemory } from '../src/index.js';
import type { MemoryItem } from '../src/types.js';
import { createTempDbPath } from './helpers.js';

function createMemory(input: {
  content: string;
  scope: MemoryItem['scope'];
  updatedAt: string;
  type?: MemoryItem['type'];
  lifecycle?: MemoryItem['lifecycle'];
}): MemoryItem {
  return {
    id: randomUUID(),
    content: input.content,
    type: input.type ?? 'fact',
    lifecycle: input.lifecycle ?? 'semantic',
    source: {
      kind: 'manual',
      actor: 'system',
    },
    scope: input.scope,
    scores: {
      confidence: 0.85,
      importance: 0.8,
      explicitness: 0.95,
    },
    timestamps: {
      createdAt: input.updatedAt,
      updatedAt: input.updatedAt,
    },
    state: {
      active: true,
      archived: false,
    },
    evidence: {
      references: [],
    },
    tags: [],
    relatedEntities: [],
    stats: {
      accessCount: 0,
      retrievalCount: 0,
    },
  };
}

test('evermemory_profile supports recompute and stored/latest read paths', () => {
  const databasePath = createTempDbPath('tool-profile');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({
    content: '请记住：我偏好中文输出，结论先行。',
    type: 'preference',
    scope: { userId: 'u-tool-profile-1' },
    tags: ['language'],
  });

  const recomputed = app.evermemoryProfile({
    userId: 'u-tool-profile-1',
    recompute: true,
  });
  assert.equal(recomputed.source, 'recomputed');
  assert.ok(recomputed.profile);
  assert.equal(recomputed.profile?.stable.explicitPreferences.language.value, 'zh');
  assert.equal(recomputed.summary?.derivedGuardrail, 'weak_hint_only');

  const stored = app.evermemoryProfile({
    userId: 'u-tool-profile-1',
  });
  assert.equal(stored.source, 'stored');
  assert.ok(stored.profile);
  assert.ok((stored.summary?.stableCanonicalFields ?? 0) >= 1);

  const missing = app.evermemoryProfile({
    userId: 'u-tool-profile-missing',
  });
  assert.equal(missing.source, 'none');
  assert.equal(missing.profile, null);

  const latest = app.evermemoryProfile();
  assert.equal(latest.source, 'latest');
  assert.equal(latest.profile?.userId, 'u-tool-profile-1');

  const status = app.evermemoryStatus({ userId: 'u-tool-profile-1' });
  assert.equal(status.latestProfile?.stableCanonicalFields?.explicitPreferences.language.value, 'zh');
  assert.equal(status.latestProfile?.stableCanonicalFields?.explicitPreferences.language.canonical, true);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('evermemory_consolidate runs lifecycle maintenance in manual mode', async () => {
  const databasePath = createTempDbPath('tool-consolidate');
  const app = initializeEverMemory({ databasePath });
  const nowIso = new Date().toISOString();
  const staleIso = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

  const duplicateA = createMemory({
    content: '部署前先确认回滚方案，避免高风险误操作。',
    type: 'constraint',
    lifecycle: 'semantic',
    scope: { userId: 'u-tool-cons-1' },
    updatedAt: nowIso,
  });
  const duplicateB = createMemory({
    content: '  部署前先确认回滚方案，避免高风险误操作！！！ ',
    type: 'constraint',
    lifecycle: 'semantic',
    scope: { userId: 'u-tool-cons-1' },
    updatedAt: nowIso,
  });
  const staleEpisodic = createMemory({
    content: '这是 45 天前的会话流水。',
    type: 'summary',
    lifecycle: 'episodic',
    scope: { userId: 'u-tool-cons-1' },
    updatedAt: staleIso,
  });

  app.memoryRepo.insert(duplicateA);
  app.memoryRepo.insert(duplicateB);
  app.memoryRepo.insert(staleEpisodic);

  const report = await app.evermemoryConsolidate({
    mode: 'deep',
    scope: { userId: 'u-tool-cons-1' },
  });
  assert.equal(report.mode, 'deep');
  assert.ok(report.processed >= 3);
  assert.ok(report.merged >= 1);
  assert.ok(report.archivedStale >= 1);

  const staleAfter = app.memoryRepo.findById(staleEpisodic.id);
  assert.equal(staleAfter?.state.archived, true);
  assert.equal(staleAfter?.lifecycle, 'archive');

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});
