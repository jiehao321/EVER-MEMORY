import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type Database from 'better-sqlite3';
import { DriftDetectionService } from '../../../src/core/profile/driftDetection.js';
import { buildProfile, createInMemoryDb } from '../../storage/helpers.js';

describe('DriftDetectionService', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createInMemoryDb();
  });

  afterEach(() => {
    db.close();
  });

  it('detects added preferences and records them in the drift log', () => {
    const service = new DriftDetectionService(db);
    const nextProfile = buildProfile({
      stable: {
        explicitPreferences: {
          tone: {
            value: 'concise',
            source: 'stable_explicit',
            canonical: true,
            evidenceRefs: ['mem-1'],
          },
        },
        explicitConstraints: [],
      },
    });

    const result = service.detectDrift(null, nextProfile, 'user-1');

    assert.equal(result.totalChanges, 1);
    assert.equal(result.reversals, 0);
    assert.deepEqual(result.drifts.map((drift) => ({ key: drift.key, driftType: drift.driftType })), [
      { key: 'tone', driftType: 'added' },
    ]);
    assert.equal(service.getDriftLog().length, 1);
  });

  it('detects reversals and returns recent drifts', () => {
    const service = new DriftDetectionService(db);
    const previousProfile = buildProfile({
      stable: {
        explicitPreferences: {
          theme: {
            value: 'dark mode',
            source: 'stable_explicit',
            canonical: true,
            evidenceRefs: ['mem-old'],
          },
        },
        explicitConstraints: [],
      },
    });
    const nextProfile = buildProfile({
      stable: {
        explicitPreferences: {
          theme: {
            value: 'light mode',
            source: 'stable_explicit',
            canonical: true,
            evidenceRefs: ['mem-new'],
          },
        },
        explicitConstraints: [],
      },
    });

    const result = service.detectDrift(previousProfile, nextProfile, 'user-1');
    const recent = service.getRecentDrifts(5);

    assert.equal(result.totalChanges, 1);
    assert.equal(result.reversals, 1);
    assert.equal(result.drifts[0]?.driftType, 'reversed');
    assert.equal(recent.length, 1);
    assert.equal(recent[0]?.key, 'theme');
  });

  it('persists drifts to SQLite and reloads them on construction', () => {
    const service = new DriftDetectionService(db);
    const previousProfile = buildProfile({
      stable: {
        explicitPreferences: {
          tone: {
            value: 'verbose',
            source: 'stable_explicit',
            canonical: true,
            evidenceRefs: ['mem-old'],
          },
        },
        explicitConstraints: [],
      },
    });
    const nextProfile = buildProfile({
      stable: {
        explicitPreferences: {
          tone: {
            value: 'concise',
            source: 'stable_explicit',
            canonical: true,
            evidenceRefs: ['mem-new'],
          },
        },
        explicitConstraints: [],
      },
    });

    const result = service.detectDrift(previousProfile, nextProfile, 'user-42');

    assert.equal(result.totalChanges, 1);
    const row = db.prepare(`
      SELECT user_id, preference_key, old_value, new_value, drift_type, detected_at
      FROM preference_drift_log
      LIMIT 1
    `).get() as {
      user_id: string;
      preference_key: string;
      old_value: string;
      new_value: string;
      drift_type: string;
      detected_at: string;
    } | undefined;
    assert.deepEqual(row, {
      user_id: 'user-42',
      preference_key: 'tone',
      old_value: 'verbose',
      new_value: 'concise',
      drift_type: 'reversed',
      detected_at: result.drifts[0]?.detectedAt,
    });

    const reloaded = new DriftDetectionService(db);
    assert.equal(reloaded.getDriftLog().length, 1);
    assert.equal(reloaded.getDriftLog()[0]?.key, 'tone');
    assert.equal(reloaded.getDriftLog()[0]?.driftType, 'reversed');
  });
});
