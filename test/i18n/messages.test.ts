import assert from 'node:assert/strict';
import test from 'node:test';
import { messages, t } from '../../src/i18n/messages.js';

test('t resolves nested keys for explicit locales', () => {
  assert.equal(t('status.health.healthy', 'en'), 'healthy');
  assert.equal(t('status.health.healthy', 'zh'), '健康');
});

test('t treats auto locale as english', () => {
  assert.equal(t('smartness.reportHeader', 'auto'), 'Smart Score:');
});

test('t falls back to english when locale-specific key is missing', () => {
  const zhMessages = messages.zh as Record<string, unknown>;
  const originalGeneral = zhMessages.general as Record<string, unknown>;
  zhMessages.general = { ...originalGeneral };
  delete (zhMessages.general as Record<string, unknown>).ready;

  try {
    assert.equal(t('general.ready', 'zh'), 'ready');
  } finally {
    zhMessages.general = originalGeneral;
  }
});

test('t returns the key when it is missing in all locales', () => {
  assert.equal(t('general.missingLabel', 'en'), 'general.missingLabel');
});
