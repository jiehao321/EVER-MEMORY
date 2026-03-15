#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import Database from 'better-sqlite3';

const DEFAULT_DB_PATH = '.openclaw/memory/evermemory/store/evermemory.db';
const DEFAULT_DAYS = 30;

function fail(message, code = 1) {
  process.stderr.write(`[evermemory:growth-report] ${message}\n`);
  process.exit(code);
}

export function parseArgs(argv) {
  const parsed = { dbPath: resolve(process.cwd(), DEFAULT_DB_PATH), days: DEFAULT_DAYS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const nextValue = () => {
      const value = argv[i + 1];
      if (!value) {
        fail(`missing value for ${arg}`);
      }
      i += 1;
      return value;
    };
    if (arg === '--db') {
      parsed.dbPath = resolve(nextValue());
      continue;
    }
    if (arg === '--days') {
      const days = Number.parseInt(nextValue(), 10);
      if (!Number.isInteger(days) || days <= 0) {
        fail(`invalid --days value: ${days}`);
      }
      parsed.days = days;
      continue;
    }
    fail(`unsupported argument: ${arg}`);
  }
  return parsed;
}

function toIsoDay(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function startOfWindow(days, now) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function formatRate(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '0.00';
}

function formatPercent(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function parseJson(value, fallback) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function detectProvider(model) {
  const text = String(model ?? '').toLowerCase();
  if (!text) {
    return 'unknown provider';
  }
  if (text.includes('openai') || text.includes('text-embedding')) {
    return 'openai provider';
  }
  if (text.includes('local') || text.includes('bge') || text.includes('e5') || text.includes('gte')) {
    return 'local provider';
  }
  return `${text} provider`;
}

function rateFromEvents(events) {
  const totals = events.reduce(
    (acc, event) => {
      acc.generated += Number(event.generated) || 0;
      acc.accepted += Number(event.accepted) || 0;
      return acc;
    },
    { generated: 0, accepted: 0 },
  );
  return totals.generated > 0 ? totals.accepted / totals.generated : 0;
}

function buildBar(value, total) {
  const width = 18;
  const filled = total > 0 ? Math.max(1, Math.round((value / total) * width)) : 0;
  return `${'█'.repeat(filled)}${'·'.repeat(Math.max(width - filled, 0))}`;
}

const SMARTNESS_KINDS = [
  'project_state',
  'decision',
  'explicit_constraint',
  'user_preference',
  'next_step',
  'lesson',
  'warning',
];

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function countWindow(rows, recentStart, previousStart) {
  return rows.reduce((acc, row) => {
    if (row.createdAt >= recentStart) {
      acc.recent += 1;
    } else if (row.createdAt >= previousStart) {
      acc.previous += 1;
    }
    return acc;
  }, { recent: 0, previous: 0 });
}

function hasSmartnessKind(row, kind) {
  return row.type === kind || row.tags.includes(kind);
}

function arrow(current, previous) {
  if (current > previous) {
    return '↑';
  }
  if (current < previous) {
    return '↓';
  }
  return '→';
}

function percent(score) {
  return Math.round(clamp(score) * 100);
}

function computeSmartness({ memoryRows, ruleRows, recentStart, previousStart }) {
  const total = memoryRows.length;
  const added = countWindow(memoryRows, recentStart, previousStart);
  const preferenceRows = memoryRows.filter((row) => hasSmartnessKind(row, 'user_preference'));
  const constraintRows = memoryRows.filter((row) => hasSmartnessKind(row, 'explicit_constraint'));
  const learningRows = memoryRows.filter((row) => hasSmartnessKind(row, 'lesson') || hasSmartnessKind(row, 'warning'));
  const uniqueKinds = SMARTNESS_KINDS.filter((kind) => memoryRows.some((row) => hasSmartnessKind(row, kind))).length;
  const recentKinds = SMARTNESS_KINDS.filter((kind) => memoryRows.some((row) => hasSmartnessKind(row, kind) && row.createdAt >= recentStart)).length;
  const previousKinds = SMARTNESS_KINDS.filter((kind) => memoryRows.some((row) => hasSmartnessKind(row, kind) && row.createdAt < recentStart && row.createdAt >= previousStart)).length;
  const recentPref = countWindow(preferenceRows.concat(constraintRows), recentStart, previousStart);
  const recentLearning = countWindow(learningRows, recentStart, previousStart);
  const activeRules = Number(ruleRows[0]?.rules) || 0;
  const recentRuleRows = ruleRows.filter((row) => row.createdAt >= recentStart);
  const previousRuleRows = ruleRows.filter((row) => row.createdAt < recentStart && row.createdAt >= previousStart);
  const recentRules = recentRuleRows.length > 0
    ? Math.round(recentRuleRows.reduce((sum, row) => sum + (Number(row.rules) || 0), 0) / recentRuleRows.length)
    : 0;
  const previousRules = previousRuleRows.length > 0
    ? Math.round(previousRuleRows.reduce((sum, row) => sum + (Number(row.rules) || 0), 0) / previousRuleRows.length)
    : 0;
  const dimensions = [
    { name: '记忆深度', score: clamp(total / 100), detail: `${total}条记忆, ${arrow(added.recent, added.previous)} ${added.recent - added.previous >= 0 ? '+' : ''}${added.recent - added.previous} 较上周` },
    { name: '偏好精准度', score: clamp((total > 0 ? preferenceRows.length / total : 0) * 3 + (constraintRows.length > 0 ? 0.1 : 0)), detail: `${preferenceRows.length}条偏好记忆, ${constraintRows.length}条约束` },
    { name: '主动学习密度', score: clamp(total > 0 ? learningRows.length / total : 0), detail: `${learningRows.length}条踩坑/警告记忆` },
    { name: '行为规则成熟度', score: clamp(activeRules / 10), detail: `${activeRules}条活跃规则` },
    { name: '记忆多样性', score: clamp(uniqueKinds / SMARTNESS_KINDS.length), detail: `${uniqueKinds}/${SMARTNESS_KINDS.length} 种类型覆盖` },
  ];
  return {
    overall: clamp(dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length),
    dimensions,
    trends: {
      preference: arrow(recentPref.recent, recentPref.previous),
      learning: arrow(recentLearning.recent, recentLearning.previous),
      rules: arrow(recentRules, previousRules),
      diversity: arrow(recentKinds, previousKinds),
    },
  };
}

export function generateGrowthReport({ dbPath, days = DEFAULT_DAYS, now = new Date() }) {
  if (!existsSync(dbPath)) {
    fail(`database not found: ${dbPath}`);
  }
  const dateLabel = toIsoDay(now);
  const recent7 = startOfWindow(7, now);
  const previous7 = startOfWindow(14, now);
  const recentN = startOfWindow(days, now);
  const db = new Database(dbPath, { readonly: true });

  try {
  const totalRow = db.prepare(
    `SELECT
       COUNT(*) AS total,
       COALESCE(AVG(confidence), 0) AS avg_confidence,
       SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS added7,
       SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS addedN,
       SUM(CASE WHEN embedding_blob IS NOT NULL THEN 1 ELSE 0 END) AS embedded
     FROM memory_items`,
  ).get(recent7, recentN);

  const kindRows = db.prepare(
    `SELECT type, COUNT(*) AS count
     FROM memory_items
     GROUP BY type
     ORDER BY count DESC, type ASC`,
  ).all();

  const memoryRows = db.prepare(
    `SELECT type, created_at, tags_json
     FROM memory_items`,
  ).all().map((row) => ({
    type: String(row.type ?? ''),
    createdAt: String(row.created_at ?? ''),
    tags: parseJson(row.tags_json, []),
  }));

  const ruleRows = db.prepare(
    `SELECT created_at, payload_json
     FROM debug_events
     WHERE kind = 'rules_loaded'
     ORDER BY created_at DESC
     LIMIT 200`,
  ).all().map((row) => {
    const payload = parseJson(row.payload_json, {});
    return {
      createdAt: String(row.created_at ?? ''),
      rules: Number(payload.rules) || 0,
    };
  });

  const sessionRows = db.prepare(
    `SELECT COALESCE(session_id, 'unknown') AS sessionId, COUNT(*) AS count
     FROM memory_items
     GROUP BY COALESCE(session_id, 'unknown')
     ORDER BY count DESC, sessionId ASC
     LIMIT 1`,
  ).all();

  const embeddingRow = db.prepare(
    `SELECT embedding_model
     FROM memory_items
     WHERE embedding_blob IS NOT NULL AND TRIM(COALESCE(embedding_model, '')) != ''
     ORDER BY updated_at DESC
     LIMIT 1`,
  ).get();

  const eventRows = db.prepare(
    `SELECT created_at, payload_json
     FROM debug_events
     WHERE kind IN ('session_end_processed', 'session_end')
       AND created_at >= ?
     ORDER BY created_at DESC`,
  ).all(recentN);

  const events = eventRows.map((row) => {
    const payload = parseJson(row.payload_json, {});
    return {
      createdAt: row.created_at,
      generated: Number(payload.autoMemoryGenerated) || 0,
      accepted: Number(payload.autoMemoryAccepted) || 0,
      rejectedReasons: Array.isArray(payload.autoMemoryRejectedReasons) ? payload.autoMemoryRejectedReasons : [],
    };
  });

  const events7 = events.filter((event) => event.createdAt >= recent7);
  const rate7 = rateFromEvents(events7);
  const rateN = rateFromEvents(events);
  const delta = rate7 - rateN;
  const reasonCounts = {};
  for (const event of events) {
    for (const reason of event.rejectedReasons) {
      const key = String(reason);
      reasonCounts[key] = (reasonCounts[key] ?? 0) + 1;
    }
  }
  const topReasons = Object.entries(reasonCounts)
    .sort((a, b) => Number(b[1]) - Number(a[1]) || String(a[0]).localeCompare(String(b[0])))
    .slice(0, 2);
  const reasonTotal = topReasons.reduce((sum, [, count]) => sum + Number(count), 0);
  const reasonText = topReasons.length > 0
    ? topReasons.map(([reason, count]) => `${reason} (${formatPercent(Number(count) / reasonTotal, 1)})`).join(', ')
    : '暂无拒绝样本';

  const total = Number(totalRow.total) || 0;
  const embedded = Number(totalRow.embedded) || 0;
  const coverage = total > 0 ? embedded / total : 0;
  const provider = embedded > 0 ? detectProvider(embeddingRow?.embedding_model) : null;
  const topSession = sessionRows[0];
  const kindsText = kindRows.length > 0
    ? kindRows.map((row, index) => {
      const prefix = index === kindRows.length - 1 ? '  └─' : '  ├─';
      return `${prefix} ${String(row.type).padEnd(16)} ${row.count} 条 (${formatPercent(Number(row.count) / total, 1)})`;
    }).join('\n')
    : '  └─ 暂无记忆';
  const pieText = kindRows.length > 0
    ? kindRows.map((row) => `  ${String(row.type).padEnd(16)} ${buildBar(Number(row.count), total)} ${formatPercent(Number(row.count) / total, 1)}`).join('\n')
    : '  暂无分布数据';

  const suggestions = [];
  if (coverage < 0.8) {
    suggestions.push('- 继续使用可提升语义覆盖率');
  }
  if (rate7 < 0.75) {
    suggestions.push('- 检查 duplicate/quality 拒绝样本，优化 auto-capture 策略');
  } else {
    suggestions.push('- 更多交互将改善自动捕获精准度');
  }
  if (Number(totalRow.added7) === 0) {
    suggestions.push('- 最近 7 天没有新增记忆，建议保持连续使用');
  }

  const deltaArrow = delta >= 0 ? '↑' : '↓';
  const deltaText = `${deltaArrow} 较上月 ${delta >= 0 ? '+' : '-'}${Math.abs(delta).toFixed(2)}`;
  const smartness = computeSmartness({
    memoryRows,
    ruleRows,
    recentStart: recent7,
    previousStart: previous7,
  });

    return [
    '═══════════════════════════════════════',
    `  EverMemory 成长报告  ${dateLabel}`,
    '═══════════════════════════════════════',
    '',
    '📊 记忆概览',
    `  总计: ${total} 条记忆`,
    kindsText,
    `  最近 7 天新增: ${Number(totalRow.added7) || 0} 条`,
    `  最近 ${days} 天新增: ${Number(totalRow.addedN) || 0} 条`,
    `  平均记忆质量: ${formatRate(Number(totalRow.avg_confidence) || 0)}`,
    '',
    '📈 自动捕获质量',
    `  近 7 天 accept rate: ${formatRate(rate7)} (${deltaText})`,
    `  近 ${days} 天 accept rate: ${formatRate(rateN)}`,
    `  主要拒绝原因: ${reasonText}`,
    '',
    '🔍 语义搜索',
    `  嵌入覆盖率: ${Math.round(coverage * 100)}% (${embedded}/${total} 条记忆)`,
    `  状态: ${provider ? `已启用 (${provider})` : '未启用'}`,
    '',
    '🔥 活跃度指标',
    `  最活跃 session: ${topSession ? `${topSession.sessionId} (${topSession.count} 条)` : '暂无'}`,
    '  类型分布:',
    pieText,
    '',
    '💡 建议',
    ...suggestions.map((line) => `  ${line}`),
    '',
    `🧠 智能度评分：${percent(smartness.overall)}/100`,
    `  ├─ 记忆深度：    ${percent(smartness.dimensions[0].score)}分 (${smartness.dimensions[0].detail})`,
    `  ├─ 偏好精准度：  ${percent(smartness.dimensions[1].score)}分 (${smartness.dimensions[1].detail})`,
    `  ├─ 主动学习密度：${percent(smartness.dimensions[2].score)}分 (${smartness.dimensions[2].detail})`,
    `  ├─ 行为规则成熟度：${percent(smartness.dimensions[3].score)}分 (${smartness.dimensions[3].detail})`,
    `  └─ 记忆多样性：  ${percent(smartness.dimensions[4].score)}分 (${smartness.dimensions[4].detail})`,
    '═══════════════════════════════════════',
    '',
    ].join('\n');
  } finally {
    db.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { dbPath, days } = parseArgs(process.argv.slice(2));
  const output = generateGrowthReport({
    dbPath,
    days,
    now: new Date(process.env.EVERMEMORY_REPORT_NOW ?? Date.now()),
  });
  process.stdout.write(`${output}\n`);
}
