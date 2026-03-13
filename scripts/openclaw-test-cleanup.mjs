import Database from 'better-sqlite3';

function uniqueStrings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === 'string' && value.trim().length > 0)));
}

function deleteByIds(db, table, idColumn, ids) {
  if (ids.length === 0) {
    return 0;
  }
  const placeholders = ids.map(() => '?').join(', ');
  const sql = `DELETE FROM ${table} WHERE ${idColumn} IN (${placeholders})`;
  return db.prepare(sql).run(...ids).changes;
}

function runDeleteSafe(db, sql, ...params) {
  try {
    return db.prepare(sql).run(...params).changes;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/no such column/i.test(message)) {
      return 0;
    }
    throw error;
  }
}

function selectMemoryIdsByTag(db, likeTag) {
  return db.prepare(`
    SELECT id
    FROM memory_items
    WHERE content LIKE ?
      OR tags_json LIKE ?
      OR evidence_references_json LIKE ?
  `).all(likeTag, likeTag, likeTag).map((row) => String(row.id));
}

export function cleanupOpenClawTestArtifacts(input) {
  const dbPath = String(input.dbPath ?? '').trim();
  const tag = String(input.tag ?? '').trim();
  const sessionIds = uniqueStrings(Array.isArray(input.sessionIds) ? input.sessionIds : []);

  if (!dbPath || !tag) {
    throw new Error('cleanup requires dbPath and tag');
  }

  const likeTag = `%${tag}%`;
  const stats = {
    memoryItemsDeleted: 0,
    semanticIndexDeleted: 0,
    debugEventsDeleted: 0,
    intentRecordsDeleted: 0,
    experienceLogsDeleted: 0,
    reflectionRecordsDeleted: 0,
    behaviorRulesDeleted: 0,
    bootBriefingsDeleted: 0,
  };

  const db = new Database(dbPath);
  try {
    const tx = db.transaction(() => {
      const memoryIds = uniqueStrings(selectMemoryIdsByTag(db, likeTag));
      stats.semanticIndexDeleted += deleteByIds(db, 'semantic_index', 'memory_id', memoryIds);
      stats.memoryItemsDeleted += deleteByIds(db, 'memory_items', 'id', memoryIds);

      stats.debugEventsDeleted += runDeleteSafe(db, `
        DELETE FROM debug_events
        WHERE payload_json LIKE ?
      `, likeTag);

      if (sessionIds.length > 0) {
        const placeholders = sessionIds.map(() => '?').join(', ');
        stats.debugEventsDeleted += runDeleteSafe(db, `
          DELETE FROM debug_events
          WHERE entity_id IN (${placeholders})
            AND payload_json LIKE ?
        `, ...sessionIds, likeTag);
      }

      stats.intentRecordsDeleted += runDeleteSafe(db, `
        DELETE FROM intent_records
        WHERE raw_text LIKE ?
      `, likeTag);

      stats.experienceLogsDeleted += runDeleteSafe(db, `
        DELETE FROM experience_logs
        WHERE input_summary LIKE ?
          OR action_summary LIKE ?
          OR outcome_summary LIKE ?
          OR evidence_refs_json LIKE ?
      `, likeTag, likeTag, likeTag, likeTag);

      stats.reflectionRecordsDeleted += runDeleteSafe(db, `
        DELETE FROM reflection_records
        WHERE analysis_json LIKE ?
          OR evidence_json LIKE ?
          OR candidate_rules_json LIKE ?
      `, likeTag, likeTag, likeTag);

      stats.behaviorRulesDeleted += runDeleteSafe(db, `
        DELETE FROM behavior_rules
        WHERE statement LIKE ?
          OR contexts_json LIKE ?
          OR promotion_evidence_summary LIKE ?
      `, likeTag, likeTag, likeTag);

      stats.bootBriefingsDeleted += runDeleteSafe(db, `
        DELETE FROM boot_briefings
        WHERE sections_json LIKE ?
      `, likeTag);
    });

    tx();
  } finally {
    db.close();
  }

  return stats;
}
