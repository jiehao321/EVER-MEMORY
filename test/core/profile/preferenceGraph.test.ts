import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProjectedProfile } from '../../../src/types.js';
import { PreferenceGraphService } from '../../../src/core/profile/preferenceGraph.js';

function createProfile(): ProjectedProfile {
  return {
    userId: 'u-preference-graph',
    updatedAt: '2026-03-15T00:00:00.000Z',
    stable: {
      explicitPreferences: {
        communication_style: {
          value: 'concise_direct',
          source: 'stable_explicit',
          canonical: true,
          evidenceRefs: ['m-1'],
        },
        execution_mode: {
          value: '快速执行',
          source: 'stable_explicit',
          canonical: true,
          evidenceRefs: ['m-2', 'm-3'],
        },
      },
      explicitConstraints: [],
    },
    derived: {
      communicationStyle: {
        tendency: 'concise_direct',
        confidence: 0.8,
        evidenceRefs: ['m-4'],
        source: 'derived_inference',
        guardrail: 'weak_hint',
        canonical: false,
      },
      likelyInterests: [
        {
          value: 'TypeScript',
          confidence: 0.9,
          evidenceRefs: ['m-5', 'm-6'],
          source: 'derived_inference',
          guardrail: 'weak_hint',
          canonical: false,
        },
      ],
      workPatterns: [
        {
          value: '逐步确认',
          confidence: 0.7,
          evidenceRefs: ['m-7'],
          source: 'derived_inference',
          guardrail: 'weak_hint',
          canonical: false,
        },
      ],
    },
    behaviorHints: [],
  };
}

test('buildFromProfile constructs nodes from likely interests and work patterns', () => {
  const service = new PreferenceGraphService();
  const graph = service.buildFromProfile('u-preference-graph', createProfile());

  assert.ok(graph.nodes.some((node) => node.label === 'TypeScript'));
  assert.ok(graph.nodes.some((node) => node.label === '逐步确认'));
  assert.ok(graph.nodes.some((node) => node.label === 'concise_direct'));
});

test('inferImplications returns builtin implied preferences', () => {
  const service = new PreferenceGraphService();
  const graph = service.buildFromProfile('u-preference-graph', createProfile());

  assert.deepEqual(
    [...service.inferImplications(graph)].sort(),
    ['不需要冗长解释', '代码优于文字', '编译时错误检查', '静态类型偏好', '高风险操作需要审批', '谨慎执行'].sort(),
  );
});

test('findConflicts detects contradictory preferences', () => {
  const service = new PreferenceGraphService();
  const graph = service.buildFromProfile('u-preference-graph', createProfile());

  assert.deepEqual(service.findConflicts(graph), [
    {
      nodeA: '快速执行',
      nodeB: '逐步确认',
      reason: '执行节奏偏好冲突：快速推进 vs 先确认。',
    },
  ]);
});

test('getTopPreferences sorts by strength times evidence count', () => {
  const service = new PreferenceGraphService();
  const graph = service.buildFromProfile('u-preference-graph', createProfile());
  const top = service.getTopPreferences(graph, 3);

  assert.equal(top[0]?.label, '快速执行');
  assert.equal(top[1]?.label, 'TypeScript');
  assert.equal(top[2]?.label, 'concise_direct');
});
