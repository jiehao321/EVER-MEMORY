#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { recordEvidence } from './report-evidence.mjs';

function fail(message) {
  console.error(`[evermemory:release-evaluate] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {
    version: '1.0.1',
    reportPath: undefined,
    soakIterations: 2,
    soakSecurityEvery: 2,
    evidenceDir: '/tmp/evermemory-release-evidence',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--version') {
      const next = argv[index + 1];
      if (!next) {
        fail('missing value for --version');
      }
      parsed.version = next;
      index += 1;
      continue;
    }
    if (arg === '--report') {
      const next = argv[index + 1];
      if (!next) {
        fail('missing value for --report');
      }
      parsed.reportPath = next;
      index += 1;
      continue;
    }
    if (arg === '--soak-iterations') {
      const next = argv[index + 1];
      if (!next) {
        fail('missing value for --soak-iterations');
      }
      const value = Number.parseInt(next, 10);
      if (!Number.isInteger(value) || value <= 0) {
        fail(`invalid --soak-iterations: ${next}`);
      }
      parsed.soakIterations = value;
      index += 1;
      continue;
    }
    if (arg === '--soak-security-every') {
      const next = argv[index + 1];
      if (!next) {
        fail('missing value for --soak-security-every');
      }
      const value = Number.parseInt(next, 10);
      if (!Number.isInteger(value) || value <= 0) {
        fail(`invalid --soak-security-every: ${next}`);
      }
      parsed.soakSecurityEvery = value;
      index += 1;
      continue;
    }
    if (arg === '--evidence-dir') {
      const next = argv[index + 1];
      if (!next) {
        fail('missing value for --evidence-dir');
      }
      parsed.evidenceDir = next;
      index += 1;
      continue;
    }
    fail(`unsupported argument: ${arg}`);
  }

  return parsed;
}

function defaultReportPath(version) {
  const stamp = new Date().toISOString().replaceAll(':', '-');
  return `/tmp/evermemory-release-evaluate-v${version}-${stamp}.json`;
}

function runStep(name, command, args, env) {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const run = spawnSync(command, args, {
    stdio: 'inherit',
    env,
  });
  const endedAt = new Date().toISOString();
  const exitCode = typeof run.status === 'number' ? run.status : 1;
  return {
    name,
    command: [command, ...args].join(' '),
    startedAt,
    endedAt,
    durationMs: Date.now() - start,
    exitCode,
    ok: exitCode === 0,
  };
}

const parsed = parseArgs(process.argv.slice(2));
const runEnv = {
  ...process.env,
  EVERMEMORY_EVIDENCE_DIR: parsed.evidenceDir,
};
process.env.EVERMEMORY_EVIDENCE_DIR = parsed.evidenceDir;

const steps = [
  { name: 'git-branch-guard', command: 'node', args: ['./scripts/git-branch-guard.mjs'] },
  { name: 'check', command: 'npm', args: ['run', 'check'] },
  { name: 'test:unit', command: 'npm', args: ['run', 'test:unit'] },
  { name: 'teams:release', command: 'npm', args: ['run', 'teams:release'] },
  { name: 'test:openclaw:continuity:matrix:short', command: 'npm', args: ['run', 'test:openclaw:continuity:matrix:short'] },
  {
    name: 'soak-short',
    command: 'node',
    args: [
      './scripts/openclaw-real-soak.mjs',
      `--iterations=${parsed.soakIterations}`,
      `--security-every=${parsed.soakSecurityEvery}`,
    ],
  },
  { name: 'test:recall:benchmark', command: 'npm', args: ['run', 'test:recall:benchmark'] },
];

const summary = [];
let ok = true;
for (const step of steps) {
  console.log(`[evermemory:release-evaluate] running ${step.name}`);
  const result = runStep(step.name, step.command, step.args, runEnv);
  summary.push(result);
  if (!result.ok) {
    ok = false;
    break;
  }
}

console.log('[evermemory:release-evaluate] running openclaw:cleanup:test-data (finalize)');
const cleanupStep = runStep('openclaw:cleanup:test-data', 'npm', ['run', 'openclaw:cleanup:test-data'], runEnv);
summary.push(cleanupStep);
if (!cleanupStep.ok) {
  ok = false;
}

const report = {
  generatedAt: new Date().toISOString(),
  version: parsed.version,
  evidenceDir: parsed.evidenceDir,
  ok,
  gate: ok ? 'GO' : 'NO_GO',
  steps: summary,
};

const reportPath = resolve(parsed.reportPath ?? defaultReportPath(parsed.version));
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

recordEvidence({
  runner: 'release-evaluate',
  ok,
  reportPath,
  version: parsed.version,
  gate: report.gate,
  stepCount: summary.length,
});

if (!ok) {
  console.error(`[evermemory:release-evaluate] NO_GO report=${reportPath}`);
  process.exit(1);
}

console.log(`[evermemory:release-evaluate] GO report=${reportPath}`);
