#!/usr/bin/env node
import Database from 'better-sqlite3';
import process from 'node:process';

const DEFAULT_DB_PATH = '/root/.openclaw/memory/evermemory/store/evermemory.db';

const MEMORY_WHERE = `
  content LIKE '%openclaw-smoke%'
  OR tags_json LIKE '%openclaw-smoke%'
  OR content GLOB '*E2E-[0-9]*'
  OR tags_json GLOB '*E2E-[0-9]*'
  OR content GLOB '*QGENT-[0-9]*'
  OR tags_json GLOB '*QGENT-[0-9]*'
  OR content GLOB '*CONT-[0-9]*'
  OR tags_json GLOB '*CONT-[0-9]*'
`;

const DEBUG_WHERE = `
  payload_json LIKE '%openclaw-smoke%'
  OR payload_json GLOB '*E2E-[0-9]*'
  OR payload_json GLOB '*QGENT-[0-9]*'
  OR payload_json GLOB '*CONT-[0-9]*'
`;

const INTENT_WHERE = `
  raw_text LIKE '%openclaw-smoke%'
  OR raw_text GLOB '*E2E-[0-9]*'
  OR raw_text GLOB '*QGENT-[0-9]*'
  OR raw_text GLOB '*CONT-[0-9]*'
`;

const EXPERIENCE_WHERE = `
  input_summary LIKE '%openclaw-smoke%'
  OR action_summary LIKE '%openclaw-smoke%'
  OR outcome_summary LIKE '%openclaw-smoke%'
  OR evidence_refs_json LIKE '%openclaw-smoke%'
  OR input_summary GLOB '*E2E-[0-9]*'
  OR action_summary GLOB '*E2E-[0-9]*'
  OR outcome_summary GLOB '*E2E-[0-9]*'
  OR evidence_refs_json GLOB '*E2E-[0-9]*'
  OR input_summary GLOB '*QGENT-[0-9]*'
  OR action_summary GLOB '*QGENT-[0-9]*'
  OR outcome_summary GLOB '*QGENT-[0-9]*'
  OR evidence_refs_json GLOB '*QGENT-[0-9]*'
  OR input_summary GLOB '*CONT-[0-9]*'
  OR action_summary GLOB '*CONT-[0-9]*'
  OR outcome_summary GLOB '*CONT-[0-9]*'
  OR evidence_refs_json GLOB '*CONT-[0-9]*'
`;

const REFLECTION_WHERE = `
  analysis_json LIKE '%openclaw-smoke%'
  OR evidence_json LIKE '%openclaw-smoke%'
  OR candidate_rules_json LIKE '%openclaw-smoke%'
  OR analysis_json GLOB '*E2E-[0-9]*'
  OR evidence_json GLOB '*E2E-[0-9]*'
  OR candidate_rules_json GLOB '*E2E-[0-9]*'
  OR analysis_json GLOB '*QGENT-[0-9]*'
  OR evidence_json GLOB '*QGENT-[0-9]*'
  OR candidate_rules_json GLOB '*QGENT-[0-9]*'
  OR analysis_json GLOB '*CONT-[0-9]*'
  OR evidence_json GLOB '*CONT-[0-9]*'
  OR candidate_rules_json GLOB '*CONT-[0-9]*'
`;

function parseArgs(argv) {
  const parsed = {
    dbPath: process.env.EVERMEMORY_DB_PATH ?? DEFAULT_DB_PATH,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (arg === '--db') {
      const next = argv[index + 1];
      if (!next) {
        throw new Error('missing value for --db');
      }
      parsed.dbPath = next;
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${arg}`);
  }

  return parsed;
}

function count(db, table, whereClause) {
  return db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${whereClause}`).get().c;
}

function runDelete(db, table, whereClause) {
  return db.prepare(`DELETE FROM ${table} WHERE ${whereClause}`).run().changes;
}

let parsed;
try {
  parsed = parseArgs(process.argv.slice(2));
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[evermemory:purge-test-data] ${detail}`);
  process.exit(1);
}

const db = new Database(parsed.dbPath);

try {
  const memoryCandidateIds = db.prepare(`SELECT id FROM memory_items WHERE ${MEMORY_WHERE}`).all().map((row) => String(row.id));
  const placeholders = memoryCandidateIds.length > 0 ? memoryCandidateIds.map(() => '?').join(', ') : '';
  const semanticCount = memoryCandidateIds.length > 0
    ? db.prepare(`SELECT COUNT(*) AS c FROM semantic_index WHERE memory_id IN (${placeholders})`).get(...memoryCandidateIds).c
    : 0;
  const debugCount = count(db, 'debug_events', DEBUG_WHERE);
  const intentCount = count(db, 'intent_records', INTENT_WHERE);
  const experienceCount = count(db, 'experience_logs', EXPERIENCE_WHERE);
  const reflectionCount = count(db, 'reflection_records', REFLECTION_WHERE);
  const briefingCount = count(db, 'boot_briefings', DEBUG_WHERE.replaceAll('payload_json', 'sections_json'));

  if (parsed.dryRun) {
    console.log('[evermemory:purge-test-data] DRY RUN');
    console.log(`[evermemory:purge-test-data] dbPath=${parsed.dbPath}`);
    console.log(`[evermemory:purge-test-data] memoryItems=${memoryCandidateIds.length}`);
    console.log(`[evermemory:purge-test-data] semanticIndex=${semanticCount}`);
    console.log(`[evermemory:purge-test-data] debugEvents=${debugCount}`);
    console.log(`[evermemory:purge-test-data] intentRecords=${intentCount}`);
    console.log(`[evermemory:purge-test-data] experienceLogs=${experienceCount}`);
    console.log(`[evermemory:purge-test-data] reflectionRecords=${reflectionCount}`);
    console.log(`[evermemory:purge-test-data] bootBriefings=${briefingCount}`);
    process.exit(0);
  }

  const tx = db.transaction(() => {
    let semanticDeleted = 0;
    if (memoryCandidateIds.length > 0) {
      semanticDeleted = db.prepare(`DELETE FROM semantic_index WHERE memory_id IN (${placeholders})`).run(...memoryCandidateIds).changes;
    }

    const memoryDeleted = runDelete(db, 'memory_items', MEMORY_WHERE);
    const debugDeleted = runDelete(db, 'debug_events', DEBUG_WHERE);
    const intentDeleted = runDelete(db, 'intent_records', INTENT_WHERE);
    const experienceDeleted = runDelete(db, 'experience_logs', EXPERIENCE_WHERE);
    const reflectionDeleted = runDelete(db, 'reflection_records', REFLECTION_WHERE);
    const briefingDeleted = runDelete(db, 'boot_briefings', DEBUG_WHERE.replaceAll('payload_json', 'sections_json'));

    return {
      semanticDeleted,
      memoryDeleted,
      debugDeleted,
      intentDeleted,
      experienceDeleted,
      reflectionDeleted,
      briefingDeleted,
    };
  });

  const result = tx();
  const total = Object.values(result).reduce((sum, value) => sum + Number(value), 0);
  console.log('[evermemory:purge-test-data] PASS');
  console.log(`[evermemory:purge-test-data] dbPath=${parsed.dbPath}`);
  console.log(`[evermemory:purge-test-data] totalDeleted=${total}`);
  for (const [key, value] of Object.entries(result)) {
    console.log(`[evermemory:purge-test-data] ${key}=${value}`);
  }
} finally {
  db.close();
}
