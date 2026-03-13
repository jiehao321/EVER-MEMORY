#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';

function runGit(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').trim();
    throw new Error(`git ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }
  return (result.stdout ?? '').trim();
}

function parseArgs(argv) {
  const parsed = {
    requireClean: true,
    denyMain: true,
    allowBranches: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--allow-branch') {
      const next = argv[index + 1];
      if (!next) {
        throw new Error('missing value for --allow-branch');
      }
      parsed.allowBranches.push(next);
      index += 1;
      continue;
    }
    if (arg === '--allow-main') {
      parsed.denyMain = false;
      continue;
    }
    if (arg === '--allow-dirty') {
      parsed.requireClean = false;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  return parsed;
}

function fail(message) {
  console.error(`[evermemory:git-branch-guard] FAIL ${message}`);
  process.exit(1);
}

let parsed;
try {
  parsed = parseArgs(process.argv.slice(2));
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  fail(detail);
}

let branch;
let head;
let dirtyLines;
try {
  branch = runGit(['branch', '--show-current']);
  head = runGit(['rev-parse', '--short', 'HEAD']);
  dirtyLines = runGit(['status', '--porcelain'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  fail(detail);
}

if (!branch) {
  fail('detached HEAD is not allowed');
}

if (parsed.denyMain && branch === 'main') {
  fail('direct work on main is disallowed; switch to release/* or feature/* branch');
}

if (parsed.allowBranches.length > 0 && !parsed.allowBranches.includes(branch)) {
  fail(`branch "${branch}" is not in allow-list: ${parsed.allowBranches.join(', ')}`);
}

if (parsed.requireClean && dirtyLines.length > 0) {
  fail(`worktree is dirty (${dirtyLines.length} files changed)`);
}

console.log('[evermemory:git-branch-guard] PASS');
console.log(`[evermemory:git-branch-guard] branch=${branch}`);
console.log(`[evermemory:git-branch-guard] head=${head}`);
console.log(`[evermemory:git-branch-guard] dirtyFiles=${dirtyLines.length}`);
