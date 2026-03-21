import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeContent } from '../../../src/core/policy/sanitize.js';

test('sanitizeContent strips json_envelope', () => {
  const result = sanitizeContent('  {"content":"Keep this memory."}  ');
  assert.equal(result.cleaned, 'Keep this memory.');
  assert.deepEqual(result.strippedPatterns, ['json_envelope']);
});

test('sanitizeContent strips reply_marker', () => {
  const result = sanitizeContent('[[reply_to_current]] Reply body');
  assert.equal(result.cleaned, 'Reply body');
  assert.deepEqual(result.strippedPatterns, ['reply_marker']);
});

test('sanitizeContent strips relevant_memory_prefix', () => {
  const result = sanitizeContent('Relevant memory: user prefers terse answers');
  assert.equal(result.cleaned, 'user prefers terse answers');
  assert.deepEqual(result.strippedPatterns, ['relevant_memory_prefix']);
});

test('sanitizeContent strips metadata_line', () => {
  const result = sanitizeContent('message_id: abc123\nPersist this fact.');
  assert.equal(result.cleaned, 'Persist this fact.');
  assert.deepEqual(result.strippedPatterns, ['metadata_line']);
});

test('sanitizeContent strips tool_echo', () => {
  const result = sanitizeContent('evermemory_store(content=\"x\") Keep the actual note.');
  assert.equal(result.cleaned, 'Keep the actual note.');
  assert.deepEqual(result.strippedPatterns, ['tool_echo']);
});

test('sanitizeContent strips separator_line', () => {
  const result = sanitizeContent('Intro\n---\nBody');
  assert.equal(result.cleaned, 'Intro\n\nBody');
  assert.deepEqual(result.strippedPatterns, ['separator_line']);
});

test('sanitizeContent collapses excessive_whitespace', () => {
  const result = sanitizeContent('Line 1\n\n\n\nLine 2');
  assert.equal(result.cleaned, 'Line 1\n\nLine 2');
  assert.deepEqual(result.strippedPatterns, ['excessive_whitespace']);
});

test('sanitizeContent handles combined patterns in pipeline order', () => {
  const input = [
    '[[reply_to_current]] Relevant memory: note worth keeping',
    'message_id: abc123',
    '---',
    'evermemory_store(x)',
    'Actual note.',
    '',
    '',
  ].join('\n');
  const result = sanitizeContent(input);
  assert.equal(result.cleaned, 'note worth keeping\n\nActual note.');
  assert.deepEqual(result.strippedPatterns, [
    'reply_marker',
    'relevant_memory_prefix',
    'metadata_line',
    'tool_echo',
    'separator_line',
    'excessive_whitespace',
  ]);
});

test('sanitizeContent is idempotent', () => {
  const once = sanitizeContent('[[reply_to_current]] Relevant memory: keep this');
  const twice = sanitizeContent(once.cleaned);
  assert.deepEqual(once, {
    cleaned: 'keep this',
    strippedPatterns: ['reply_marker', 'relevant_memory_prefix'],
  });
  assert.deepEqual(twice, {
    cleaned: 'keep this',
    strippedPatterns: [],
  });
});

test('sanitizeContent does not damage ordinary content', () => {
  const result = sanitizeContent('用户偏好简洁回答，并希望保留代码示例。');
  assert.equal(result.cleaned, '用户偏好简洁回答，并希望保留代码示例。');
  assert.deepEqual(result.strippedPatterns, []);
});
