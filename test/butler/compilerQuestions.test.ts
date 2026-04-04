import assert from 'node:assert/strict';
import test from 'node:test';
import { compileQuestions } from '../../src/core/butler/strategy/compiler.js';

test('compileQuestions returns empty string when no questions exist', () => {
  assert.equal(compileQuestions([]), '');
});

test('compileQuestions renders Butler questions as XML', () => {
  const xml = compileQuestions([
    {
      id: 'question-1',
      questionText: 'What is the missing deployment constraint?',
      gapType: 'incomplete',
    },
    {
      id: 'question-2',
      questionText: 'Should this stalled task be closed?',
      gapType: 'stale',
    },
  ]);

  assert.equal(
    xml,
    [
      '<butler-questions>',
      '  <question id="question-1" gap="incomplete">What is the missing deployment constraint?</question>',
      '  <question id="question-2" gap="stale">Should this stalled task be closed?</question>',
      '</butler-questions>',
    ].join('\n'),
  );
});
