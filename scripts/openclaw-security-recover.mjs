#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { recordEvidence } from './report-evidence.mjs';

function fail(message) {
  console.error(`[evermemory:openclaw-security-recover] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {
    deep: false,
    withRelease: false,
    forceHarden: false,
    configPath: join(homedir(), '.openclaw', 'openclaw.json'),
    reportPath: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--deep') {
      parsed.deep = true;
      continue;
    }
    if (arg === '--with-release') {
      parsed.withRelease = true;
      continue;
    }
    if (arg === '--force-harden') {
      parsed.forceHarden = true;
      continue;
    }
    if (arg === '--config') {
      const next = argv[index + 1];
      if (!next) {
        fail('missing value for --config');
      }
      parsed.configPath = next;
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
    fail(`unsupported argument: ${arg}`);
  }

  return parsed;
}

function nowIso() {
  return new Date().toISOString();
}

function stamp() {
  return nowIso().replaceAll(':', '-');
}

function defaultReportPath() {
  return join(tmpdir(), `evermemory-openclaw-security-recover-${stamp()}.json`);
}

function resolveSecurityGateReportPath(tag) {
  return join(tmpdir(), `evermemory-openclaw-security-gate-${tag}-${stamp()}.json`);
}

function runStep(name, command, args) {
  const startedAt = nowIso();
  const start = Date.now();
  const run = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
  });
  const endedAt = nowIso();
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

function readJsonIfExists(path) {
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

const parsed = parseArgs(process.argv.slice(2));
const reportPath = resolve(parsed.reportPath ?? defaultReportPath());
const beforeReportPath = resolveSecurityGateReportPath('before');
const afterReportPath = resolveSecurityGateReportPath('after');

const steps = [];

const securityGateBefore = runStep(
  'security-gate-before',
  'node',
  [
    './scripts/openclaw-security-gate.mjs',
    ...(parsed.deep ? ['--deep'] : []),
    '--report',
    beforeReportPath,
  ],
);
steps.push(securityGateBefore);

const beforeReport = readJsonIfExists(beforeReportPath);
const beforeSummary = beforeReport?.summary ?? {};
const beforeCritical = Number.isInteger(beforeSummary.critical) ? beforeSummary.critical : undefined;
const beforeWarn = Number.isInteger(beforeSummary.warn) ? beforeSummary.warn : undefined;

const needRecover = parsed.forceHarden || !securityGateBefore.ok;
let recovered = false;
let releaseStep;
let securityGateAfter;

if (needRecover) {
  const hardenStep = runStep(
    'openclaw-harden',
    'node',
    [
      './scripts/openclaw-host-hardening.mjs',
      '--config',
      resolve(parsed.configPath),
    ],
  );
  steps.push(hardenStep);
  if (!hardenStep.ok) {
    fail('hardening step failed');
  }

  securityGateAfter = runStep(
    'security-gate-after',
    'node',
    [
      './scripts/openclaw-security-gate.mjs',
      ...(parsed.deep ? ['--deep'] : []),
      '--report',
      afterReportPath,
    ],
  );
  steps.push(securityGateAfter);
  recovered = securityGateAfter.ok;
}

if (parsed.withRelease) {
  releaseStep = runStep('teams-release', 'npm', ['run', 'teams:release']);
  steps.push(releaseStep);
}

const afterReport = readJsonIfExists(afterReportPath);
const afterSummary = afterReport?.summary ?? {};
const afterCritical = Number.isInteger(afterSummary.critical) ? afterSummary.critical : undefined;
const afterWarn = Number.isInteger(afterSummary.warn) ? afterSummary.warn : undefined;

const ok = steps.every((step) => step.ok) && (needRecover ? recovered : true);

const report = {
  generatedAt: nowIso(),
  ok,
  deep: parsed.deep,
  withRelease: parsed.withRelease,
  forceHarden: parsed.forceHarden,
  configPath: resolve(parsed.configPath),
  beforeReportPath,
  afterReportPath: needRecover ? afterReportPath : undefined,
  summary: {
    needRecover,
    recovered,
    before: {
      ok: securityGateBefore.ok,
      critical: beforeCritical,
      warn: beforeWarn,
    },
    after: needRecover
      ? {
          ok: securityGateAfter?.ok ?? false,
          critical: afterCritical,
          warn: afterWarn,
        }
      : undefined,
  },
  steps,
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

recordEvidence({
  runner: 'security-recover',
  ok,
  reportPath,
  needRecover,
  recovered,
  deep: parsed.deep,
  withRelease: parsed.withRelease,
  beforeCritical,
  beforeWarn,
  afterCritical,
  afterWarn,
});

if (!ok) {
  console.error(`[evermemory:openclaw-security-recover] FAIL report=${reportPath}`);
  process.exit(1);
}

console.log('[evermemory:openclaw-security-recover] PASS');
console.log(`[evermemory:openclaw-security-recover] report=${reportPath}`);
console.log(`[evermemory:openclaw-security-recover] needRecover=${needRecover} recovered=${recovered}`);
console.log(`[evermemory:openclaw-security-recover] before critical=${beforeCritical ?? 'n/a'} warn=${beforeWarn ?? 'n/a'}`);
if (needRecover) {
  console.log(`[evermemory:openclaw-security-recover] after critical=${afterCritical ?? 'n/a'} warn=${afterWarn ?? 'n/a'}`);
}
