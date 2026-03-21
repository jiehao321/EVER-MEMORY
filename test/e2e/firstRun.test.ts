import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../../src/index.js';
import { isFirstRun, writeWelcomeMemory } from '../../src/core/setup/autoSetup.js';
import { createTempDbPath } from '../helpers.js';

function createTestApp(name: string) {
  const databasePath = createTempDbPath(name);
  const app = initializeEverMemory({ databasePath, semantic: { enabled: false } });

  return {
    app,
    cleanup() {
      app.database.connection.close();
      rmSync(databasePath, { force: true });
    },
  };
}

test('isFirstRun returns true when memoryCount is zero', () => {
  const { app, cleanup } = createTestApp('first-run-empty');

  try {
    assert.equal(isFirstRun(app.memoryRepo), true);
  } finally {
    cleanup();
  }
});

test('isFirstRun returns false when memoryCount is greater than zero', () => {
  const { app, cleanup } = createTestApp('first-run-non-empty');

  try {
    app.evermemoryStore({
      content: 'User prefers short answers.',
      scope: { userId: 'first-run-user' },
      type: 'preference',
    });

    assert.equal(isFirstRun(app.memoryRepo), false);
  } finally {
    cleanup();
  }
});

test('writeWelcomeMemory creates an identity memory tagged as welcome', () => {
  const { app, cleanup } = createTestApp('first-run-welcome-memory');

  try {
    const result = writeWelcomeMemory(app.memoryService, { userId: 'first-run-user' });

    assert.equal(result.accepted, true);
    assert.ok(result.memory);
    assert.equal(result.memory?.type, 'identity');
    assert.ok(result.memory?.tags.includes('welcome'));
    assert.equal(app.memoryRepo.count(), 1);
  } finally {
    cleanup();
  }
});
