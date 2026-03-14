#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

const HISTORY_PATH = resolve(process.cwd(), '.openclaw/reports/kpi-history.json');
const HISTORY_LIMIT = 10;
const KPI_DEFINITIONS = {
  recallBenchmarkAccuracy: { type: 'number', min: 0.96 },
  unitTestPassRate: { type: 'number', min: 1 },
  crossSessionContinuityPass: { type: 'boolean', min: true },
  autoCaptureAcceptRate: { type: 'number', min: 0.7 },
};

function fail(message) {
  console.error(`[evermemory:kpi-tracker] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {
    unitPassRate: undefined,
    crossSessionPass: undefined,
    autoCaptureRate: undefined,
    reportPath: undefined,
    updateBaseline: false,
    recallReportPath: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      fail(`unsupported argument: ${arg}`);
    }
    const [flag, inlineValue] = arg.split('=', 2);
    const readValue = () => {
      if (inlineValue !== undefined) {
        return inlineValue;
      }
      const next = argv[index + 1];
      if (!next) {
        fail(`missing value for ${flag}`);
      }
      index += 1;
      return next;
    };

    if (flag === '--unit-pass-rate') {
      parsed.unitPassRate = parseRate('unit-pass-rate', readValue());
      continue;
    }
    if (flag === '--cross-session-pass') {
      parsed.crossSessionPass = parseBoolean('cross-session-pass', readValue());
      continue;
    }
    if (flag === '--auto-capture-rate') {
      parsed.autoCaptureRate = parseRate('auto-capture-rate', readValue());
      continue;
    }
    if (flag === '--report-path') {
      parsed.reportPath = resolve(readValue());
      continue;
    }
    if (flag === '--recall-report') {
      parsed.recallReportPath = resolve(readValue());
      continue;
    }
    if (flag === '--update-baseline') {
      parsed.updateBaseline = true;
      continue;
    }

    fail(`unsupported argument: ${flag}`);
  }

  return parsed;
}

function parseRate(label, value) {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    fail(`invalid ${label} (expected 0-1): ${value}`);
  }
  return Number(number.toFixed(4));
}

function parseBoolean(label, value) {
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'pass'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'fail'].includes(normalized)) {
    return false;
  }
  fail(`invalid ${label} (expected boolean): ${value}`);
}

function defaultReportPath() {
  const stamp = new Date().toISOString().replaceAll(':', '-');
  return `/tmp/evermemory-kpi-report-${stamp}.json`;
}

function formatNumber(value) {
  if (value === undefined || value === null) {
    return '--';
  }
  const rounded = Math.round(Number(value) * 10000) / 10000;
  const fixed = rounded.toFixed(4);
  return fixed.replace(/\.?0+$/, '');
}

function formatSigned(value) {
  if (value === undefined || value === null) {
    return '--';
  }
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${formatNumber(Math.abs(value))}`;
}

function ensureParent(path) {
  mkdirSync(dirname(path), { recursive: true });
}

function readJson(path, context) {
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`failed to read ${context}: ${path} (${detail})`);
  }
}

function readPackageVersion() {
  const packagePath = resolve(process.cwd(), 'package.json');
  const payload = readJson(packagePath, 'package.json');
  const version = String(payload?.version ?? '').trim();
  if (!version) {
    fail('package.json missing version');
  }
  return version;
}

function findRecallBenchmarkReport(explicitPath) {
  if (explicitPath) {
    if (!existsSync(explicitPath)) {
      fail(`specified recall benchmark report not found: ${explicitPath}`);
    }
    return explicitPath;
  }

  let entries;
  try {
    entries = readdirSync('/tmp');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`unable to read /tmp for recall benchmark reports (${detail})`);
  }

  let latestPath;
  let latestTime = 0;
  for (const entry of entries) {
    if (!entry.startsWith('evermemory-recall-benchmark-') || !entry.endsWith('.json')) {
      continue;
    }
    const fullPath = join('/tmp', entry);
    let stats;
    try {
      stats = statSync(fullPath);
    } catch {
      continue;
    }
    if (!stats.isFile()) {
      continue;
    }
    if (!latestPath || stats.mtimeMs > latestTime) {
      latestPath = fullPath;
      latestTime = stats.mtimeMs;
    }
  }

  if (!latestPath) {
    fail('no recall benchmark report found under /tmp (expected evermemory-recall-benchmark-*.json)');
  }
  return latestPath;
}

function readRecallAccuracy(reportPath) {
  const payload = readJson(reportPath, 'recall benchmark report');
  const accuracy = Number(payload?.totals?.accuracy ?? payload?.accuracy);
  if (!Number.isFinite(accuracy)) {
    fail(`recall benchmark report missing totals.accuracy: ${reportPath}`);
  }
  return Number(accuracy.toFixed(4));
}

function loadHistory() {
  if (!existsSync(HISTORY_PATH)) {
    return [];
  }
  const payload = readJson(HISTORY_PATH, 'KPI history');
  if (!Array.isArray(payload)) {
    fail(`invalid KPI history payload (expected array): ${HISTORY_PATH}`);
  }
  return payload;
}

function computeBaseline(history) {
  const baseline = {};
  for (const entry of history) {
    const kpis = entry?.kpis ?? {};
    for (const [key, value] of Object.entries(kpis)) {
      const definition = KPI_DEFINITIONS[key];
      if (!definition) {
        continue;
      }
      if (definition.type === 'number' && Number.isFinite(value)) {
        baseline[key] = baseline[key] === undefined ? value : Math.max(baseline[key], value);
      } else if (definition.type === 'boolean' && typeof value === 'boolean') {
        baseline[key] = (baseline[key] ?? false) || value;
      }
    }
  }
  return baseline;
}

function evaluateKpis(current, baseline) {
  const evaluations = [];
  for (const [name, definition] of Object.entries(KPI_DEFINITIONS)) {
    const value = current[name];
    if (value === undefined) {
      fail(`missing KPI input: ${name}`);
    }
    const bestHistorical = baseline[name];
    const evaluation = {
      name,
      type: definition.type,
      currentValue: value,
      baselineValue: bestHistorical,
      thresholdValue: undefined,
      regression: false,
      targetOk: true,
    };

    if (definition.type === 'number' && typeof bestHistorical === 'number') {
      evaluation.thresholdValue = Number((bestHistorical * 0.98).toFixed(4));
      if (value < evaluation.thresholdValue) {
        evaluation.regression = true;
      }
    }
    if (definition.type === 'boolean' && bestHistorical === true && value === false) {
      evaluation.regression = true;
    }

    if (definition.type === 'number' && typeof definition.min === 'number') {
      evaluation.targetOk = value >= definition.min;
    }
    if (definition.type === 'boolean' && typeof definition.min === 'boolean') {
      evaluation.targetOk = value === definition.min;
    }

    evaluation.ok = !evaluation.regression && evaluation.targetOk;
    evaluations.push(evaluation);
  }
  return evaluations;
}

function writeHistory(entries) {
  ensureParent(HISTORY_PATH);
  writeFileSync(HISTORY_PATH, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
}

function buildHistoryEntry(version, timestamp, kpis, recallReportPath) {
  return {
    version,
    timestamp,
    recallReportPath,
    kpis,
  };
}

function writeReport(reportPath, payload) {
  ensureParent(reportPath);
  writeFileSync(reportPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

const parsed = parseArgs(process.argv.slice(2));
const version = readPackageVersion();
const recallReportPath = findRecallBenchmarkReport(parsed.recallReportPath);
const recallBenchmarkAccuracy = readRecallAccuracy(recallReportPath);

if (typeof parsed.unitPassRate !== 'number') {
  fail('missing --unit-pass-rate argument');
}
if (typeof parsed.crossSessionPass !== 'boolean') {
  fail('missing --cross-session-pass argument');
}
if (typeof parsed.autoCaptureRate !== 'number') {
  fail('missing --auto-capture-rate argument');
}

const currentKpis = {
  recallBenchmarkAccuracy,
  unitTestPassRate: parsed.unitPassRate,
  crossSessionContinuityPass: parsed.crossSessionPass,
  autoCaptureAcceptRate: parsed.autoCaptureRate,
};

const history = loadHistory();
const baseline = computeBaseline(history);
const evaluations = evaluateKpis(currentKpis, baseline);
const ok = evaluations.every((evaluation) => evaluation.ok);

for (const evaluation of evaluations) {
  if (evaluation.ok) {
    if (evaluation.type === 'number') {
      const delta = evaluation.baselineValue === undefined
        ? undefined
        : Number((evaluation.currentValue - evaluation.baselineValue).toFixed(4));
      console.log(
        `[evermemory:kpi-tracker] current ${evaluation.name}=${formatNumber(evaluation.currentValue)} `
        + `(baseline=${formatNumber(evaluation.baselineValue)}, delta=${formatSigned(delta)}) ✓`,
      );
    } else {
      console.log(
        `[evermemory:kpi-tracker] current ${evaluation.name}=${evaluation.currentValue} `
        + `(baseline=${evaluation.baselineValue === undefined ? '--' : evaluation.baselineValue}) ✓`,
      );
    }
    continue;
  }

  if (evaluation.regression) {
    if (evaluation.type === 'number') {
      console.error(
        `[evermemory:kpi-tracker] REGRESSION ${evaluation.name}: `
        + `${formatNumber(evaluation.currentValue)} < baseline ${formatNumber(evaluation.baselineValue)} `
        + `(threshold ${formatNumber(evaluation.thresholdValue)})`,
      );
    } else {
      console.error(
        `[evermemory:kpi-tracker] REGRESSION ${evaluation.name}: `
        + `${evaluation.currentValue} while historical baseline=true`,
      );
    }
  } else if (!evaluation.targetOk) {
    const requirement = KPI_DEFINITIONS[evaluation.name]?.min;
    if (evaluation.type === 'number') {
      console.error(
        `[evermemory:kpi-tracker] THRESHOLD ${evaluation.name}: `
        + `${formatNumber(evaluation.currentValue)} < required ${formatNumber(requirement)}`,
      );
    } else {
      console.error(
        `[evermemory:kpi-tracker] THRESHOLD ${evaluation.name}: `
        + `expected ${requirement} got ${evaluation.currentValue}`,
      );
    }
  }
}

const now = new Date().toISOString();
const reportPath = parsed.reportPath ?? resolve(defaultReportPath());
const report = {
  generatedAt: now,
  version,
  ok,
  recallReportPath,
  reportPath,
  historyPath: HISTORY_PATH,
  historySize: history.length,
  updateBaselineRequested: parsed.updateBaseline,
  kpis: currentKpis,
  evaluations,
};

writeReport(reportPath, report);

if (parsed.updateBaseline && ok) {
  const entry = buildHistoryEntry(version, now, currentKpis, recallReportPath);
  const nextHistory = [...history, entry];
  const trimmed = nextHistory.length > HISTORY_LIMIT
    ? nextHistory.slice(nextHistory.length - HISTORY_LIMIT)
    : nextHistory;
  writeHistory(trimmed);
  console.log(`[evermemory:kpi-tracker] baseline updated (${trimmed.length} snapshots stored)`);
}

if (!ok) {
  console.error(`[evermemory:kpi-tracker] FAIL report=${reportPath}`);
  process.exit(1);
}

console.log(`[evermemory:kpi-tracker] PASS report=${reportPath}`);
