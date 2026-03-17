#!/usr/bin/env node
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { recordEvidence } from './report-evidence.mjs';

const SUPPORTED_MODES = new Set(['status', 'dev', 'release']);
const COORDINATION_LOCK_NAME = 'artifact-workspace';
const COORDINATION_LOCK_WAIT_MS = 250;
const COORDINATION_LOCK_STALE_MS = 30 * 60 * 1000;

const TEAM_LANES = [
  {
    team: 'Team-A Core Memory',
    focus: 'auto capture / briefing / session lifecycle',
    keyPaths: ['src/hooks', 'src/core/briefing', 'src/core/memory'],
  },
  {
    team: 'Team-B Retrieval Quality',
    focus: 'retrieval routing / ranking / data pollution suppression',
    keyPaths: ['src/retrieval', 'test/retrieval.test.ts'],
  },
  {
    team: 'Team-C Ops & Quality',
    focus: 'quality gates / openclaw hardening / docs sync',
    keyPaths: ['scripts', 'docs', 'README.md'],
  },
];

function fail(message) {
  console.error(`[evermemory:agent-teams] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  let mode = 'status';
  let reportPath;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--mode=')) {
      mode = arg.slice('--mode='.length);
      continue;
    }
    if (arg === '--mode') {
      const next = argv[i + 1];
      if (!next) {
        fail('missing value for --mode');
      }
      mode = next;
      i += 1;
      continue;
    }
    if (arg.startsWith('--report=')) {
      reportPath = arg.slice('--report='.length);
      continue;
    }
    if (arg === '--report') {
      const next = argv[i + 1];
      if (!next) {
        fail('missing value for --report');
      }
      reportPath = next;
      i += 1;
      continue;
    }
    fail(`unsupported argument: ${arg}`);
  }

  if (!SUPPORTED_MODES.has(mode)) {
    fail(`unsupported mode: ${mode}`);
  }

  return { mode, reportPath };
}

function resolveDefaultReportPath(mode) {
  const stamp = new Date().toISOString().replaceAll(':', '-');
  return join(tmpdir(), `evermemory-agent-teams-${mode}-${stamp}.json`);
}

function run(command, args, options = {}) {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const result = spawnSync(command, args, {
    encoding: options.capture ? 'utf8' : undefined,
    stdio: options.capture ? 'pipe' : 'inherit',
    env: process.env,
  });
  const endedAt = new Date().toISOString();
  const exitCode = typeof result.status === 'number' ? result.status : 1;
  const output = options.capture ? (result.stdout ?? '').trim() : undefined;
  return {
    command: [command, ...args].join(' '),
    startedAt,
    endedAt,
    durationMs: Date.now() - startMs,
    exitCode,
    ok: exitCode === 0,
    output,
  };
}

function readOutput(command, args) {
  const result = run(command, args, { capture: true });
  if (!result.ok) {
    return undefined;
  }
  return result.output ?? '';
}

function gitStatusSummary() {
  const branch = readOutput('git', ['rev-parse', '--abbrev-ref', 'HEAD']) ?? 'unknown';
  const head = readOutput('git', ['rev-parse', 'HEAD']) ?? 'unknown';
  const porcelain = readOutput('git', ['status', '--porcelain']) ?? '';
  const unresolved = readOutput('git', ['diff', '--name-only', '--diff-filter=U']) ?? '';
  const dirtyFiles = porcelain
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const unresolvedFiles = unresolved
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    branch,
    head,
    dirty: dirtyFiles.length > 0,
    dirtyFiles: dirtyFiles.length,
    unresolvedFiles,
    unresolvedCount: unresolvedFiles.length,
  };
}

function pipelineForMode(mode) {
  if (mode === 'status') {
    return [];
  }
  if (mode === 'dev') {
    return [
      { name: 'doctor', command: 'npm', args: ['run', 'doctor'] },
      { name: 'quality:gate', command: 'npm', args: ['run', 'quality:gate', '--', '--skip-doctor'] },
      { name: 'test:recall:benchmark', command: 'node', args: ['./scripts/recall-benchmark.mjs'] },
    ];
  }
  const releasePipeline = [
    { name: 'doctor', command: 'npm', args: ['run', 'doctor'] },
    { name: 'quality:gate:openclaw', command: 'npm', args: ['run', 'quality:gate:openclaw', '--', '--skip-doctor'] },
    { name: 'stability:check', command: 'npm', args: ['run', 'stability:check:full'] },
  ];
  return releasePipeline;
}

function recommendations(mode, git) {
  const items = [];
  if (git.unresolvedCount > 0) {
    items.push('resolve merge conflicts before continuing team development');
  }
  if (mode === 'status') {
    items.push('run npm run teams:dev before merging daily team output');
    items.push('run npm run teams:release before release branch cut');
  }
  if (git.dirty) {
    items.push('split worktree changes into reviewable commits by team lane');
  }
  return items;
}

function sleep(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function lockDirPath(name) {
  return resolve('.openclaw/locks', `${name}.lock`);
}

function ownerFilePath(lockPath) {
  return resolve(lockPath, 'owner.json');
}

function readLockOwner(lockPath) {
  try {
    return JSON.parse(readFileSync(ownerFilePath(lockPath), 'utf8'));
  } catch {
    return null;
  }
}

function isPidAlive(pid) {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(error && typeof error === 'object' && 'code' in error && error.code === 'ESRCH');
  }
}

async function acquireCoordinationLock(mode) {
  if (mode === 'status') {
    return null;
  }

  const path = lockDirPath(COORDINATION_LOCK_NAME);
  mkdirSync(dirname(path), { recursive: true });
  const startedAt = new Date().toISOString();
  const waitStart = Date.now();

  while (true) {
    try {
      mkdirSync(path);
      writeFileSync(ownerFilePath(path), `${JSON.stringify({
        pid: process.pid,
        mode,
        startedAt,
        cwd: process.cwd(),
      }, null, 2)}\n`, 'utf8');
      return {
        name: COORDINATION_LOCK_NAME,
        path,
        acquiredAt: new Date().toISOString(),
        waitedMs: Date.now() - waitStart,
      };
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) {
        throw error;
      }
      const owner = readLockOwner(path);
      const ownerStartedAtMs = owner?.startedAt ? Date.parse(owner.startedAt) : Number.NaN;
      const staleByTime = Number.isFinite(ownerStartedAtMs)
        ? (Date.now() - ownerStartedAtMs) > COORDINATION_LOCK_STALE_MS
        : false;
      const staleByPid = owner?.pid ? !isPidAlive(owner.pid) : false;
      if (staleByTime || staleByPid) {
        rmSync(path, { recursive: true, force: true });
        continue;
      }
      await sleep(COORDINATION_LOCK_WAIT_MS);
    }
  }
}

function releaseCoordinationLock(lock) {
  if (!lock) {
    return;
  }
  rmSync(lock.path, { recursive: true, force: true });
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const git = gitStatusSummary();
  const pipeline = pipelineForMode(parsed.mode);
  const steps = [];
  let ok = git.unresolvedCount === 0;
  let coordinationLock = null;

  try {
    coordinationLock = await acquireCoordinationLock(parsed.mode);
    if (coordinationLock) {
      console.log(`[evermemory:agent-teams] coordinationLock=${coordinationLock.name} waitedMs=${coordinationLock.waitedMs}`);
    }

    for (const step of pipeline) {
      console.log(`[evermemory:agent-teams] running ${step.name}`);
      const result = run(step.command, step.args);
      steps.push({ name: step.name, ...result });
      if (!result.ok) {
        ok = false;
        break;
      }
    }
  } finally {
    releaseCoordinationLock(coordinationLock);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: parsed.mode,
    ok,
    nodeVersion: process.version,
    cwd: process.cwd(),
    git,
    lanes: TEAM_LANES,
    steps,
    coordinationLock: coordinationLock
      ? {
          name: coordinationLock.name,
          waitedMs: coordinationLock.waitedMs,
          acquiredAt: coordinationLock.acquiredAt,
        }
      : undefined,
    recommendations: recommendations(parsed.mode, git),
  };

  const reportPath = resolve(parsed.reportPath ?? resolveDefaultReportPath(parsed.mode));
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  recordEvidence({
    runner: 'agent-teams',
    ok,
    reportPath,
    mode: parsed.mode,
    stepCount: steps.length,
    dirtyFiles: git.dirtyFiles,
    unresolvedCount: git.unresolvedCount,
  });

  console.log(`[evermemory:agent-teams] mode=${parsed.mode}`);
  console.log(`[evermemory:agent-teams] gitDirty=${git.dirty} dirtyFiles=${git.dirtyFiles}`);
  console.log(`[evermemory:agent-teams] unresolvedConflicts=${git.unresolvedCount}`);
  console.log(`[evermemory:agent-teams] report=${reportPath}`);

  if (!ok) {
    fail('quality supervision failed');
  }

  console.log('[evermemory:agent-teams] PASS');
}

await main();
