#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { recordEvidence } from './report-evidence.mjs';

function fail(message) {
  console.error(`[evermemory:quality-gate] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  let withOpenClaw = false;
  let withContinuity = false;
  let withSecurity = false;
  let withFeishuQgent = false;
  let withSoak = false;
  let skipDoctor = false;
  let reportPath;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--with-openclaw') {
      withOpenClaw = true;
      continue;
    }
    if (arg === '--with-continuity') {
      withContinuity = true;
      continue;
    }
    if (arg === '--with-security') {
      withSecurity = true;
      continue;
    }
    if (arg === '--with-feishu-qgent') {
      withFeishuQgent = true;
      continue;
    }
    if (arg === '--with-soak') {
      withSoak = true;
      continue;
    }
    if (arg === '--skip-doctor') {
      skipDoctor = true;
      continue;
    }
    if (arg === '--report') {
      const next = argv[index + 1];
      if (!next) {
        fail('missing value for --report');
      }
      reportPath = next;
      index += 1;
      continue;
    }
    fail(`unsupported argument: ${arg}`);
  }

  return {
    withOpenClaw,
    withContinuity,
    withSecurity,
    withFeishuQgent,
    withSoak,
    skipDoctor,
    reportPath,
  };
}

function resolveDefaultReportPath() {
  const stamp = new Date().toISOString().replaceAll(':', '-');
  return join(tmpdir(), `evermemory-quality-gate-${stamp}.json`);
}

function runStep(command, args) {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const run = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
  });
  const durationMs = Date.now() - start;
  const endedAt = new Date().toISOString();
  const exitCode = typeof run.status === 'number' ? run.status : 1;
  return {
    command: [command, ...args].join(' '),
    startedAt,
    endedAt,
    durationMs,
    exitCode,
    ok: exitCode === 0,
  };
}

function readGitHead() {
  const run = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (run.status !== 0) {
    return undefined;
  }
  return run.stdout.trim() || undefined;
}

const parsed = parseArgs(process.argv.slice(2));

const steps = [
  { name: 'check', command: 'npm', args: ['run', 'check'] },
  { name: 'build', command: 'npm', args: ['run', 'build'] },
  { name: 'test:unit', command: 'npm', args: ['run', 'test:unit'] },
];

if (!parsed.skipDoctor) {
  steps.unshift({ name: 'doctor', command: 'npm', args: ['run', 'doctor'] });
}

if (parsed.withOpenClaw) {
  steps.push({ name: 'test:openclaw:smoke', command: 'npm', args: ['run', 'test:openclaw:smoke'] });
}
if (parsed.withContinuity) {
  steps.push({ name: 'test:openclaw:continuity', command: 'npm', args: ['run', 'test:openclaw:continuity'] });
}
if (parsed.withFeishuQgent) {
  steps.push({ name: 'test:openclaw:feishu-qgent', command: 'npm', args: ['run', 'test:openclaw:feishu-qgent'] });
}
if (parsed.withSecurity) {
  steps.push({ name: 'test:openclaw:security', command: 'npm', args: ['run', 'test:openclaw:security'] });
}
if (parsed.withSoak) {
  steps.push({ name: 'test:openclaw:soak', command: 'npm', args: ['run', 'test:openclaw:soak'] });
}

const summarySteps = [];
let ok = true;
for (const step of steps) {
  console.log(`[evermemory:quality-gate] running step: ${step.name}`);
  const result = runStep(step.command, step.args);
  summarySteps.push({ name: step.name, ...result });
  if (!result.ok) {
    ok = false;
    break;
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  withOpenClaw: parsed.withOpenClaw,
  withContinuity: parsed.withContinuity,
  withSecurity: parsed.withSecurity,
  withFeishuQgent: parsed.withFeishuQgent,
  withSoak: parsed.withSoak,
  skipDoctor: parsed.skipDoctor,
  ok,
  nodeVersion: process.version,
  cwd: process.cwd(),
  gitHead: readGitHead(),
  steps: summarySteps,
};

const reportPath = resolve(parsed.reportPath ?? resolveDefaultReportPath());
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

recordEvidence({
  runner: 'quality-gate',
  ok,
  reportPath,
  mode: parsed.withOpenClaw
    ? (parsed.withFeishuQgent ? 'openclaw-feishu' : (parsed.withContinuity ? 'openclaw-continuity' : 'openclaw'))
    : 'core',
  withOpenClaw: parsed.withOpenClaw,
  withContinuity: parsed.withContinuity,
  withSecurity: parsed.withSecurity,
  withFeishuQgent: parsed.withFeishuQgent,
  withSoak: parsed.withSoak,
  skipDoctor: parsed.skipDoctor,
  stepCount: summarySteps.length,
});

if (!ok) {
  console.error(`[evermemory:quality-gate] FAIL report=${reportPath}`);
  process.exit(1);
}

console.log(`[evermemory:quality-gate] PASS report=${reportPath}`);
