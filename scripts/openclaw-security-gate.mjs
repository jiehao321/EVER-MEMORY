#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

function fail(message) {
  console.error(`[evermemory:openclaw-security-gate] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {
    deep: false,
    baselinePath: './config/openclaw-security-baseline.json',
    reportPath: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--deep') {
      parsed.deep = true;
      continue;
    }
    if (arg === '--baseline') {
      const next = argv[index + 1];
      if (!next) {
        fail('missing value for --baseline');
      }
      parsed.baselinePath = next;
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

function defaultReportPath() {
  const stamp = new Date().toISOString().replaceAll(':', '-');
  return `/tmp/evermemory-openclaw-security-gate-${stamp}.json`;
}

function parseAuditJson(output) {
  const text = String(output ?? '').trim();
  if (!text) {
    fail('security audit output is empty');
  }

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) {
      fail('security audit output does not contain JSON');
    }
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      fail(`failed to parse security audit JSON: ${detail}`);
    }
  }
}

function loadBaseline(pathValue) {
  const fullPath = resolve(pathValue);
  let payload;
  try {
    payload = readFileSync(fullPath, 'utf8');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`cannot read baseline file ${fullPath}: ${detail}`);
  }

  let json;
  try {
    json = JSON.parse(payload);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`invalid baseline JSON ${fullPath}: ${detail}`);
  }

  const maxSummary = json?.maxSummary ?? {};
  const maxCritical = Number.isInteger(maxSummary.critical) ? maxSummary.critical : 0;
  const maxWarn = Number.isInteger(maxSummary.warn) ? maxSummary.warn : Number.MAX_SAFE_INTEGER;
  const allowedCriticalCheckIds = Array.isArray(json?.allowedCriticalCheckIds)
    ? json.allowedCriticalCheckIds.filter((item) => typeof item === 'string')
    : [];

  return {
    fullPath,
    maxCritical,
    maxWarn,
    allowedCriticalCheckIds,
  };
}

function runAudit(deep) {
  const args = ['security', 'audit', '--json'];
  if (deep) {
    args.push('--deep');
  }

  try {
    return execFileSync('openclaw', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`openclaw security audit failed: ${detail}`);
  }
}

function findingIds(findings, severity) {
  return findings
    .filter((finding) => String(finding?.severity) === severity)
    .map((finding) => String(finding?.checkId ?? 'unknown'));
}

const parsed = parseArgs(process.argv.slice(2));
const baseline = loadBaseline(parsed.baselinePath);
const rawAudit = runAudit(parsed.deep);
const audit = parseAuditJson(rawAudit);
const summary = audit?.summary ?? {};
const findings = Array.isArray(audit?.findings) ? audit.findings : [];

const critical = Number.isInteger(summary.critical) ? summary.critical : findingIds(findings, 'critical').length;
const warn = Number.isInteger(summary.warn) ? summary.warn : findingIds(findings, 'warn').length;
const criticalIds = findingIds(findings, 'critical');
const unexpectedCriticalIds = criticalIds.filter((item) => !baseline.allowedCriticalCheckIds.includes(item));

const failures = [];
if (critical > baseline.maxCritical) {
  failures.push(`critical findings ${critical} exceed baseline ${baseline.maxCritical}`);
}
if (warn > baseline.maxWarn) {
  failures.push(`warn findings ${warn} exceed baseline ${baseline.maxWarn}`);
}
if (unexpectedCriticalIds.length > 0) {
  failures.push(`unexpected critical check ids: ${unexpectedCriticalIds.join(', ')}`);
}

const report = {
  generatedAt: new Date().toISOString(),
  ok: failures.length === 0,
  deep: parsed.deep,
  baseline: {
    path: baseline.fullPath,
    maxCritical: baseline.maxCritical,
    maxWarn: baseline.maxWarn,
    allowedCriticalCheckIds: baseline.allowedCriticalCheckIds,
  },
  summary: {
    critical,
    warn,
    info: Number.isInteger(summary.info) ? summary.info : findingIds(findings, 'info').length,
  },
  criticalCheckIds: criticalIds,
  unexpectedCriticalCheckIds: unexpectedCriticalIds,
  failureReasons: failures,
};

const reportPath = resolve(parsed.reportPath ?? defaultReportPath());
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (failures.length > 0) {
  console.error(`[evermemory:openclaw-security-gate] FAIL report=${reportPath}`);
  for (const reason of failures) {
    console.error(`[evermemory:openclaw-security-gate] ${reason}`);
  }
  process.exit(1);
}

console.log(`[evermemory:openclaw-security-gate] PASS report=${reportPath}`);
console.log(`[evermemory:openclaw-security-gate] summary critical=${critical}, warn=${warn}`);
