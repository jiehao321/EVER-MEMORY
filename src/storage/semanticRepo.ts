import type Database from 'better-sqlite3';
import { buildSemanticProfile, semanticSimilarity } from '../retrieval/semantic.js';
import type { MemoryItem, SemanticIndexRecord, SemanticSearchHit } from '../types.js';
import { safeJsonParse } from '../util/json.js';

interface SemanticIndexRow {
  memory_id: string;
  updated_at: string;
  content_hash: string;
  tokens_json: string;
  weights_json: string;
}

function toSemanticRecord(row: SemanticIndexRow): SemanticIndexRecord {
  return {
    memoryId: row.memory_id,
    updatedAt: row.updated_at,
    contentHash: row.content_hash,
    tokens: safeJsonParse(row.tokens_json, []) as string[],
    weights: safeJsonParse(row.weights_json, {}) as Record<string, number>,
  };
}

function parsePositiveInteger(value: number | undefined, fallback: number): number {
  if (!value || !Number.isInteger(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function escapeLikePattern(token: string): string {
  // Escape special LIKE characters: % _ \
  return token.replace(/[%_\\]/g, '\\$&');
}

export class SemanticRepository {
  constructor(private readonly db: Database.Database) {}

  upsertFromMemory(memory: MemoryItem): void {
    const profile = buildSemanticProfile(memory.content);
    this.db.prepare(`
      INSERT INTO semantic_index (
        memory_id, updated_at, content_hash, tokens_json, weights_json
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(memory_id) DO UPDATE SET
        updated_at = excluded.updated_at,
        content_hash = excluded.content_hash,
        tokens_json = excluded.tokens_json,
        weights_json = excluded.weights_json
    `).run(
      memory.id,
      memory.timestamps.updatedAt,
      profile.contentHash,
      JSON.stringify(profile.tokens),
      JSON.stringify(profile.weights),
    );
  }

  findByMemoryId(memoryId: string): SemanticIndexRecord | null {
    const row = this.db.prepare('SELECT * FROM semantic_index WHERE memory_id = ? LIMIT 1').get(memoryId) as
      | SemanticIndexRow
      | undefined;
    return row ? toSemanticRecord(row) : null;
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM semantic_index').get() as { count: number };
    return row.count;
  }

  listRecent(limit = 20): SemanticIndexRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM semantic_index
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(limit) as SemanticIndexRow[];

    return rows.map(toSemanticRecord);
  }

  search(
    query: string,
    options: {
      limit?: number;
      minScore?: number;
      candidateLimit?: number;
    } = {},
  ): SemanticSearchHit[] {
    const queryProfile = buildSemanticProfile(query);
    if (queryProfile.tokens.length === 0) {
      return [];
    }

    const limit = parsePositiveInteger(options.limit, 10);
    const candidateLimit = parsePositiveInteger(options.candidateLimit, 200);
    const minScore = typeof options.minScore === 'number' ? options.minScore : 0.15;

    const searchTokens = queryProfile.tokens.slice(0, 8);
    const whereSql = searchTokens.map(() => 'tokens_json LIKE ? ESCAPE \'\\\'').join(' OR ');
    const rows = this.db.prepare(`
      SELECT * FROM semantic_index
      WHERE ${whereSql}
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(
      ...searchTokens.map((token) => `%\"${escapeLikePattern(token)}\"%`),
      candidateLimit,
    ) as SemanticIndexRow[];

    const hits = rows
      .map((row) => {
        const record = toSemanticRecord(row);
        const similarity = semanticSimilarity(queryProfile, {
          tokens: record.tokens,
          weights: record.weights,
        });
        return {
          memoryId: record.memoryId,
          score: similarity.score,
          matchedTokens: similarity.matchedTokens,
        } satisfies SemanticSearchHit;
      })
      .filter((hit) => hit.score >= minScore);

    hits.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return right.memoryId.localeCompare(left.memoryId);
    });

    return hits.slice(0, limit);
  }
}
