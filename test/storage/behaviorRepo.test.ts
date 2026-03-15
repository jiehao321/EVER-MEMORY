import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type Database from 'better-sqlite3';
import { BehaviorRepository } from '../../src/storage/behaviorRepo.js';
import { buildBehaviorRule, createInMemoryDb } from './helpers.js';

describe('BehaviorRepository', () => {
  let db: Database.Database | undefined;

  afterEach(() => db?.close());

  it('creates and loads a behavior rule', () => {
    db = createInMemoryDb();
    const repo = new BehaviorRepository(db);
    const rule = buildBehaviorRule({ id: 'rule-create', statement: 'Confirm before deploy.' });

    repo.insert(rule);

    assert.equal(repo.findById('rule-create')?.statement, 'Confirm before deploy.');
  });

  it('finds only active candidate rules for a user and channel', () => {
    db = createInMemoryDb();
    const repo = new BehaviorRepository(db);
    repo.insert(buildBehaviorRule({ id: 'global', priority: 60 }));
    repo.insert(buildBehaviorRule({ id: 'user', priority: 80, appliesTo: { userId: 'u1', channel: 'chat', intentTypes: [], contexts: [] } }));
    repo.insert(buildBehaviorRule({
      id: 'deprecated',
      appliesTo: { userId: 'u1', channel: 'chat', intentTypes: [], contexts: [] },
      state: { active: true, deprecated: true, frozen: false },
    }));

    const active = repo.listActiveCandidates({ userId: 'u1', channel: 'chat', limit: 10 });
    assert.deepEqual(active.map((rule) => rule.id), ['user', 'global']);
  });

  it('persists promoted, frozen, and deprecated state changes via upsert', () => {
    db = createInMemoryDb();
    const repo = new BehaviorRepository(db);
    const base = buildBehaviorRule({ id: 'rule-state', priority: 50, lifecycle: { level: 'candidate', maturity: 'emerging', applyCount: 0, contradictionCount: 0, stale: false, staleness: 'fresh', decayScore: 0 } });
    repo.insert(base);

    repo.insert({
      ...base,
      priority: 95,
      lifecycle: { ...base.lifecycle, level: 'critical', maturity: 'validated', frozenAt: '2024-01-01T00:00:00.000Z', freezeReason: 'manual' },
      state: { ...base.state, frozen: true, active: false, deprecated: true, statusReason: 'manual freeze' },
    });

    const stored = repo.findById('rule-state');
    assert.equal(stored?.priority, 95);
    assert.equal(stored?.lifecycle.level, 'critical');
    assert.equal(stored?.state.frozen, true);
    assert.equal(stored?.state.deprecated, true);
  });

  it('returns null for missing rule ids', () => {
    db = createInMemoryDb();
    const repo = new BehaviorRepository(db);
    assert.equal(repo.findById('missing-rule'), null);
  });
});
