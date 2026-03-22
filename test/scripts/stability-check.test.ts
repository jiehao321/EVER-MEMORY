import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { chdir, cwd } from 'node:process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('resolveUnitTestFiles includes nested compiled test files', async () => {
  const originalCwd = cwd();
  const fixtureRoot = resolve('tmp', `stability-check-${Date.now()}`);
  const nestedDir = resolve(fixtureRoot, 'dist-test/test/nested/deeper');
  mkdirSync(nestedDir, { recursive: true });
  writeFileSync(resolve(fixtureRoot, 'dist-test/test/top-level.test.js'), '');
  writeFileSync(resolve(nestedDir, 'nested-case.test.js'), '');

  try {
    chdir(fixtureRoot);
    const scriptUrl = pathToFileURL(resolve(originalCwd, 'scripts/stability-check.mjs')).href;
    const module = await import(scriptUrl);
    const files = module.resolveUnitTestFiles();
    assert.deepEqual(files, [
      resolve(fixtureRoot, 'dist-test/test/nested/deeper/nested-case.test.js'),
      resolve(fixtureRoot, 'dist-test/test/top-level.test.js'),
    ]);
  } finally {
    chdir(originalCwd);
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
