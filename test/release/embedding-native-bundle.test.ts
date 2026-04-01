import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('npm pack bundles sharp native binding required by local embedding startup', () => {
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

    const bundlesNativeBinary = /package\/node_modules\/sharp\/build\/Release\/sharp-linux-x64\.node/.test(entries);
    const bundlesSharpInstallPayload = /package\/node_modules\/sharp\/binding\.gyp/.test(entries)
      && /package\/node_modules\/sharp\/install\/can-compile\.js/.test(entries)
      && /package\/node_modules\/sharp\/src\/sharp\.cc/.test(entries);

    assert.ok(
      bundlesNativeBinary || bundlesSharpInstallPayload,
      'npm pack should include either the sharp native binary or the sharp install payload needed to materialize it',
    );
  } finally {
    rmSync(packDir, { recursive: true, force: true });
  }
});
