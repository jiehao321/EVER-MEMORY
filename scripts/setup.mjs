#!/usr/bin/env node

/**
 * EverMemory one-command setup script.
 *
 * Usage:
 *   npx evermemory setup          # from npm
 *   npm run setup                 # from repo clone
 *   node scripts/setup.mjs        # direct
 *
 * What it does:
 *   1. Builds the project (if needed)
 *   2. Registers and enables the plugin in OpenClaw
 *   3. Assigns the memory slot
 *   4. Restarts the gateway
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: root, ...opts });
    return true;
  } catch {
    return false;
  }
}

function hasCommand(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

console.log('\n  EverMemory Setup\n');

// Step 1: Build if dist/ doesn't exist
if (!existsSync(resolve(root, 'dist/index.js'))) {
  console.log('[1/4] Building...');
  if (!run('npm run build')) {
    console.error('\n  Build failed. Fix errors and retry.\n');
    process.exit(1);
  }
} else {
  console.log('[1/4] Build up to date.');
}

// Step 2: Check if OpenClaw CLI is available
if (!hasCommand('openclaw')) {
  console.log('\n  OpenClaw CLI not found.');
  console.log('  EverMemory built successfully and is ready to use as an SDK:');
  console.log('');
  console.log('    import { initializeEverMemory } from "evermemory";');
  console.log('    const em = initializeEverMemory();');
  console.log('');
  console.log('  To use as an OpenClaw plugin, install OpenClaw first,');
  console.log('  then re-run: npm run setup');
  console.log('');
  process.exit(0);
}

// Step 3: Install and enable plugin
console.log('[2/4] Installing plugin...');
run(`openclaw plugins install ${root} --link`);

console.log('[3/4] Enabling and configuring...');
run('openclaw plugins enable evermemory');
run('openclaw config set plugins.slots.memory evermemory');

// Step 4: Restart gateway
console.log('[4/4] Restarting gateway...');
if (run('openclaw gateway restart')) {
  console.log('\n  EverMemory is ready!');
  console.log('  Run profile_onboard to set up your first user profile.\n');
} else {
  console.log('\n  Plugin installed. Gateway restart failed (may not be running).');
  console.log('  Start OpenClaw manually: openclaw gateway start\n');
}
