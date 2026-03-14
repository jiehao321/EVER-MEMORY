#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { cleanupOpenClawTestArtifacts } from './openclaw-test-cleanup.mjs';
import { recordEvidence } from './report-evidence.mjs';

const DEFAULT_DB_PATH = '/root/.openclaw/memory/evermemory/store/evermemory.db';
const DEFAULT_AGENT_ID = process.env.EVERMEMORY_AGENT_ID ?? 'main';
const DEFAULT_LOOKBACK_MINUTES = 15;
const RETRYABLE_TURN_PATTERNS = [
  'agent returned empty payload text',
  'agent run: empty output',
  'agent run: output is not valid JSON',
  'openclaw command failed: openclaw agent',
];
const OPENCLAW_RETRY_ATTEMPTS = 3;
const OPENCLAW_RETRY_DELAY_MS = 750;

function fail(message, detail) {
  const error = new Error(message);
  if (detail) {
    error.cause = detail;
  }
  throw error;
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
    dbPath: process.env.EVERMEMORY_DB_PATH ?? DEFAULT_DB_PATH,
    agentId: DEFAULT_AGENT_ID,
    lookbackMinutes: DEFAULT_LOOKBACK_MINUTES,
    reportPath: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--db-path=')) {
      parsed.dbPath = arg.slice('--db-path='.length);
      continue;
    }
    if (arg === '--db-path') {
      const next = argv[index + 1];
      if (!next) {
        fail('missing value for --db-path');
      }
      parsed.dbPath = next;
      index += 1;
      continue;
    }
    if (arg.startsWith('--agent=')) {
      parsed.agentId = arg.slice('--agent='.length);
      continue;
    }
    if (arg === '--agent') {
      const next = argv[index + 1];
      if (!next) {
        fail('missing value for --agent');
      }
      parsed.agentId = next;
      index += 1;
      continue;
    }
    if (arg.startsWith('--lookback-minutes=')) {
      parsed.lookbackMinutes = parsePositiveInt(arg.slice('--lookback-minutes='.length), '--lookback-minutes');
      continue;
    }
    if (arg === '--lookback-minutes') {
      const next = argv[index + 1];
      if (!next) {
        fail('missing value for --lookback-minutes');
      }
      parsed.lookbackMinutes = parsePositiveInt(next, '--lookback-minutes');
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
  return `/tmp/evermemory-openclaw-continuity-${stamp}.json`;
}

function runOpenClaw(args) {
  try {
    return execFileSync('openclaw', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`openclaw command failed: openclaw ${args.join(' ')}`, detail);
  }
}

function parseLooseJson(raw, context) {
  const trimmed = raw.trim();
  if (!trimmed) {
    fail(`${context}: empty output`);
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) {
      fail(`${context}: output is not valid JSON`);
    }
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      fail(`${context}: failed to parse JSON`, detail);
    }
  }
}

function sleep(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function runTurn(agentId, sessionId, message) {
  const raw = runOpenClaw([
    'agent',
    '--agent',
    agentId,
    '--session-id',
    sessionId,
    '--message',
    message,
    '--json',
  ]);

  const parsed = parseLooseJson(raw, 'agent run');
  const text = String(parsed?.result?.payloads?.[0]?.text ?? '');
  if (!text.trim()) {
    fail('agent returned empty payload text');
  }
  const actualSessionId = (() => {
    if (typeof parsed?.result?.meta?.systemPromptReport?.sessionId === 'string') {
      return parsed.result.meta.systemPromptReport.sessionId;
    }
    if (typeof parsed?.result?.meta?.agentMeta?.sessionId === 'string') {
      return parsed.result.meta.agentMeta.sessionId;
    }
    return sessionId;
  })();

  return {
    runId: String(parsed?.runId ?? ''),
    text,
    sessionId: actualSessionId,
  };
}

function isRetryableTurnError(error) {
  const detail = error instanceof Error ? `${error.message} ${String(error.cause ?? '')}` : String(error);
  return RETRYABLE_TURN_PATTERNS.some((pattern) => detail.includes(pattern));
}

async function runTurnWithRetry(agentId, sessionId, message) {
  let lastError;
  for (let attempt = 1; attempt <= OPENCLAW_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const result = runTurn(agentId, sessionId, message);
      return {
        ...result,
        attempt,
      };
    } catch (error) {
      lastError = error;
      if (attempt >= OPENCLAW_RETRY_ATTEMPTS || !isRetryableTurnError(error)) {
        throw error;
      }
      await sleep(OPENCLAW_RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

function sqlMinutesAgo(minutes) {
  const value = new Date(Date.now() - minutes * 60 * 1000);
  return value.toISOString().slice(0, 19).replace('T', ' ');
}

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function loadEvidence(dbPath, sessionId, tag, startedAtSql) {
  let db;
  try {
    db = new Database(dbPath, { readonly: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`failed to open db: ${dbPath}`, detail);
  }

  try {
    const memories = db.prepare(`
      SELECT id, type, source_kind, content, retrieval_count, last_accessed_at, created_at
      FROM memory_items
      WHERE session_id = ?
        AND content LIKE ?
      ORDER BY created_at DESC
      LIMIT 30
    `).all(sessionId, `%${tag}%`);

    const sessionEndEvents = db.prepare(`
      SELECT id, created_at, payload_json
      FROM debug_events
      WHERE kind = 'session_end_processed'
        AND entity_id = ?
        AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(sessionId, startedAtSql).map((row) => ({
      id: String(row.id),
      createdAt: String(row.created_at),
      payload: safeParseJson(String(row.payload_json)),
    }));

    const interactionEvents = db.prepare(`
      SELECT id, created_at, payload_json
      FROM debug_events
      WHERE kind = 'interaction_processed'
        AND payload_json LIKE ?
        AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT 30
    `).all(`%${sessionId}%`, startedAtSql).map((row) => ({
      id: String(row.id),
      createdAt: String(row.created_at),
      payload: safeParseJson(String(row.payload_json)),
    }));

    const retrievalEvents = db.prepare(`
      SELECT id, created_at, payload_json
      FROM debug_events
      WHERE kind = 'retrieval_executed'
        AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT 30
    `).all(startedAtSql).map((row) => ({
      id: String(row.id),
      createdAt: String(row.created_at),
      payload: safeParseJson(String(row.payload_json)),
    }));

    return {
      memoryCount: memories.length,
      memorySourceKinds: Array.from(new Set(memories.map((item) => String(item.source_kind)))),
      memoryRows: memories.map((item) => ({
        id: String(item.id),
        type: String(item.type),
        sourceKind: String(item.source_kind),
        retrievalCount: Number(item.retrieval_count ?? 0),
      })),
      sessionEndEvents,
      interactionEvents,
      retrievalEvents,
    };
  } finally {
    db.close();
  }
}

const parsed = parseArgs(process.argv.slice(2));
const dbPath = parsed.dbPath;
const agentId = parsed.agentId;
const startedAtSql = sqlMinutesAgo(parsed.lookbackMinutes);
const tag = `CONT-${Date.now()}`;
const sessionId = `evermemory-continuity-${Date.now()}`;
const trackedSessionIds = new Set([sessionId]);

let scriptError;
const resultReport = {
  generatedAt: new Date().toISOString(),
  ok: false,
  config: {
    dbPath,
    agentId,
    lookbackMinutes: parsed.lookbackMinutes,
  },
  tag,
  sessionId,
  trackedSessionIds: [],
  turns: [],
  metrics: undefined,
  cleanup: undefined,
  error: undefined,
};

try {
  const gatewayStatus = runOpenClaw(['gateway', 'status']);
  if (!gatewayStatus.includes('Runtime: running')) {
    fail('gateway is not running');
  }
  const pluginInfo = runOpenClaw(['plugins', 'info', 'evermemory']);
  if (!pluginInfo.includes('Status: loaded')) {
    fail('evermemory plugin is not loaded');
  }

  const t1 = await runTurnWithRetry(
    agentId,
    sessionId,
    `项目${tag}：当前阶段是 Batch-B 收口，关键约束是不能扩大范围，最近决策是先做真实回归，下一步是完成连续性验证报告。`,
  );
  trackedSessionIds.add(t1.sessionId);
  const t2 = await runTurnWithRetry(
    agentId,
    t1.sessionId,
    `请汇报 ${tag} 的当前阶段和下一步。`,
  );
  trackedSessionIds.add(t2.sessionId);
  const t3 = await runTurnWithRetry(
    agentId,
    t2.sessionId,
    `再复述一下 ${tag} 的关键约束和最近决策。`,
  );
  trackedSessionIds.add(t3.sessionId);
  resultReport.turns = [t1, t2, t3].map((turn, index) => ({
    index: index + 1,
    runId: turn.runId,
    sessionId: turn.sessionId,
    attempt: Number(turn.attempt ?? 1),
    preview: turn.text.slice(0, 240),
  }));

  if (!t2.text.includes(tag) && !t3.text.includes(tag)) {
    fail('continuity reply missing tag reference');
  }

  const evidence = loadEvidence(dbPath, t3.sessionId, tag, startedAtSql);
  const hasAutoMemoryAccepted = evidence.sessionEndEvents.some((event) => Number(event.payload.autoMemoryAccepted ?? 0) > 0);
  const hasRecallHit = evidence.interactionEvents.some((event) => Number(event.payload.recalled ?? 0) > 0);
  const hasProjectRoutedRetrieval = evidence.retrievalEvents.some((event) => {
    const routeKind = String(event.payload.routeKind ?? '');
    const returned = Number(event.payload.returned ?? 0);
    const projectOriented = event.payload.projectOriented === true;
    return (
      (routeKind === 'next_step'
        || routeKind === 'last_decision'
        || routeKind === 'project_progress'
        || routeKind === 'current_stage')
      && returned > 0
      && projectOriented
    );
  });
  const hasRuntimeMemory = evidence.memorySourceKinds.some((kind) => kind === 'runtime_project' || kind === 'reflection_derived');

  if (!hasAutoMemoryAccepted) {
    fail('no session_end_processed event with auto memory accepted');
  }
  if (!hasRecallHit) {
    fail('no interaction_processed event with recall hits');
  }
  if (!hasProjectRoutedRetrieval) {
    fail('no project-oriented retrieval_executed event found in continuity window');
  }
  if (!hasRuntimeMemory) {
    fail(`no runtime memory source kind found, got=${evidence.memorySourceKinds.join(',')}`);
  }
  if (evidence.memoryCount <= 0) {
    fail('no tagged memory rows found in memory_items');
  }

  resultReport.ok = true;
  resultReport.trackedSessionIds = Array.from(trackedSessionIds);
  resultReport.metrics = {
    memoryCount: evidence.memoryCount,
    autoMemoryEvents: evidence.sessionEndEvents.length,
    recallEvents: evidence.interactionEvents.length,
    retrievalEvents: evidence.retrievalEvents.length,
    projectRoutedRetrievalHits: evidence.retrievalEvents.filter((event) => {
      const routeKind = String(event.payload.routeKind ?? '');
      return (
        (routeKind === 'next_step'
          || routeKind === 'last_decision'
          || routeKind === 'project_progress'
          || routeKind === 'current_stage')
        && event.payload.projectOriented === true
        && Number(event.payload.returned ?? 0) > 0
      );
    }).length,
    sourceKinds: evidence.memorySourceKinds,
    maxTurnAttempt: Math.max(...resultReport.turns.map((turn) => Number(turn.attempt ?? 1))),
  };

  console.log('[evermemory:openclaw-continuity] PASS');
  console.log(`[evermemory:openclaw-continuity] agentId=${agentId}`);
  console.log(`[evermemory:openclaw-continuity] sessionId=${t3.sessionId}`);
  console.log(`[evermemory:openclaw-continuity] tag=${tag}`);
  console.log(`[evermemory:openclaw-continuity] runIds=${[t1.runId, t2.runId, t3.runId].join(',')}`);
  console.log(`[evermemory:openclaw-continuity] memoryCount=${evidence.memoryCount}`);
  console.log(`[evermemory:openclaw-continuity] autoMemoryEvents=${evidence.sessionEndEvents.length}`);
  console.log(`[evermemory:openclaw-continuity] recallEvents=${evidence.interactionEvents.length}`);
  console.log(`[evermemory:openclaw-continuity] retrievalEvents(window)=${evidence.retrievalEvents.length}`);
  console.log(`[evermemory:openclaw-continuity] sourceKinds=${evidence.memorySourceKinds.join(',')}`);
} catch (error) {
  scriptError = error;
} finally {
  try {
    const cleanup = cleanupOpenClawTestArtifacts({
      dbPath,
      tag,
      sessionIds: Array.from(trackedSessionIds),
    });
    const totalDeleted = Object.values(cleanup).reduce((sum, value) => sum + Number(value), 0);
    resultReport.cleanup = {
      ...cleanup,
      totalDeleted,
    };
    console.log(`[evermemory:openclaw-continuity] cleanup tag=${tag} totalDeleted=${totalDeleted}`);
  } catch (error) {
    if (!scriptError) {
      scriptError = error;
    } else {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`[evermemory:openclaw-continuity] cleanup failed: ${detail}`);
    }
  }
}

if (scriptError) {
  const detail = scriptError instanceof Error ? scriptError.message : String(scriptError);
  const cause = scriptError instanceof Error && scriptError.cause ? ` detail=${String(scriptError.cause)}` : '';
  resultReport.error = {
    message: detail,
    cause: scriptError instanceof Error && scriptError.cause ? String(scriptError.cause) : undefined,
  };
  console.error(`[evermemory:openclaw-continuity] FAIL ${detail}${cause}`);
}

const reportPath = resolve(parsed.reportPath ?? resolveDefaultReportPath());
resultReport.trackedSessionIds = Array.from(trackedSessionIds);
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(resultReport, null, 2)}\n`, 'utf8');

recordEvidence({
  runner: 'openclaw-continuity',
  ok: resultReport.ok,
  reportPath,
  agentId,
  tag,
  sessionCount: trackedSessionIds.size,
  memoryCount: Number(resultReport.metrics?.memoryCount ?? 0),
  autoMemoryEvents: Number(resultReport.metrics?.autoMemoryEvents ?? 0),
  recallEvents: Number(resultReport.metrics?.recallEvents ?? 0),
  retrievalEvents: Number(resultReport.metrics?.retrievalEvents ?? 0),
  maxTurnAttempt: Number(resultReport.metrics?.maxTurnAttempt ?? 0),
});

console.log(`[evermemory:openclaw-continuity] report=${reportPath}`);

if (scriptError) {
  process.exit(1);
}
