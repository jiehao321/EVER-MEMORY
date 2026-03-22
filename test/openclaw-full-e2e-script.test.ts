import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const projectRoot = process.cwd();
const scriptPath = join(projectRoot, 'scripts', 'openclaw-full-e2e.mjs');
const packagePath = join(projectRoot, 'package.json');

test('full e2e script exists with required high-level structure', () => {
  assert.equal(existsSync(scriptPath), true, 'expected scripts/openclaw-full-e2e.mjs to exist');

  const script = readFileSync(scriptPath, 'utf8');
  assert.match(script, /function runOpenClaw\s*\(/);
  assert.match(script, /function parseAgentJson\s*\(/);
  assert.match(script, /function getPayloadText\s*\(/);
  assert.match(script, /function assertIncludes\s*\(/);
  assert.match(script, /function queryDb\s*\(/);
  assert.match(script, /const scopeChatId = 'evermemory-full-e2e-chat'/);
  assert.match(script, /cleanup/i);
  assert.match(script, /15 passed/i);
});

test('package.json exposes e2e:full script', () => {
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  assert.equal(pkg.scripts['e2e:full'], 'node scripts/openclaw-full-e2e.mjs');
});
