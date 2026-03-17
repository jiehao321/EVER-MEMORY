#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { recordEvidence } from './report-evidence.mjs';

function fail(message) {
  console.error(`[evermemory:openclaw-soak] ${message}`);
  process.exit(1);
}

function parsePositiveInt(raw, flagName) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    fail(`invalid value for ${flagName}: ${raw}`);
  }
  return value;
}

function parseArgs(argv) {
  let iterations = 6;
  let securityEvery = 2;
  let withFeishu = false;
  let withContinuity = true;
  let stopOnFailure = true;
  let reportPath;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--with-feishu') {
      withFeishu = true;
      continue;
    }
    if (arg === '--without-continuity') {
      withContinuity = false;
      continue;
    }
    if (arg === '--keep-going') {
      stopOnFailure = false;
      continue;
    }
    if (arg.startsWith('--iterations=')) {
      iterations = parsePositiveInt(arg.slice('--iterations='.length), '--iterations');
      continue;
    }
    if (arg === '--iterations') {
      const next = argv[i + 1];
      if (!next) {
        fail('missing value for --iterations');
      }
      iterations = parsePositiveInt(next, '--iterations');
      i += 1;
      continue;
    }
    if (arg.startsWith('--security-every=')) {
      securityEvery = parsePositiveInt(arg.slice('--security-every='.length), '--security-every');
      continue;
    }
    if (arg === '--security-every') {
      const next = argv[i + 1];
      if (!next) {
        fail('missing value for --security-every');
      }
      securityEvery = parsePositiveInt(next, '--security-every');
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

  return {
    iterations,
    securityEvery,
    withFeishu,
    withContinuity,
    stopOnFailure,
    reportPath,
  };
}

function runStep(command, args) {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
  });
  const endedAt = new Date().toISOString();
  const exitCode = typeof result.status === 'number' ? result.status : 1;
  return {
    command: [command, ...args].join(' '),
    startedAt,
    endedAt,
    durationMs: Date.now() - startMs,
    exitCode,
    ok: exitCode === 0,
  };
}

function resolveDefaultReportPath() {
  const stamp = new Date().toISOString().replaceAll(':', '-');
  return join(tmpdir(), `evermemory-openclaw-soak-${stamp}.json`);
}

const parsed = parseArgs(process.argv.slice(2));
const summary = [];
let failed = false;

console.log(
  `[evermemory:openclaw-soak] start iterations=${parsed.iterations} securityEvery=${parsed.securityEvery} withFeishu=${parsed.withFeishu} withContinuity=${parsed.withContinuity}`,
);

const doctor = runStep('npm', ['run', 'doctor']);
summary.push({ phase: 'bootstrap', step: 'doctor', ...doctor });
if (!doctor.ok) {
  failed = true;
}

for (let iteration = 1; iteration <= parsed.iterations && !failed; iteration += 1) {
  console.log(`[evermemory:openclaw-soak] iteration=${iteration}/${parsed.iterations} step=smoke`);
  const smoke = runStep('npm', ['run', 'test:openclaw:smoke']);
  summary.push({ phase: `iteration-${iteration}`, step: 'test:openclaw:smoke', ...smoke });
  if (!smoke.ok) {
    failed = true;
    if (parsed.stopOnFailure) {
      break;
    }
  }

  if (parsed.withFeishu && (!failed || !parsed.stopOnFailure)) {
    console.log(`[evermemory:openclaw-soak] iteration=${iteration}/${parsed.iterations} step=feishu-qgent`);
    const feishu = runStep('npm', ['run', 'test:openclaw:feishu-qgent']);
    summary.push({ phase: `iteration-${iteration}`, step: 'test:openclaw:feishu-qgent', ...feishu });
    if (!feishu.ok) {
      failed = true;
      if (parsed.stopOnFailure) {
        break;
      }
    }
  }

  if (parsed.withContinuity && (!failed || !parsed.stopOnFailure)) {
    console.log(`[evermemory:openclaw-soak] iteration=${iteration}/${parsed.iterations} step=continuity`);
    const continuity = runStep('npm', ['run', 'test:openclaw:continuity']);
    summary.push({ phase: `iteration-${iteration}`, step: 'test:openclaw:continuity', ...continuity });
    if (!continuity.ok) {
      failed = true;
      if (parsed.stopOnFailure) {
        break;
      }
    }
  }

  if (iteration % parsed.securityEvery === 0 && (!failed || !parsed.stopOnFailure)) {
    console.log(`[evermemory:openclaw-soak] iteration=${iteration}/${parsed.iterations} step=security`);
    const security = runStep('npm', ['run', 'test:openclaw:security']);
    summary.push({ phase: `iteration-${iteration}`, step: 'test:openclaw:security', ...security });
    if (!security.ok) {
      failed = true;
      if (parsed.stopOnFailure) {
        break;
      }
    }
  }
}

console.log('[evermemory:openclaw-soak] finalize step=openclaw:cleanup:test-data');
const cleanup = runStep('npm', ['run', 'openclaw:cleanup:test-data']);
summary.push({ phase: 'finalize', step: 'openclaw:cleanup:test-data', ...cleanup });
if (!cleanup.ok) {
  failed = true;
}

const total = summary.length;
const passed = summary.filter((item) => item.ok).length;
const failedCount = total - passed;
const report = {
  generatedAt: new Date().toISOString(),
  ok: failedCount === 0,
  config: {
    iterations: parsed.iterations,
    securityEvery: parsed.securityEvery,
    withFeishu: parsed.withFeishu,
    withContinuity: parsed.withContinuity,
    stopOnFailure: parsed.stopOnFailure,
  },
  totals: {
    total,
    passed,
    failed: failedCount,
  },
  steps: summary,
};

const reportPath = resolve(parsed.reportPath ?? resolveDefaultReportPath());
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

recordEvidence({
  runner: 'openclaw-soak',
  ok: failedCount === 0,
  reportPath,
  iterations: parsed.iterations,
  withFeishu: parsed.withFeishu,
  withContinuity: parsed.withContinuity,
  stepCount: total,
  passed,
  failed: failedCount,
});

console.log(`[evermemory:openclaw-soak] report=${reportPath}`);
console.log(`[evermemory:openclaw-soak] passed=${passed}/${total}`);

if (failedCount > 0) {
  fail('soak failed');
}

console.log('[evermemory:openclaw-soak] PASS');
