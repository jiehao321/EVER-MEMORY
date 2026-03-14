#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { recordEvidence, resolveEvidenceDir } from './report-evidence.mjs';

function fail(message, detail) {
  console.error(`[evermemory:recall-benchmark] ${message}`);
  if (detail) {
    console.error(`[evermemory:recall-benchmark] detail=${detail}`);
  }
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {
    configPath: './config/recall-benchmark-samples.json',
    reportPath: undefined,
    baselinePath: undefined,
    updateBaseline: false,
    minAccuracy: 0.9,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
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
    if (arg === '--baseline') {
      const next = argv[index + 1];
      if (!next) {
        fail('missing value for --baseline');
      }
      parsed.baselinePath = next;
      index += 1;
      continue;
    }
    if (arg === '--update-baseline') {
      parsed.updateBaseline = true;
      continue;
    }
    if (arg === '--min-accuracy') {
      const next = argv[index + 1];
      if (!next) {
        fail('missing value for --min-accuracy');
      }
      const value = Number.parseFloat(next);
      if (!Number.isFinite(value) || value <= 0 || value > 1) {
        fail(`invalid --min-accuracy value: ${next}`);
      }
      parsed.minAccuracy = value;
      index += 1;
      continue;
    }
    fail(`unsupported argument: ${arg}`);
  }

  return parsed;
}

function defaultReportPath() {
  const stamp = new Date().toISOString().replaceAll(':', '-');
  return `/tmp/evermemory-recall-benchmark-${stamp}.json`;
}

function defaultBaselinePath() {
  return resolve(resolveEvidenceDir(), 'recall-benchmark-baseline.json');
}

function ensureParent(path) {
  mkdirSync(dirname(path), { recursive: true });
}

function readJson(path, context) {
  let raw;
  try {
    raw = readFileSync(resolve(path), 'utf8');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`failed to read ${context}: ${path}`, detail);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`invalid JSON for ${context}: ${path}`, detail);
  }
}

function readOptionalJson(path) {
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isTestNoise(item) {
  const content = String(item?.content ?? '').toLowerCase();
  const tags = Array.isArray(item?.tags)
    ? item.tags.map((tag) => String(tag).toLowerCase())
    : [];
  const sourceKind = String(item?.source?.kind ?? '').toLowerCase();

  if (sourceKind === 'test') {
    return true;
  }
  if (content.includes('openclaw-smoke') || content.includes('e2e-') || content.includes('test sample')) {
    return true;
  }
  return tags.some((tag) => (
    tag.includes('smoke')
    || tag.includes('fixture')
    || tag.includes('test')
    || tag.includes('mock')
  ));
}

function summarizeByCategory(results) {
  const map = new Map();
  for (const result of results) {
    const row = map.get(result.category) ?? { total: 0, passed: 0 };
    row.total += 1;
    if (result.pass) {
      row.passed += 1;
    }
    map.set(result.category, row);
  }

  return Array.from(map.entries()).map(([category, row]) => ({
    category,
    total: row.total,
    passed: row.passed,
    accuracy: row.total > 0 ? Number((row.passed / row.total).toFixed(4)) : 0,
  }));
}

async function loadInitializer() {
  try {
    const module = await import('../dist/index.js');
    if (typeof module.initializeEverMemory !== 'function') {
      fail('dist build does not export initializeEverMemory');
    }
    return module.initializeEverMemory;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail('failed to load ../dist/index.js (run `npm run build` first)', detail);
  }
}

const parsed = parseArgs(process.argv.slice(2));
const configPath = resolve(parsed.configPath);
const reportPath = resolve(parsed.reportPath ?? defaultReportPath());
const baselinePath = resolve(parsed.baselinePath ?? defaultBaselinePath());
const config = readJson(configPath, 'benchmark config');

if (!config || typeof config !== 'object') {
  fail('invalid benchmark config payload');
}

const scope = config.scope ?? {};
if (!scope.userId || !scope.project) {
  fail('benchmark scope must include userId and project');
}
const seedMemories = Array.isArray(config.seedMemories) ? config.seedMemories : [];
const samples = Array.isArray(config.samples) ? config.samples : [];

if (seedMemories.length < 3) {
  fail('benchmark config seedMemories is too small');
}
if (samples.length < 20) {
  fail('benchmark config samples must include at least 20 entries');
}

const initializeEverMemory = await loadInitializer();
const databasePath = `/tmp/evermemory-recall-benchmark-db-${Date.now()}.db`;
  const app = initializeEverMemory({ databasePath, maxRecall: 8 });

const startedAt = new Date().toISOString();

try {
  for (const memory of seedMemories) {
    const storeResult = app.evermemoryStore({
      content: String(memory.content ?? ''),
      type: memory.type,
      scope: {
        userId: scope.userId,
        project: scope.project,
      },
      tags: Array.isArray(memory.tags) ? memory.tags : undefined,
      source: memory.source,
    });
    if (!storeResult.accepted) {
      fail(`failed to seed memory content="${String(memory.content ?? '').slice(0, 40)}"`, storeResult.reason);
    }
  }

  const sampleResults = [];
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    const sampleId = String(sample.id ?? `sample-${index + 1}`);
    const query = String(sample.query ?? '').trim();
    const expectedRouteKind = sample.expectedRouteKind ? String(sample.expectedRouteKind) : undefined;
    const expectedAnyTypes = Array.isArray(sample.expectedAnyTypes)
      ? sample.expectedAnyTypes.map((item) => String(item))
      : [];
    const minHits = Number.isInteger(sample.minHits) ? sample.minHits : 1;
    const requireNoTestNoise = sample.requireNoTestNoise !== false;
    const maxNoisyHits = Number.isInteger(sample.maxNoisyHits)
      ? sample.maxNoisyHits
      : (requireNoTestNoise ? 0 : Number.MAX_SAFE_INTEGER);
    const verifyRoute = sample.verifyRoute === true;

    if (!query) {
      fail(`sample query is empty: id=${sampleId}`);
    }

    const intentType = sample.intentType
      ? String(sample.intentType)
      : (String(sample.category ?? '') === 'next_step' ? 'planning' : 'status_update');
    const recallResult = await app.retrievalService.recallForIntent({
      query: '',
      scope: {
        userId: scope.userId,
        project: scope.project,
      },
      intent: {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        sessionId: `recall-bench-session-${sampleId}`,
        rawText: query,
        intent: {
          type: intentType,
          confidence: 0.95,
        },
        signals: {
          urgency: 'medium',
          emotionalTone: 'neutral',
          actionNeed: 'analysis',
          memoryNeed: 'deep',
          preferenceRelevance: 0.1,
          correctionSignal: 0,
        },
        entities: [],
        retrievalHints: {
          preferredTypes: ['summary', 'project', 'decision', 'commitment', 'constraint', 'task'],
          preferredScopes: ['project', 'user'],
          preferredTimeBias: 'recent',
        },
      },
      limit: 8,
    });

    const event = app.debugRepo.listRecent('retrieval_executed', 1)[0];
    const routeKind = String(event?.payload?.routeKind ?? 'none');
    const recallItems = Array.isArray(recallResult?.items) ? recallResult.items : [];
    const recallTypes = recallItems.map((item) => String(item.type));
    const noisyItems = recallItems.filter((item) => isTestNoise(item));
    const routeOk = verifyRoute && expectedRouteKind ? routeKind === expectedRouteKind : true;
    const hitsOk = (recallResult?.total ?? 0) >= minHits;
    const typeOk = expectedAnyTypes.length > 0
      ? expectedAnyTypes.some((type) => recallTypes.includes(type))
      : true;
    const noiseOk = noisyItems.length <= maxNoisyHits;
    const pass = routeOk && hitsOk && typeOk && noiseOk;

    sampleResults.push({
      id: sampleId,
      category: String(sample.category ?? 'uncategorized'),
      query,
      pass,
      expectedRouteKind: expectedRouteKind ?? null,
      routeKind,
      expectedAnyTypes,
      recallTypes,
      minHits,
      totalHits: recallResult?.total ?? 0,
      verifyRoute,
      requireNoTestNoise,
      maxNoisyHits,
      noisyHits: noisyItems.length,
      failureReasons: [
        ...(!routeOk ? [`route_mismatch(expected=${expectedRouteKind}, actual=${routeKind})`] : []),
        ...(!hitsOk ? [`insufficient_hits(expected>=${minHits}, actual=${recallResult?.total ?? 0})`] : []),
        ...(!typeOk ? [`type_mismatch(expectedAny=${expectedAnyTypes.join('|')}, actual=${recallTypes.join('|')})`] : []),
        ...(!noiseOk ? [`test_noise_detected(actual=${noisyItems.length}, max=${maxNoisyHits})`] : []),
      ],
    });
  }

  const total = sampleResults.length;
  const passed = sampleResults.filter((item) => item.pass).length;
  const accuracy = total > 0 ? passed / total : 0;
  const accuracyRounded = Number(accuracy.toFixed(4));
  const byCategory = summarizeByCategory(sampleResults);
  const baseline = readOptionalJson(baselinePath);
  const baselineAccuracy = Number.isFinite(Number(baseline?.accuracy))
    ? Number(baseline.accuracy)
    : undefined;
  const delta = baselineAccuracy === undefined
    ? undefined
    : Number((accuracyRounded - baselineAccuracy).toFixed(4));
  const ok = accuracyRounded >= parsed.minAccuracy;
  let baselineUpdated = false;

  const report = {
    generatedAt: new Date().toISOString(),
    startedAt,
    configPath,
    databasePath,
    configVersion: String(config.version ?? ''),
    scope,
    minAccuracyGate: parsed.minAccuracy,
    totals: {
      samples: total,
      passed,
      failed: total - passed,
      accuracy: accuracyRounded,
      byCategory,
    },
    baseline: {
      path: baselinePath,
      previousAccuracy: baselineAccuracy,
      delta,
      updated: false,
    },
    samples: sampleResults,
  };

  if (parsed.updateBaseline && ok) {
    const baselinePayload = {
      updatedAt: report.generatedAt,
      sourceReportPath: reportPath,
      configVersion: report.configVersion,
      samples: report.totals.samples,
      passed: report.totals.passed,
      failed: report.totals.failed,
      accuracy: report.totals.accuracy,
      byCategory: report.totals.byCategory,
    };
    ensureParent(baselinePath);
    writeFileSync(baselinePath, `${JSON.stringify(baselinePayload, null, 2)}\n`, 'utf8');
    baselineUpdated = true;
  }
  report.baseline.updated = baselineUpdated;

  ensureParent(reportPath);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  recordEvidence({
    runner: 'recall-benchmark',
    ok,
    reportPath,
    baselinePath,
    sampleCount: total,
    passedCount: passed,
    accuracy: accuracyRounded,
    minAccuracy: parsed.minAccuracy,
    baselineDelta: delta,
  });

  if (!ok) {
    console.error(`[evermemory:recall-benchmark] FAIL report=${reportPath}`);
    console.error(`[evermemory:recall-benchmark] accuracy=${accuracyRounded} < minAccuracy=${parsed.minAccuracy}`);
    process.exit(1);
  }

  console.log('[evermemory:recall-benchmark] PASS');
  console.log(`[evermemory:recall-benchmark] report=${reportPath}`);
  console.log(`[evermemory:recall-benchmark] samples=${total} passed=${passed} accuracy=${accuracyRounded}`);
  if (baselineAccuracy !== undefined) {
    console.log(`[evermemory:recall-benchmark] baseline=${baselineAccuracy} delta=${delta}`);
  }
  if (baselineUpdated) {
    console.log(`[evermemory:recall-benchmark] baselineUpdated=${baselinePath}`);
  }
} finally {
  app.database.connection.close();
  rmSync(databasePath, { force: true });
}
