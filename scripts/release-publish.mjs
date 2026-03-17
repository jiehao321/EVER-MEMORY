#!/usr/bin/env node

/**
 * EverMemory unified release workflow.
 *
 * Synchronizes three publish targets:
 *   1. npm registry
 *   2. ClawHub skill
 *   3. GitHub (commit + tag + push)
 *
 * Usage:
 *   node scripts/release-publish.mjs --version 1.0.2
 *   node scripts/release-publish.mjs --version 1.0.2 --dry-run
 *   npm run release -- --version 1.0.2
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// --- Parse args ---
const args = process.argv.slice(2);
let version = '';
let dryRun = false;
let skipNpm = false;
let skipSkill = false;
let skipGit = false;
let changelog = '';

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--version': version = args[++i] || ''; break;
    case '--dry-run': dryRun = true; break;
    case '--skip-npm': skipNpm = true; break;
    case '--skip-skill': skipSkill = true; break;
    case '--skip-git': skipGit = true; break;
    case '--changelog': changelog = args[++i] || ''; break;
    case '--help': case '-h':
      console.log(`
  EverMemory Release Publisher

  Usage: node scripts/release-publish.mjs --version <semver> [options]

  Options:
    --version <semver>   Version to publish (required)
    --changelog <text>   Changelog text for skill publish
    --dry-run            Validate everything without publishing
    --skip-npm           Skip npm publish
    --skip-skill         Skip ClawHub skill publish
    --skip-git           Skip git tag and push
    -h, --help           Show this help
`);
      process.exit(0);
  }
}

if (!version) {
  console.error('\n  [ERROR] --version is required.\n');
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`\n  [ERROR] Invalid version format: ${version}\n`);
  process.exit(1);
}

// --- Helpers ---
function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: root, ...opts });
    return true;
  } catch {
    return false;
  }
}

function runQuiet(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function hasCommand(cmd) {
  const check = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`;
  try { execSync(check, { stdio: 'ignore' }); return true; } catch { return false; }
}

function fail(msg) {
  console.error(`\n  [FAIL] ${msg}\n`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const prefix = dryRun ? '[DRY-RUN]' : '[RELEASE]';

console.log(`\n  ${prefix} EverMemory v${version}\n`);

// --- Step 0: Pre-flight checks ---
console.log('== Pre-flight Checks ==\n');

// Check version matches package.json
if (pkg.version !== version) {
  console.log(`  package.json version is ${pkg.version}, target is ${version}`);
  if (!dryRun) {
    fail('Version mismatch. Update package.json first, or use the current version.');
  } else {
    console.log('  (dry-run: continuing despite mismatch)\n');
  }
}

// Check clean working tree
const gitStatus = runQuiet('git status --porcelain');
if (gitStatus) {
  console.log('  Uncommitted changes detected:');
  console.log(`  ${gitStatus.split('\n').slice(0, 5).join('\n  ')}`);
  if (!dryRun) {
    fail('Working tree is dirty. Commit or stash changes first.');
  } else {
    console.log('  (dry-run: continuing despite dirty tree)\n');
  }
}

// Check npm login
if (!skipNpm) {
  const npmUser = runQuiet('npm whoami');
  if (npmUser) {
    console.log(`  npm: logged in as ${npmUser}`);
  } else {
    console.log('  npm: not logged in');
    if (!dryRun) {
      fail('npm login required. Run: npm login');
    }
  }
}

// Check clawhub login
if (!skipSkill) {
  if (hasCommand('clawhub')) {
    const clawUser = runQuiet('clawhub whoami');
    if (clawUser) {
      console.log(`  clawhub: logged in as ${clawUser}`);
    } else {
      console.log('  clawhub: not logged in');
      if (!dryRun) {
        fail('ClawHub login required. Run: clawhub login');
      }
    }
  } else {
    console.log('  clawhub: CLI not found, skipping skill publish');
    skipSkill = true;
  }
}

// --- Step 1: Quality gates ---
console.log('\n== Quality Gates ==\n');

if (!run('npm run build')) fail('Build failed.');
if (!run('node ./scripts/release-preflight.mjs')) fail('Release preflight check failed.');
if (!run('npm test')) fail('Tests failed.');

console.log('\n  Quality gates passed.\n');

// --- Step 2: npm publish ---
if (!skipNpm) {
  console.log('== npm Publish ==\n');
  const npmCmd = dryRun
    ? 'npm publish --access public --dry-run'
    : 'npm publish --access public --tag latest';
  if (!run(npmCmd)) {
    fail('npm publish failed.');
  }
  console.log(`\n  ${prefix} npm: evermemory@${version} published.\n`);
} else {
  console.log('== npm Publish: SKIPPED ==\n');
}

// --- Step 3: ClawHub skill publish ---
if (!skipSkill) {
  console.log('== ClawHub Skill Publish ==\n');
  const skillDir = resolve(root, 'skills/openclaw-evermemory-installer');
  const changelogArg = changelog || `Release v${version}`;
  // Call clawhub directly — no bash required (cross-platform)
  const skillCmd = `clawhub publish "${skillDir}" --slug "openclaw-evermemory-installer" --name "OpenClaw EverMemory Installer" --version "${version}" --changelog "${changelogArg}" --tags latest`;
  if (dryRun) {
    console.log(`  Would run: ${skillCmd}`);
  } else {
    if (!run(skillCmd)) {
      fail('ClawHub skill publish failed.');
    }
  }
  console.log(`\n  ${prefix} skill: published to ClawHub.\n`);
} else {
  console.log('== ClawHub Skill Publish: SKIPPED ==\n');
}

// --- Step 4: Git tag + push ---
if (!skipGit) {
  console.log('== Git Tag & Push ==\n');
  const tag = `v${version}`;
  const existingTag = runQuiet(`git tag -l "${tag}"`);

  if (existingTag) {
    console.log(`  Tag ${tag} already exists.`);
  } else if (dryRun) {
    console.log(`  Would create tag: ${tag}`);
  } else {
    if (!run(`git tag -a "${tag}" -m "Release ${tag}"`)) {
      fail('Git tag failed.');
    }
    console.log(`  Created tag: ${tag}`);
  }

  if (dryRun) {
    console.log('  Would push to origin with tags.');
  } else {
    if (!run('git push origin main --tags')) {
      fail('Git push failed.');
    }
  }
  console.log(`\n  ${prefix} git: tagged and pushed.\n`);
} else {
  console.log('== Git Tag & Push: SKIPPED ==\n');
}

// --- Summary ---
console.log('== Summary ==\n');
console.log(`  Version:  ${version}`);
console.log(`  npm:      ${skipNpm ? 'skipped' : 'published'}`);
console.log(`  skill:    ${skipSkill ? 'skipped' : 'published'}`);
console.log(`  git:      ${skipGit ? 'skipped' : 'tagged + pushed'}`);
console.log(`  dry-run:  ${dryRun}`);
console.log('');
if (!dryRun) {
  console.log('  Release complete!\n');
} else {
  console.log('  Dry run complete. Re-run without --dry-run to publish.\n');
}
