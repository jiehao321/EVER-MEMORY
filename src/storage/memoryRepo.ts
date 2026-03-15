import type Database from 'better-sqlite3';
import type { MemoryItem, MemoryLifecycle, MemorySearchFilters, MemoryType } from '../types.js';
import { safeJsonParse } from '../util/json.js';
import { MEMORY_TYPES, MEMORY_LIFECYCLES } from '../constants.js';
import { StorageError } from '../errors.js';

interface MemoryItemRow {
  id: string;
  content: string;
  type: string;
  lifecycle: string;
  source_kind: string;
  source_actor: string | null;
  session_id: string | null;
  message_id: string | null;
  channel: string | null;
  scope_user_id: string | null;
  scope_chat_id: string | null;
  scope_project: string | null;
  scope_global: number;
  confidence: number;
  importance: number;
  explicitness: number;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
  active: number;
  archived: number;
  superseded_by: string | null;
  evidence_excerpt: string | null;
  evidence_references_json: string | null;
  tags_json: string;
  related_entities_json: string;
  access_count: number;
  retrieval_count: number;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function parseStringArray(value: string | null): string[] {
  if (!value) {
    return [];
  }

  const parsed = safeJsonParse<unknown>(value, []);
  return isStringArray(parsed) ? parsed : [];
}

function toMemoryItem(row: MemoryItemRow): MemoryItem {
  // Validate enum values from database
  const type = MEMORY_TYPES.includes(row.type as MemoryType)
    ? (row.type as MemoryType)
    : 'fact'; // fallback to 'fact' if invalid

  const lifecycle = MEMORY_LIFECYCLES.includes(row.lifecycle as MemoryLifecycle)
    ? (row.lifecycle as MemoryLifecycle)
    : 'episodic'; // fallback to 'episodic' if invalid

  return {
    id: row.id,
    content: row.content,
    type,
    lifecycle,
    source: {
      kind: row.source_kind as MemoryItem['source']['kind'],
      actor: row.source_actor as MemoryItem['source']['actor'] | undefined,
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
    stats: {
      accessCount: row.access_count,
      retrievalCount: row.retrieval_count,
    },
  };
}

function buildWhereClause(filters: MemorySearchFilters): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

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

  const sql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  return { sql, params };
}

function resolveSearchLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return 20;
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new StorageError('Memory search limit must be a positive integer.', {
      code: 'STORAGE_INVALID_SEARCH_LIMIT',
      context: { limit },
    });
  }
  return limit;
}

export class MemoryRepository {
  constructor(private readonly db: Database.Database) {}

  insert(memory: MemoryItem): void {
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
          access_count, retrieval_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        memory.id,
        memory.content,
        memory.type,
        memory.lifecycle,
        memory.source.kind,
        memory.source.actor ?? null,
        memory.source.sessionId ?? null,
        memory.source.messageId ?? null,
        memory.source.channel ?? null,
        memory.scope.userId ?? null,
        memory.scope.chatId ?? null,
        memory.scope.project ?? null,
        memory.scope.global ? 1 : 0,
        memory.scores.confidence,
        memory.scores.importance,
        memory.scores.explicitness,
        memory.timestamps.createdAt,
        memory.timestamps.updatedAt,
        memory.timestamps.lastAccessedAt ?? null,
        memory.state.active ? 1 : 0,
        memory.state.archived ? 1 : 0,
        memory.state.supersededBy ?? null,
        memory.evidence.excerpt ?? null,
        JSON.stringify(memory.evidence.references ?? []),
        JSON.stringify(memory.tags),
        JSON.stringify(memory.relatedEntities),
        memory.stats.accessCount,
        memory.stats.retrievalCount,
      );
    } catch (error) {
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

  update(memory: MemoryItem): void {
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
          retrieval_count = ?
        WHERE id = ?
      `).run(
        memory.content,
        memory.type,
        memory.lifecycle,
        memory.source.kind,
        memory.source.actor ?? null,
        memory.source.sessionId ?? null,
        memory.source.messageId ?? null,
        memory.source.channel ?? null,
        memory.scope.userId ?? null,
        memory.scope.chatId ?? null,
        memory.scope.project ?? null,
        memory.scope.global ? 1 : 0,
        memory.scores.confidence,
        memory.scores.importance,
        memory.scores.explicitness,
        memory.timestamps.createdAt,
        memory.timestamps.updatedAt,
        memory.timestamps.lastAccessedAt ?? null,
        memory.state.active ? 1 : 0,
        memory.state.archived ? 1 : 0,
        memory.state.supersededBy ?? null,
        memory.evidence.excerpt ?? null,
        JSON.stringify(memory.evidence.references ?? []),
        JSON.stringify(memory.tags),
        JSON.stringify(memory.relatedEntities),
        memory.stats.accessCount,
        memory.stats.retrievalCount,
        memory.id,
      );
    } catch (error) {
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

  findById(id: string): MemoryItem | null {
    try {
      const row = this.db.prepare('SELECT * FROM memory_items WHERE id = ? LIMIT 1').get(id) as MemoryItemRow | undefined;
      return row ? toMemoryItem(row) : null;
    } catch (error) {
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

  search(filters: MemorySearchFilters = {}): MemoryItem[] {
    const limit = resolveSearchLimit(filters.limit);
    try {
      const { sql, params } = buildWhereClause(filters);
      const rows = this.db.prepare(`
        SELECT * FROM memory_items
        ${sql}
        ORDER BY updated_at DESC
        LIMIT ?
      `).all(...params, limit) as MemoryItemRow[];

      return rows.map(toMemoryItem);
    } catch (error) {
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

  listRecent(scope: MemorySearchFilters['scope'], limit = 10): MemoryItem[] {
    return this.search({ scope, limit, activeOnly: true, archived: false });
  }

  incrementAccess(id: string): void {
    this.db.prepare(`
      UPDATE memory_items
      SET access_count = access_count + 1,
          updated_at = updated_at,
          last_accessed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
  }

  incrementRetrieval(ids: string[]): void {
    const unique = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.length > 0)));
    if (unique.length === 0) {
      return;
    }

    const placeholders = unique.map(() => '?').join(', ');
    try {
      this.db.prepare(`
        UPDATE memory_items
        SET retrieval_count = retrieval_count + 1,
            updated_at = updated_at,
            last_accessed_at = CURRENT_TIMESTAMP
        WHERE id IN (${placeholders})
      `).run(...unique);
    } catch (error) {
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

  count(filters: MemorySearchFilters = {}): number {
    const { sql, params } = buildWhereClause(filters);
    const row = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM memory_items
      ${sql}
    `).get(...params) as { count: number };

    return row.count;
  }

  countByType(filters: MemorySearchFilters = {}): Partial<Record<MemoryType, number>> {
    const { sql, params } = buildWhereClause(filters);
    const rows = this.db.prepare(`
      SELECT type, COUNT(*) as count
      FROM memory_items
      ${sql}
      GROUP BY type
    `).all(...params) as Array<{ type: MemoryType; count: number }>;

    return Object.fromEntries(rows.map((row) => [row.type, row.count])) as Partial<Record<MemoryType, number>>;
  }

  countByLifecycle(filters: MemorySearchFilters = {}): Partial<Record<MemoryLifecycle, number>> {
    const { sql, params } = buildWhereClause(filters);
    const rows = this.db.prepare(`
      SELECT lifecycle, COUNT(*) as count
      FROM memory_items
      ${sql}
      GROUP BY lifecycle
    `).all(...params) as Array<{ lifecycle: MemoryLifecycle; count: number }>;

    return Object.fromEntries(rows.map((row) => [row.lifecycle, row.count])) as Partial<Record<MemoryLifecycle, number>>;
  }
}
