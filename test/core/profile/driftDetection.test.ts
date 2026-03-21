import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DriftDetectionService } from '../../../src/core/profile/driftDetection.js';
import { buildProfile } from '../../storage/helpers.js';

describe('DriftDetectionService', () => {
  it('detects added preferences and records them in the drift log', () => {
    const service = new DriftDetectionService();
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
    const service = new DriftDetectionService();
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
});
