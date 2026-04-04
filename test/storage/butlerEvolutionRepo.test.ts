import assert from 'node:assert/strict';
import test from 'node:test';
import { ButlerEvolutionRepository } from '../../src/storage/butlerEvolutionRepo.js';
import { createInMemoryDb } from './helpers.js';

test('ButlerEvolutionRepository inserts, lists, and reverts log entries', () => {
  const db = createInMemoryDb();
  try {
    const repo = new ButlerEvolutionRepository(db);
    repo.insertLog({
      id: 'evolution-1',
      cycleType: 'parameter_tune',
      parameterKey: 'overlay_confidence_threshold',
      oldValueJson: '0.3',
      newValueJson: '0.33',
      evidenceJson: '{"metrics":{"overlayAcceptanceRate":0.2}}',
      confidence: 0.72,
      status: 'active',
      createdAt: '2026-04-04T00:00:00.000Z',
    });

    const recent = repo.findRecent(5);
    repo.revertEntry('evolution-1');

    assert.equal(recent.length, 1);
    assert.equal(recent[0]?.id, 'evolution-1');
    assert.equal(repo.findRecent(1)[0]?.status, 'reverted');
  } finally {
    db.close();
  }
});
