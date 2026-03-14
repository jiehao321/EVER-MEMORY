#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { recordEvidence, resolveEvidenceDir } from './report-evidence.mjs';

function fail(message) {
  console.error(`[evermemory:stability] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {
    withSoak: false,
    reportPath: undefined,
    autoCaptureRate: undefined,
    crossSessionPass: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--with-soak') {
      parsed.withSoak = true;
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
    if (arg.startsWith('--auto-capture-rate=')) {
      parsed.autoCaptureRate = parseRate(arg.slice('--auto-capture-rate='.length), '--auto-capture-rate');
      continue;
    }
    if (arg === '--auto-capture-rate') {
      const next = argv[index + 1];
      if (!next) {
        fail('missing value for --auto-capture-rate');
      }
      parsed.autoCaptureRate = parseRate(next, '--auto-capture-rate');
      index += 1;
      continue;
    }
    if (arg.startsWith('--cross-session-pass=')) {
      parsed.crossSessionPass = parseBoolean(arg.slice('--cross-session-pass='.length), '--cross-session-pass');
      continue;
    }
    if (arg === '--cross-session-pass') {
      const next = argv[index + 1];
      if (!next) {
        fail('missing value for --cross-session-pass');
      }
      parsed.crossSessionPass = parseBoolean(next, '--cross-session-pass');
      index += 1;
      continue;
    }
    fail(`unsupported argument: ${arg}`);
  }

  return parsed;
}

function parseRate(raw, label) {
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    fail(`invalid ${label} (expected 0-1): ${raw}`);
  }
  return Number(value.toFixed(4));
}

function parseBoolean(raw, label) {
  const normalized = String(raw).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'pass'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'fail'].includes(normalized)) {
    return false;
  }
  fail(`invalid ${label} (expected boolean): ${raw}`);
}

function defaultReportPath(stamp) {
  return resolve(resolveEvidenceDir(), 'stability-reports', `evermemory-stability-${stamp}.json`);
}

function ensureParent(path) {
  mkdirSync(dirname(path), { recursive: true });
}

function runCommand(command, args, options = {}) {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const spawnOptions = {
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: options.capture ? 'utf8' : undefined,
    env: process.env,
  };
  const result = spawnSync(command, args, spawnOptions);
  const endedAt = new Date().toISOString();
  const exitCode = typeof result.status === 'number' ? result.status : 1;
  const payload = {
    command: [command, ...args].join(' '),
    startedAt,
    endedAt,
    durationMs: Date.now() - startMs,
    exitCode,
    ok: exitCode === 0,
  };
  if (options.capture) {
    payload.stdout = (result.stdout ?? '').toString();
    payload.stderr = (result.stderr ?? '').toString();
  }
  return payload;
}

function parseUnitTestSummary(output) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const summary = {
    tests: undefined,
    pass: undefined,
    fail: undefined,
    skipped: undefined,
    cancelled: undefined,
    todo: undefined,
    durationMs: undefined,
  };
  for (const line of lines) {
    if (line.startsWith('# tests ')) {
      summary.tests = Number.parseInt(line.slice('# tests '.length), 10);
      continue;
    }
    if (line.startsWith('# pass ')) {
      summary.pass = Number.parseInt(line.slice('# pass '.length), 10);
      continue;
    }
    if (line.startsWith('# fail ')) {
      summary.fail = Number.parseInt(line.slice('# fail '.length), 10);
      continue;
    }
    if (line.startsWith('# skipped ')) {
      summary.skipped = Number.parseInt(line.slice('# skipped '.length), 10);
      continue;
    }
    if (line.startsWith('# cancelled ')) {
      summary.cancelled = Number.parseInt(line.slice('# cancelled '.length), 10);
      continue;
    }
    if (line.startsWith('# todo ')) {
      summary.todo = Number.parseInt(line.slice('# todo '.length), 10);
      continue;
    }
    if (line.startsWith('# duration_ms ')) {
      summary.durationMs = Number.parseFloat(line.slice('# duration_ms '.length));
    }
  }
  if (typeof summary.tests === 'number' && typeof summary.pass === 'number') {
    summary.passRate = summary.tests > 0 ? Number((summary.pass / summary.tests).toFixed(4)) : 0;
  } else {
    summary.passRate = undefined;
  }
  return summary;
}

function readJson(path, context) {
  try {
    const raw = readFileSync(resolve(path), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`failed to read ${context}: ${path} (${detail})`);
  }
}

function formatNumber(value) {
  if (value === undefined || value === null) {
    return '--';
  }
  const fixed = Number(value).toFixed(4);
  const trimmed = fixed.replace(/0+$/, '');
  return trimmed.endsWith('.') ? `${trimmed}0` : trimmed;
}

function resolveUnitTestFiles() {
  const dirPath = resolve(process.cwd(), 'dist-test/test');
  let entries;
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`failed to read compiled tests from ${dirPath} (${detail})`);
  }
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.js'))
    .map((entry) => resolve(dirPath, entry.name))
    .sort();
  if (files.length === 0) {
    fail(`no compiled test files found under ${dirPath}`);
  }
  return files;
}

const parsed = parseArgs(process.argv.slice(2));
const stamp = new Date().toISOString().replaceAll(':', '-');
const reportPath = resolve(parsed.reportPath ?? defaultReportPath(stamp));
const recallReportPath = `/tmp/evermemory-stability-recall-${stamp}.json`;
const kpiReportPath = `/tmp/evermemory-stability-kpi-${stamp}.json`;
const soakReportPath = parsed.withSoak ? `/tmp/evermemory-stability-soak-${stamp}.json` : undefined;
const totalSteps = 4 + (parsed.withSoak ? 1 : 0);

const metrics = {
  unitTestPassRate: undefined,
  recallBenchmarkAccuracy: undefined,
  crossSessionContinuityPass: parsed.crossSessionPass ?? resolveCrossSessionPass(),
  autoCaptureAcceptRate: parsed.autoCaptureRate ?? resolveAutoCaptureRate(),
};

const artifacts = {
  recallReportPath,
  kpiReportPath,
  soakReportPath,
};

const steps = [];
const runStartedAt = new Date().toISOString();

function resolveCrossSessionPass() {
  const fromEnv = process.env.EVERMEMORY_CROSS_SESSION_PASS;
  if (fromEnv) {
    return parseBoolean(fromEnv, 'EVERMEMORY_CROSS_SESSION_PASS');
  }
  return true;
}

function resolveAutoCaptureRate() {
  const fromEnv = process.env.EVERMEMORY_AUTO_CAPTURE_RATE;
  if (fromEnv) {
    return parseRate(fromEnv, 'EVERMEMORY_AUTO_CAPTURE_RATE');
  }
  return 0.75;
}

function finalize(ok, failureReason) {
  const report = {
    generatedAt: runStartedAt,
    completedAt: new Date().toISOString(),
    ok,
    failureReason: failureReason ?? null,
    config: {
      withSoak: parsed.withSoak,
      crossSessionPass: metrics.crossSessionContinuityPass,
      autoCaptureRate: metrics.autoCaptureAcceptRate,
    },
    metrics,
    artifacts,
    steps,
    nodeVersion: process.version,
    cwd: process.cwd(),
  };

  ensureParent(reportPath);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  recordEvidence({
    runner: 'stability-check',
    ok,
    reportPath,
    withSoak: parsed.withSoak,
    metrics,
    stepCount: steps.length,
  });

  if (!ok) {
    console.error(`[evermemory:stability] FAIL report=${reportPath}`);
    process.exit(1);
  }
  console.log(`[evermemory:stability] PASS report=${reportPath}`);
  process.exit(0);
}

function recordStep(name, label, result) {
  steps.push({
    name,
    label,
    ok: result.ok,
    detail: result.detail ?? null,
    startedAt: result.startedAt,
    endedAt: result.endedAt,
    durationMs: result.durationMs,
    commands: result.commands,
    extra: result.extra ?? null,
  });
  const detail = result.detail ? ` ${result.detail}` : '';
  const status = result.ok ? 'PASS' : 'FAIL';
  console.log(`[evermemory:stability] step ${steps.length}/${totalSteps} ${label} ... ${status}${detail}`);
  if (!result.ok) {
    finalize(false, `${label} failed`);
  }
  return result.extra;
}

function aggregate(commands, detail, extra) {
  return {
    ok: commands.every((command) => command.ok),
    detail,
    startedAt: commands[0]?.startedAt,
    endedAt: commands[commands.length - 1]?.endedAt,
    durationMs: commands.reduce((sum, command) => sum + (command.durationMs ?? 0), 0),
    commands: commands.map((command) => ({
      command: command.command,
      startedAt: command.startedAt,
      endedAt: command.endedAt,
      durationMs: command.durationMs,
      exitCode: command.exitCode,
      ok: command.ok,
    })),
    extra,
  };
}

const buildStep = runCommand('node', ['./scripts/build-if-needed.mjs']);
if (!buildStep.ok) {
  console.error('[evermemory:stability] build-if-needed failed');
  finalize(false, 'build-if-needed failed');
}
steps.push({
  name: 'build-check',
  label: 'build-check',
  ok: true,
  detail: 'dist ready',
  startedAt: buildStep.startedAt,
  endedAt: buildStep.endedAt,
  durationMs: buildStep.durationMs,
  commands: [{
    command: buildStep.command,
    startedAt: buildStep.startedAt,
    endedAt: buildStep.endedAt,
    durationMs: buildStep.durationMs,
    exitCode: buildStep.exitCode,
    ok: true,
  }],
});
console.log(`[evermemory:stability] step 1/${totalSteps} build-check ... PASS`);

const unitCommands = [];
const buildTest = runCommand('npm', ['run', 'build:test']);
unitCommands.push(buildTest);
if (!buildTest.ok) {
  recordStep('unit-tests', 'unit-tests', aggregate(unitCommands, null, null));
}
const unitTestFiles = resolveUnitTestFiles();
const unitRun = runCommand('node', ['--test', ...unitTestFiles], { capture: true });
unitCommands.push(unitRun);
if (unitRun.stdout) {
  process.stdout.write(unitRun.stdout);
}
if (unitRun.stderr) {
  process.stderr.write(unitRun.stderr);
}
const unitSummary = parseUnitTestSummary(`${unitRun.stdout ?? ''}\n${unitRun.stderr ?? ''}`);
metrics.unitTestPassRate = unitSummary.passRate ?? 0;
const unitDetail = (typeof unitSummary.tests === 'number' && typeof unitSummary.pass === 'number')
  ? `(${unitSummary.pass}/${unitSummary.tests})`
  : undefined;
recordStep('unit-tests', 'unit-tests', aggregate(unitCommands, unitDetail, { unitSummary, unitTestFiles }));

const recallCommands = [];
const recallRun = runCommand('node', ['./scripts/recall-benchmark.mjs', '--report', recallReportPath]);
recallCommands.push(recallRun);
if (!recallRun.ok) {
  recordStep('recall-benchmark', 'recall-benchmark', aggregate(recallCommands, null, null));
}
const recallPayload = readJson(recallReportPath, 'recall benchmark report');
const accuracy = Number(recallPayload?.totals?.accuracy ?? recallPayload?.accuracy);
metrics.recallBenchmarkAccuracy = Number.isFinite(accuracy) ? Number(accuracy.toFixed(4)) : undefined;
const recallDetail = metrics.recallBenchmarkAccuracy !== undefined
  ? `(accuracy=${formatNumber(metrics.recallBenchmarkAccuracy)})`
  : undefined;
recordStep('recall-benchmark', 'recall-benchmark', aggregate(recallCommands, recallDetail, {
  recall: recallPayload,
}));

const kpiCommands = [];
const kpiArgs = [
  './scripts/kpi-tracker.mjs',
  `--unit-pass-rate=${metrics.unitTestPassRate ?? 0}`,
  `--cross-session-pass=${metrics.crossSessionContinuityPass ? 'true' : 'false'}`,
  `--auto-capture-rate=${metrics.autoCaptureAcceptRate}`,
  `--report-path=${kpiReportPath}`,
  `--recall-report=${recallReportPath}`,
];
const kpiRun = runCommand('node', kpiArgs);
kpiCommands.push(kpiRun);
const kpiDetail = kpiRun.ok ? '(no regression)' : undefined;
recordStep('kpi-check', 'kpi-check', aggregate(kpiCommands, kpiDetail, null));

if (parsed.withSoak) {
  const soakCommands = [];
  const soakArgs = [
    './scripts/openclaw-real-soak.mjs',
    '--iterations=2',
    '--security-every=1',
    '--report',
    soakReportPath,
  ];
  const soakRun = runCommand('node', soakArgs);
  soakCommands.push(soakRun);
  recordStep('soak', 'soak', aggregate(soakCommands, null, null));
}

finalize(true);
