#!/usr/bin/env node
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { computeBuildFingerprint, writeBuildStamp } from './build-fingerprint.mjs';

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
  });
  if (typeof result.status !== 'number' || result.status !== 0) {
    const code = typeof result.status === 'number' ? result.status : 1;
    process.exit(code);
  }
}

function cleanArtifacts() {
  rmSync(resolve('dist'), { recursive: true, force: true });
  rmSync(resolve('dist-test'), { recursive: true, force: true });
}

function runTypeScriptBuild() {
  const tscPath = resolve('node_modules', 'typescript', 'bin', 'tsc');
  run(process.execPath, [tscPath, '-p', 'tsconfig.build.json']);
}

cleanArtifacts();
runTypeScriptBuild();
const fingerprint = computeBuildFingerprint();
writeBuildStamp({
  generatedAt: new Date().toISOString(),
  fingerprint,
});
console.log('[evermemory:build] dist fingerprint recorded');
