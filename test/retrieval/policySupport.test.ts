import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { createExecutionMeta, createRetrievalFixture, createRetrievalMemory, type RetrievalTestFixture } from './helpers.js';

describe('RetrievalStrategySupport.applyCandidatePolicy', () => {
  let fixture: RetrievalTestFixture | undefined;

  afterEach(() => fixture?.close());

  it('suppresses contradiction-pending memories from filtered candidates', () => {
    fixture = createRetrievalFixture();

    const contradicted = createRetrievalMemory({
      id: 'contradiction-memory',
      content: '旧结论：周五发布',
      tags: ['contradiction_pending'],
    });
    const primary = createRetrievalMemory({
      id: 'primary-memory',
      content: '当前结论：先完成质量门禁再发布',
    });

    const result = fixture.support.applyCandidatePolicy(
      [contradicted, primary],
      5,
      createExecutionMeta(),
    );

    assert.deepEqual(result.candidates.map((item) => item.id), ['primary-memory']);
    assert.equal(result.stats.suppressedContradictionCandidates, 1);
    assert.equal(result.stats.demotedLowTrustCandidates, 0);
  });

  it('demotes low-trust inferred memories to the end when primary candidates exceed limit', () => {
    fixture = createRetrievalFixture();

    const lowTrust = createRetrievalMemory({
      id: 'low-trust-memory',
      content: '推断：可能下周发布',
      sourceGrade: 'inferred',
      scores: {
        confidence: 0.4,
        importance: 0.7,
        explicitness: 0.6,
      },
    });
    const highTrustA = createRetrievalMemory({
      id: 'high-trust-a',
      content: '明确约束：发布前必须完成灰度',
      scores: {
        confidence: 0.9,
        importance: 0.7,
        explicitness: 0.8,
      },
    });
    const highTrustB = createRetrievalMemory({
      id: 'high-trust-b',
      content: '明确决策：先补回滚脚本',
      sourceGrade: 'inferred',
      scores: {
        confidence: 0.7,
        importance: 0.7,
        explicitness: 0.8,
      },
    });

    const result = fixture.support.applyCandidatePolicy(
      [lowTrust, highTrustA, highTrustB],
      2,
      createExecutionMeta(),
    );

    assert.deepEqual(
      result.candidates.map((item) => item.id),
      ['high-trust-a', 'high-trust-b', 'low-trust-memory'],
    );
    assert.equal(result.stats.demotedLowTrustCandidates, 1);
    assert.equal(result.stats.suppressedContradictionCandidates, 0);
  });
});
