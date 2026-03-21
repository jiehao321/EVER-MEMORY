import { safeJsonParse } from '../util/json.js';
import { MEMORY_TYPES, MEMORY_LIFECYCLES } from '../constants.js';
import { StorageError } from '../errors.js';
const MAX_ALLOWED_LIMIT = 10_000;
const SQLITE_MAX_VARIABLE_NUMBER = 999;
function isStringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
function parseStringArray(value) {
    if (!value) {
        return [];
    }
    const parsed = safeJsonParse(value, []);
    return isStringArray(parsed) ? parsed : [];
}
function toMemoryItem(row) {
    // Validate enum values from database
    const type = MEMORY_TYPES.includes(row.type)
        ? row.type
        : 'fact'; // fallback to 'fact' if invalid
    const lifecycle = MEMORY_LIFECYCLES.includes(row.lifecycle)
        ? row.lifecycle
        : 'episodic'; // fallback to 'episodic' if invalid
    return {
        id: row.id,
        content: row.content,
        type,
        lifecycle,
        source: {
            kind: row.source_kind,
            actor: row.source_actor,
            sessionId: row.session_id ?? undefined,
            messageId: row.message_id ?? undefined,
            channel: row.channel ?? undefined,
        },
        scope: {
            userId: row.scope_user_id ?? undefined,
            chatId: row.scope_chat_id ?? undefined,
            project: row.scope_project ?? undefined,
            global: row.scope_global === 1,
        },
        scores: {
            confidence: row.confidence,
            importance: row.importance,
            explicitness: row.explicitness,
        },
        timestamps: {
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            lastAccessedAt: row.last_accessed_at ?? undefined,
        },
        state: {
            active: row.active === 1,
            archived: row.archived === 1,
            supersededBy: row.superseded_by ?? undefined,
        },
        evidence: {
            excerpt: row.evidence_excerpt ?? undefined,
            references: parseStringArray(row.evidence_references_json),
        },
        tags: parseStringArray(row.tags_json),
        relatedEntities: parseStringArray(row.related_entities_json),
        sourceGrade: row.source_grade ?? 'primary',
        stats: {
            accessCount: row.access_count,
            retrievalCount: row.retrieval_count,
        },
    };
}
function buildWhereClause(filters) {
    const clauses = [];
    const params = [];
    if (filters.query) {
        clauses.push('content LIKE ?');
        params.push(`%${filters.query}%`);
    }
    if (filters.scope?.userId) {
        clauses.push('scope_user_id = ?');
        params.push(filters.scope.userId);
    }
    if (filters.scope?.chatId) {
        clauses.push('scope_chat_id = ?');
        params.push(filters.scope.chatId);
    }
    if (filters.scope?.project) {
        clauses.push('scope_project = ?');
        params.push(filters.scope.project);
    }
    if (filters.scope?.global !== undefined) {
        clauses.push('scope_global = ?');
        params.push(filters.scope.global ? 1 : 0);
    }
    if (filters.types && filters.types.length > 0) {
        clauses.push(`type IN (${filters.types.map(() => '?').join(', ')})`);
        params.push(...filters.types);
    }
    if (filters.lifecycles && filters.lifecycles.length > 0) {
        clauses.push(`lifecycle IN (${filters.lifecycles.map(() => '?').join(', ')})`);
        params.push(...filters.lifecycles);
    }
    if (filters.activeOnly) {
        clauses.push('active = 1');
    }
    if (filters.archived !== undefined) {
        clauses.push('archived = ?');
        params.push(filters.archived ? 1 : 0);
    }
    if (filters.createdAfter) {
        clauses.push('created_at >= ?');
        params.push(filters.createdAfter);
    }
    if (filters.createdBefore) {
        clauses.push('created_at <= ?');
        params.push(filters.createdBefore);
    }
    const sql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    return { sql, params };
}
function resolveSearchLimit(limit) {
    if (limit === undefined) {
        return 20;
    }
    if (!Number.isInteger(limit) || limit <= 0) {
        throw new StorageError('Memory search limit must be a positive integer.', {
            code: 'STORAGE_INVALID_SEARCH_LIMIT',
            context: { limit },
        });
    }
    return Math.min(limit, MAX_ALLOWED_LIMIT);
}
export class MemoryRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    /** Run a block of operations inside a single SQLite transaction */
    transaction(fn) {
        return this.db.transaction(fn)();
    }
    insert(memory) {
        try {
            this.db.prepare(`
        INSERT INTO memory_items (
          id, content, type, lifecycle,
          source_kind, source_actor, session_id, message_id, channel,
          scope_user_id, scope_chat_id, scope_project, scope_global,
          confidence, importance, explicitness,
          created_at, updated_at, last_accessed_at,
          active, archived, superseded_by,
          evidence_excerpt, evidence_references_json,
          tags_json, related_entities_json,
          access_count, retrieval_count, source_grade
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(memory.id, memory.content, memory.type, memory.lifecycle, memory.source.kind, memory.source.actor ?? null, memory.source.sessionId ?? null, memory.source.messageId ?? null, memory.source.channel ?? null, memory.scope.userId ?? null, memory.scope.chatId ?? null, memory.scope.project ?? null, memory.scope.global ? 1 : 0, memory.scores.confidence, memory.scores.importance, memory.scores.explicitness, memory.timestamps.createdAt, memory.timestamps.updatedAt, memory.timestamps.lastAccessedAt ?? null, memory.state.active ? 1 : 0, memory.state.archived ? 1 : 0, memory.state.supersededBy ?? null, memory.evidence.excerpt ?? null, JSON.stringify(memory.evidence.references ?? []), JSON.stringify(memory.tags), JSON.stringify(memory.relatedEntities), memory.stats.accessCount, memory.stats.retrievalCount, memory.sourceGrade ?? 'primary');
        }
        catch (error) {
            if (error instanceof StorageError) {
                throw error;
            }
            throw new StorageError('Failed to insert memory item.', {
                code: 'STORAGE_MEMORY_INSERT_FAILED',
                context: {
                    memoryId: memory.id,
                    type: memory.type,
                    lifecycle: memory.lifecycle,
                },
                cause: error,
            });
        }
    }
    update(memory) {
        try {
            this.db.prepare(`
        UPDATE memory_items SET
          content = ?,
          type = ?,
          lifecycle = ?,
          source_kind = ?,
          source_actor = ?,
          session_id = ?,
          message_id = ?,
          channel = ?,
          scope_user_id = ?,
          scope_chat_id = ?,
          scope_project = ?,
          scope_global = ?,
          confidence = ?,
          importance = ?,
          explicitness = ?,
          created_at = ?,
          updated_at = ?,
          last_accessed_at = ?,
          active = ?,
          archived = ?,
          superseded_by = ?,
          evidence_excerpt = ?,
          evidence_references_json = ?,
          tags_json = ?,
          related_entities_json = ?,
          access_count = ?,
          retrieval_count = ?,
          source_grade = ?
        WHERE id = ?
      `).run(memory.content, memory.type, memory.lifecycle, memory.source.kind, memory.source.actor ?? null, memory.source.sessionId ?? null, memory.source.messageId ?? null, memory.source.channel ?? null, memory.scope.userId ?? null, memory.scope.chatId ?? null, memory.scope.project ?? null, memory.scope.global ? 1 : 0, memory.scores.confidence, memory.scores.importance, memory.scores.explicitness, memory.timestamps.createdAt, memory.timestamps.updatedAt, memory.timestamps.lastAccessedAt ?? null, memory.state.active ? 1 : 0, memory.state.archived ? 1 : 0, memory.state.supersededBy ?? null, memory.evidence.excerpt ?? null, JSON.stringify(memory.evidence.references ?? []), JSON.stringify(memory.tags), JSON.stringify(memory.relatedEntities), memory.stats.accessCount, memory.stats.retrievalCount, memory.sourceGrade ?? 'primary', memory.id);
        }
        catch (error) {
            if (error instanceof StorageError) {
                throw error;
            }
            throw new StorageError('Failed to update memory item.', {
                code: 'STORAGE_MEMORY_UPDATE_FAILED',
                context: {
                    memoryId: memory.id,
                    type: memory.type,
                    lifecycle: memory.lifecycle,
                },
                cause: error,
            });
        }
    }
    findById(id) {
        try {
            const row = this.db.prepare('SELECT * FROM memory_items WHERE id = ? LIMIT 1').get(id);
            return row ? toMemoryItem(row) : null;
        }
        catch (error) {
            if (error instanceof StorageError) {
                throw error;
            }
            throw new StorageError('Failed to load memory item.', {
                code: 'STORAGE_MEMORY_LOOKUP_FAILED',
                context: { memoryId: id },
                cause: error,
            });
        }
    }
    search(filters = {}) {
        const limit = resolveSearchLimit(filters.limit);
        try {
            const { sql, params } = buildWhereClause(filters);
            const rows = this.db.prepare(`
        SELECT * FROM memory_items
        ${sql}
        ORDER BY updated_at DESC
        LIMIT ?
      `).all(...params, limit);
            return rows.map(toMemoryItem);
        }
        catch (error) {
            if (error instanceof StorageError) {
                throw error;
            }
            throw new StorageError('Failed to search memory items.', {
                code: 'STORAGE_MEMORY_SEARCH_FAILED',
                context: {
                    hasQuery: Boolean(filters.query),
                    limit,
                    typeCount: filters.types?.length ?? 0,
                    lifecycleCount: filters.lifecycles?.length ?? 0,
                },
                cause: error,
            });
        }
    }
    listRecent(scope, limit = 10) {
        return this.search({ scope, limit, activeOnly: true, archived: false });
    }
    incrementAccess(id) {
        this.db.prepare(`
      UPDATE memory_items
      SET access_count = access_count + 1,
          updated_at = updated_at,
          last_accessed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
    }
    incrementRetrieval(ids) {
        const unique = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.length > 0)));
        if (unique.length === 0) {
            return;
        }
        try {
            for (let i = 0; i < unique.length; i += SQLITE_MAX_VARIABLE_NUMBER) {
                const batch = unique.slice(i, i + SQLITE_MAX_VARIABLE_NUMBER);
                const placeholders = batch.map(() => '?').join(', ');
                this.db.prepare(`
          UPDATE memory_items
          SET retrieval_count = retrieval_count + 1,
              updated_at = updated_at,
              last_accessed_at = CURRENT_TIMESTAMP
          WHERE id IN (${placeholders})
        `).run(...batch);
            }
        }
        catch (error) {
            if (error instanceof StorageError) {
                throw error;
            }
            throw new StorageError('Failed to update retrieval statistics.', {
                code: 'STORAGE_MEMORY_RETRIEVAL_INCREMENT_FAILED',
                context: { memoryIds: unique },
                cause: error,
            });
        }
    }
    count(filters = {}) {
        const { sql, params } = buildWhereClause(filters);
        const row = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM memory_items
      ${sql}
    `).get(...params);
        return row.count;
    }
    countByType(filters = {}) {
        const { sql, params } = buildWhereClause(filters);
        const rows = this.db.prepare(`
      SELECT type, COUNT(*) as count
      FROM memory_items
      ${sql}
      GROUP BY type
    `).all(...params);
        return Object.fromEntries(rows.map((row) => [row.type, row.count]));
    }
    countByLifecycle(filters = {}) {
        const { sql, params } = buildWhereClause(filters);
        const rows = this.db.prepare(`
      SELECT lifecycle, COUNT(*) as count
      FROM memory_items
      ${sql}
      GROUP BY lifecycle
    `).all(...params);
        return Object.fromEntries(rows.map((row) => [row.lifecycle, row.count]));
    }
}
