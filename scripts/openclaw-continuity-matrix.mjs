#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { recordEvidence } from './report-evidence.mjs';

function fail(message) {
  console.error(`[evermemory:openclaw-continuity-matrix] ${message}`);
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
  const parsed = {
    runs: 3,
    keepGoing: false,
    reportPath: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--keep-going') {
      parsed.keepGoing = true;
      continue;
    }
    if (arg.startsWith('--runs=')) {
      parsed.runs = parsePositiveInt(arg.slice('--runs='.length), '--runs');
      continue;
    }
    if (arg === '--runs') {
      const next = argv[index + 1];
      if (!next) {
        fail('missing value for --runs');
      }
      parsed.runs = parsePositiveInt(next, '--runs');
      index += 1;
      continue;
    }
    if (arg.startsWith('--report=')) {
      parsed.reportPath = arg.slice('--report='.length);
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
    fail(`unsupported argument: ${arg}`);
  }

  return parsed;
}

function resolveDefaultReportPath() {
  const stamp = new Date().toISOString().replaceAll(':', '-');
  return join(tmpdir(), `evermemory-openclaw-continuity-matrix-${stamp}.json`);
}

function safeReadJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

function runContinuity(reportPath) {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const result = spawnSync('node', ['./scripts/openclaw-continuity-e2e.mjs', '--report', reportPath], {
    stdio: 'inherit',
    env: process.env,
  });
  const endedAt = new Date().toISOString();
  const exitCode = typeof result.status === 'number' ? result.status : 1;
  return {
    startedAt,
    endedAt,
    durationMs: Date.now() - startMs,
    exitCode,
    ok: exitCode === 0,
  };
}

function average(numbers) {
  if (numbers.length === 0) {
    return 0;
  }
  return Number((numbers.reduce((sum, value) => sum + value, 0) / numbers.length).toFixed(2));
}

const parsed = parseArgs(process.argv.slice(2));
const stamp = new Date().toISOString().replaceAll(':', '-');
const runSummaries = [];
let failed = false;

console.log(`[evermemory:openclaw-continuity-matrix] start runs=${parsed.runs} keepGoing=${parsed.keepGoing}`);

for (let runIndex = 1; runIndex <= parsed.runs; runIndex += 1) {
  const childReportPath = join(tmpdir(), `evermemory-openclaw-continuity-run-${runIndex}-${stamp}.json`);
  console.log(`[evermemory:openclaw-continuity-matrix] run=${runIndex}/${parsed.runs}`);
  const execution = runContinuity(childReportPath);
  const report = safeReadJson(childReportPath);
  const metrics = report?.metrics ?? {};

  runSummaries.push({
    run: runIndex,
    reportPath: childReportPath,
    ...execution,
    memoryCount: Number(metrics.memoryCount ?? 0),
    autoMemoryEvents: Number(metrics.autoMemoryEvents ?? 0),
    recallEvents: Number(metrics.recallEvents ?? 0),
    retrievalEvents: Number(metrics.retrievalEvents ?? 0),
    projectRoutedRetrievalHits: Number(metrics.projectRoutedRetrievalHits ?? 0),
    maxTurnAttempt: Number(metrics.maxTurnAttempt ?? 0),
    sourceKinds: Array.isArray(metrics.sourceKinds) ? metrics.sourceKinds : [],
  });

  if (!execution.ok) {
    failed = true;
    if (!parsed.keepGoing) {
      break;
    }
  }
}

const passedRuns = runSummaries.filter((item) => item.ok);
const sourceKinds = Array.from(new Set(runSummaries.flatMap((item) => item.sourceKinds)));
const report = {
  generatedAt: new Date().toISOString(),
  ok: !failed,
  config: {
    runs: parsed.runs,
    keepGoing: parsed.keepGoing,
  },
  totals: {
    requestedRuns: parsed.runs,
    executedRuns: runSummaries.length,
    passedRuns: passedRuns.length,
    failedRuns: runSummaries.length - passedRuns.length,
  },
  metrics: {
    averageMemoryCount: average(passedRuns.map((item) => item.memoryCount)),
    averageAutoMemoryEvents: average(passedRuns.map((item) => item.autoMemoryEvents)),
    averageRecallEvents: average(passedRuns.map((item) => item.recallEvents)),
    averageRetrievalEvents: average(passedRuns.map((item) => item.retrievalEvents)),
    averageProjectRoutedRetrievalHits: average(passedRuns.map((item) => item.projectRoutedRetrievalHits)),
    maxObservedTurnAttempt: Math.max(0, ...runSummaries.map((item) => item.maxTurnAttempt)),
    sourceKinds,
  },
  runs: runSummaries,
};

const reportPath = resolve(parsed.reportPath ?? resolveDefaultReportPath());
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

recordEvidence({
  runner: 'openclaw-continuity-matrix',
  ok: report.ok,
  reportPath,
  runsRequested: parsed.runs,
  runsExecuted: runSummaries.length,
  passedRuns: passedRuns.length,
  failedRuns: runSummaries.length - passedRuns.length,
  averageMemoryCount: report.metrics.averageMemoryCount,
  averageAutoMemoryEvents: report.metrics.averageAutoMemoryEvents,
  averageRecallEvents: report.metrics.averageRecallEvents,
  maxObservedTurnAttempt: report.metrics.maxObservedTurnAttempt,
});

console.log(`[evermemory:openclaw-continuity-matrix] report=${reportPath}`);
console.log(`[evermemory:openclaw-continuity-matrix] passed=${passedRuns.length}/${runSummaries.length}`);

if (!report.ok) {
  fail('matrix failed');
}

console.log('[evermemory:openclaw-continuity-matrix] PASS');
