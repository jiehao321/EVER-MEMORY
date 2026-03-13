#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import Database from 'better-sqlite3';
import { cleanupOpenClawTestArtifacts } from './openclaw-test-cleanup.mjs';

const DEFAULT_DB_PATH = '/root/.openclaw/memory/evermemory/store/evermemory.db';
const DEFAULT_AGENT_ID = process.env.EVERMEMORY_FEISHU_AGENT_ID ?? 'main';
const EXPLICIT_SESSION_ID = process.env.EVERMEMORY_FEISHU_SESSION_ID;
const SESSION_KEY_HINT = process.env.EVERMEMORY_FEISHU_SESSION_KEY_HINT ?? 'feishu:default:direct';

function fail(message, detail) {
  const error = new Error(message);
  if (detail) {
    error.cause = detail;
  }
  throw error;
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

function sqlNow() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function sqlMinutesAgo(minutes) {
  const value = new Date(Date.now() - (minutes * 60 * 1000));
  return value.toISOString().slice(0, 19).replace('T', ' ');
}

function resolveFeishuSessionId(agentId) {
  if (EXPLICIT_SESSION_ID) {
    return EXPLICIT_SESSION_ID;
  }

  const raw = runOpenClaw(['sessions', '--all-agents', '--json']);
  const data = parseLooseJson(raw, 'sessions list');
  const sessions = Array.isArray(data?.sessions) ? data.sessions : [];

  const candidates = sessions
    .filter((entry) => typeof entry?.key === 'string' && typeof entry?.sessionId === 'string')
    .filter((entry) => entry.key.includes(`agent:${agentId}:feishu:`))
    .filter((entry) => entry.key.includes(':direct:'));

  if (candidates.length === 0) {
    fail(
      `no Feishu direct session found for agent=${agentId}; set EVERMEMORY_FEISHU_SESSION_ID explicitly`,
      'Tip: run `openclaw sessions --all-agents --json` and choose a feishu direct sessionId',
    );
  }

  const hinted = candidates.find((entry) => entry.key.includes(SESSION_KEY_HINT));
  return (hinted ?? candidates[0]).sessionId;
}

function runDialogueTurn(agentId, sessionId, message) {
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
    return undefined;
  })();

  return {
    runId: String(parsed?.runId ?? ''),
    sessionId: actualSessionId ?? sessionId,
    text,
  };
}

function loadEvidence({ dbPath, sessionIds, tag, startedAtSql }) {
  let db;
  try {
    db = new Database(dbPath, { readonly: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`failed to open db: ${dbPath}`, detail);
  }

  try {
    const uniqueSessionIds = Array.from(new Set(sessionIds.filter((item) => typeof item === 'string' && item.length > 0)));
    if (uniqueSessionIds.length === 0) {
      fail('loadEvidence received empty session id set');
    }

    const sessionPlaceholders = uniqueSessionIds.map(() => '?').join(', ');
    const interactionLikeClause = uniqueSessionIds.map(() => 'payload_json LIKE ?').join(' OR ');

    const sessionEndRows = db.prepare(`
      SELECT id, created_at, payload_json
      FROM debug_events
      WHERE kind = 'session_end_processed'
        AND entity_id IN (${sessionPlaceholders})
        AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT 12
    `).all(...uniqueSessionIds, startedAtSql);

    const interactionRows = db.prepare(`
      SELECT id, created_at, payload_json
      FROM debug_events
      WHERE kind = 'interaction_processed'
        AND (${interactionLikeClause})
        AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(...uniqueSessionIds.map((sessionId) => `%${sessionId}%`), startedAtSql);

    const retrievalRows = db.prepare(`
      SELECT id, created_at, payload_json
      FROM debug_events
      WHERE kind = 'retrieval_executed'
        AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(startedAtSql);

    const memories = db.prepare(`
      SELECT id, created_at, type, source_kind, retrieval_count, last_accessed_at, content
      FROM memory_items
      WHERE session_id IN (${sessionPlaceholders})
        AND content LIKE ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(...uniqueSessionIds, `%${tag}%`);

    const sessionEnd = sessionEndRows.map((row) => {
      const payload = JSON.parse(String(row.payload_json));
      return {
        id: String(row.id),
        createdAt: String(row.created_at),
        autoMemoryAccepted: Number(payload.autoMemoryAccepted ?? 0),
      };
    });

    const interactions = interactionRows.map((row) => {
      const payload = JSON.parse(String(row.payload_json));
      return {
        id: String(row.id),
        createdAt: String(row.created_at),
        memoryNeed: String(payload.memoryNeed ?? ''),
        recalled: Number(payload.recalled ?? 0),
      };
    });

    const retrieval = retrievalRows.map((row) => {
      const payload = JSON.parse(String(row.payload_json));
      return {
        id: String(row.id),
        createdAt: String(row.created_at),
        query: String(payload.query ?? ''),
        returned: Number(payload.returned ?? 0),
      };
    });

    return {
      sessionEnd,
      interactions,
      retrieval,
      memoryCount: memories.length,
    };
  } finally {
    db?.close();
  }
}

const dbPath = process.env.EVERMEMORY_DB_PATH ?? DEFAULT_DB_PATH;
const agentId = DEFAULT_AGENT_ID;
const tag = `QGENT-${Date.now()}`;
const startedAtSql = sqlMinutesAgo(10);
let sessionId = '';
const trackedSessionIds = new Set();
let scriptError;
let runtimeSessionId = '';

try {
  sessionId = resolveFeishuSessionId(agentId);
  trackedSessionIds.add(sessionId);
  console.log(`[evermemory:feishu-qgent-e2e] using agentId=${agentId} sessionId=${sessionId}`);

  runOpenClaw(['gateway', 'status']);
  const pluginInfo = runOpenClaw(['plugins', 'info', 'evermemory']);
  if (!pluginInfo.includes('Status: loaded')) {
    fail('evermemory plugin is not loaded');
  }

  runtimeSessionId = sessionId;

  const first = runDialogueTurn(
    agentId,
    runtimeSessionId,
    `项目代号${tag}：当前已完成记忆保存修复，下一步是记忆衰减策略落地，发布前必须做 openclaw 真实对话实测。`,
  );
  runtimeSessionId = first.sessionId;
  trackedSessionIds.add(first.sessionId);

  const second = runDialogueTurn(
    agentId,
    runtimeSessionId,
    `${tag} 的当前进展和下一步是什么？请按我们之前对话做状态汇报。`,
  );
  runtimeSessionId = second.sessionId;
  trackedSessionIds.add(second.sessionId);

  const third = runDialogueTurn(
    agentId,
    runtimeSessionId,
    `请基于之前记忆，再复述 ${tag} 的发布前约束。`,
  );
  runtimeSessionId = third.sessionId;
  trackedSessionIds.add(third.sessionId);

  const evidenceSessionIds = Array.from(new Set([sessionId, first.sessionId, second.sessionId, third.sessionId]));

  const evidence = loadEvidence({
    dbPath,
    sessionIds: evidenceSessionIds,
    tag,
    startedAtSql,
  });

  const hasAutoMemory = evidence.sessionEnd.some((item) => item.autoMemoryAccepted > 0);
  const hasRecallHit = evidence.interactions.some((item) => (
    (item.memoryNeed === 'deep' || item.memoryNeed === 'targeted')
    && item.recalled > 0
  ));
  const hasTagInReply = second.text.includes(tag) || third.text.includes(tag);

  if (!hasAutoMemory) {
    fail('validation failed: no auto memory accepted in session_end_processed');
  }
  if (!hasRecallHit) {
    fail('validation failed: no targeted/deep recall hit in interaction_processed evidence');
  }
  if (!hasTagInReply) {
    fail('validation failed: dialogue reply did not include tagged continuity signal');
  }
  if (evidence.memoryCount <= 0) {
    fail('validation failed: no tagged memory row persisted for this session');
  }

  console.log('[evermemory:feishu-qgent-e2e] PASS');
  console.log(`[evermemory:feishu-qgent-e2e] agentId=${agentId}`);
  console.log(`[evermemory:feishu-qgent-e2e] resolvedSessionId=${sessionId}`);
  console.log(`[evermemory:feishu-qgent-e2e] runtimeSessionId=${runtimeSessionId}`);
  console.log(`[evermemory:feishu-qgent-e2e] evidenceSessionIds=${evidenceSessionIds.join(',')}`);
  console.log(`[evermemory:feishu-qgent-e2e] tag=${tag}`);
  console.log(`[evermemory:feishu-qgent-e2e] turnRunIds=${[first.runId, second.runId, third.runId].join(',')}`);
  console.log(`[evermemory:feishu-qgent-e2e] autoMemoryEvents=${evidence.sessionEnd.length}`);
  console.log(`[evermemory:feishu-qgent-e2e] recallHitEvents=${evidence.interactions.filter((item) => (
    (item.memoryNeed === 'deep' || item.memoryNeed === 'targeted')
    && item.recalled > 0
  )).length}`);
  console.log(`[evermemory:feishu-qgent-e2e] retrievalHits(window)=${evidence.retrieval.filter((item) => item.returned > 0).length}`);
  console.log(`[evermemory:feishu-qgent-e2e] taggedMemoryRows=${evidence.memoryCount}`);
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
    console.log(`[evermemory:feishu-qgent-e2e] cleanup tag=${tag} totalDeleted=${totalDeleted}`);
  } catch (error) {
    if (!scriptError) {
      scriptError = error;
    } else {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`[evermemory:feishu-qgent-e2e] cleanup failed: ${detail}`);
    }
  }
}

if (scriptError) {
  const detail = scriptError instanceof Error ? scriptError.message : String(scriptError);
  const cause = scriptError instanceof Error && scriptError.cause ? ` detail=${String(scriptError.cause)}` : '';
  console.error(`[evermemory:feishu-qgent-e2e] FAIL ${detail}${cause}`);
  process.exit(1);
}
