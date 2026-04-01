import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('npm pack bundles better-sqlite3 native binding required by OpenClaw installs', () => {
  const packDir = mkdtempSync(join(tmpdir(), 'evermemory-pack-'));

  try {
    const output = execFileSync('npm', ['pack', '--json', '--pack-destination', packDir], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    const parsed = JSON.parse(output) as Array<{ filename?: string }>;
    const filename = parsed[0]?.filename;
    assert.ok(filename, 'npm pack should return a tarball filename');

    const tarballPath = join(packDir, filename);
    const entries = execFileSync('tar', ['-tf', tarballPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    const bundlesNativeBinary = /package\/node_modules\/better-sqlite3\/build\/Release\/better_sqlite3\.node/.test(entries);
    const bundlesBuildPayload = /package\/node_modules\/better-sqlite3\/binding\.gyp/.test(entries)
      && /package\/node_modules\/better-sqlite3\/src\/better_sqlite3\.cpp/.test(entries)
      && /package\/node_modules\/better-sqlite3\/deps\/sqlite3\/sqlite3\.c/.test(entries);

    assert.ok(
      bundlesNativeBinary || bundlesBuildPayload,
      'npm pack should include either the better-sqlite3 native binary or the build payload needed to compile it',
    );
  } finally {
    rmSync(packDir, { recursive: true, force: true });
  }
});
