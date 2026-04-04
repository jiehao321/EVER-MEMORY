import assert from 'node:assert/strict';
import test from 'node:test';
import { executeButlerAsk } from '../../src/tools/butlerAsk.js';

test('executeButlerAsk returns active Butler questions with count', () => {
  const result = executeButlerAsk({
    getActiveQuestions: () => [
      {
        id: 'question-1',
        questionText: 'What changed since the last session?',
        gapType: 'stale',
        importance: 0.8,
      },
      {
        id: 'question-2',
        questionText: 'Do you still prefer concise status updates?',
        gapType: 'missing_preference',
        importance: 0.7,
      },
    ],
  });

  assert.equal(result.count, 2);
  assert.equal(result.questions[0]?.id, 'question-1');
  assert.equal(result.questions[1]?.gapType, 'missing_preference');
});
