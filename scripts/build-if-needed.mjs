#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { buildStampPath, computeBuildFingerprint, readBuildStamp } from './build-fingerprint.mjs';

function runBuild() {
  const run = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', env: process.env });
  const code = typeof run.status === 'number' ? run.status : 1;
  process.exit(code);
}

const distExists = existsSync('dist');
const stamp = readBuildStamp();

if (!distExists || !stamp || typeof stamp.fingerprint !== 'string') {
  console.log('[evermemory:build-if-needed] dist missing or stamp invalid');
  runBuild();
}

try {
  const fingerprint = computeBuildFingerprint();
  if (fingerprint === stamp.fingerprint) {
    console.log(`[evermemory:build-if-needed] dist up-to-date (stamp=${buildStampPath()})`);
    process.exit(0);
  }
  console.log('[evermemory:build-if-needed] source fingerprint changed; rebuilding');
  runBuild();
} catch (error) {
  console.log('[evermemory:build-if-needed] fingerprint failed; rebuilding');
  runBuild();
}
