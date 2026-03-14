import { Buffer } from 'node:buffer';
import type Database from 'better-sqlite3';
import { buildSemanticProfile, semanticSimilarity } from '../retrieval/semantic.js';
import type {
  MemoryItem,
  SemanticEmbeddingRecord,
  SemanticEmbeddingSearchHit,
  SemanticIndexRecord,
  SemanticSearchHit,
} from '../types.js';
import { safeJsonParse } from '../util/json.js';
import { StorageError } from '../errors.js';

interface SemanticIndexRow {
  memory_id: string;
  updated_at: string;
  content_hash: string;
  tokens_json: string;
  weights_json: string;
}

interface MemoryEmbeddingRow {
  memory_id: string;
  embedding_blob: Buffer | null;
  embedding_dim: number;
  embedding_model: string;
}

const FLOAT32_BYTES = Float32Array.BYTES_PER_ELEMENT;
const EMBEDDING_CANDIDATE_LIMIT = 500;

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

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function serializeFloat32Array(values: Float32Array): Buffer {
  return Buffer.from(values.buffer, values.byteOffset, values.byteLength);
}

function bufferToFloat32Array(buffer: Buffer): Float32Array | null {
  if (buffer.length === 0 || buffer.length % FLOAT32_BYTES !== 0) {
    return null;
  }
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / FLOAT32_BYTES);
}

function cloneFloat32Array(buffer: Buffer): Float32Array | null {
  const view = bufferToFloat32Array(buffer);
  if (!view) {
    return null;
  }
  const copy = new Float32Array(view.length);
  copy.set(view);
  return copy;
}

export class SemanticRepository {
  constructor(private readonly db: Database.Database) {}

  upsertFromMemory(memory: MemoryItem): void {
    try {
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
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError('Failed to update semantic index.', {
        code: 'STORAGE_SEMANTIC_UPSERT_FAILED',
        context: {
          memoryId: memory.id,
          updatedAt: memory.timestamps.updatedAt,
        },
        cause: error,
      });
    }
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
    try {
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
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError('Failed to search semantic index.', {
        code: 'STORAGE_SEMANTIC_SEARCH_FAILED',
        context: {
          query,
          limit: options.limit,
          candidateLimit: options.candidateLimit,
          minScore: options.minScore,
        },
        cause: error,
      });
    }
  }

  async storeEmbedding(memoryId: string, values: Float32Array, model: string): Promise<void> {
    if (values.length === 0) {
      throw new StorageError('Embedding vector must contain at least one dimension.', {
        code: 'STORAGE_SEMANTIC_EMBEDDING_INVALID',
        context: { memoryId, model },
      });
    }

    try {
      const buffer = serializeFloat32Array(values);
      const dimensions = values.length;
      const updatedAt = new Date().toISOString();

      const tx = this.db.transaction(() => {
        const result = this.db
          .prepare(`
            UPDATE memory_items
            SET embedding_blob = ?, embedding_dim = ?, embedding_model = ?
            WHERE id = ?
          `)
          .run(buffer, dimensions, model, memoryId);

        if (result.changes === 0) {
          throw new StorageError('Memory not found for embedding update.', {
            code: 'STORAGE_SEMANTIC_EMBEDDING_MEMORY_NOT_FOUND',
            context: { memoryId },
          });
        }

        this.db
          .prepare(`
            INSERT INTO embedding_meta (memory_id, model, dimensions, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(memory_id) DO UPDATE SET
              model = excluded.model,
              dimensions = excluded.dimensions,
              updated_at = excluded.updated_at
          `)
          .run(memoryId, model, dimensions, updatedAt);
      });

      tx();
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError('Failed to store embedding.', {
        code: 'STORAGE_SEMANTIC_EMBEDDING_STORE_FAILED',
        context: { memoryId, model },
        cause: error,
      });
    }
  }

  async searchByCosine(
    queryVector: Float32Array,
    limit: number,
    minScore = 0.2,
  ): Promise<SemanticEmbeddingSearchHit[]> {
    if (queryVector.length === 0) {
      return [];
    }

    const topK = parsePositiveInteger(limit, 10);
    const threshold = typeof minScore === 'number' ? minScore : 0;

    try {
      const rows = this.db
        .prepare(`
          SELECT id as memory_id, embedding_blob, embedding_dim, embedding_model
          FROM memory_items
          WHERE embedding_blob IS NOT NULL AND embedding_dim = ?
          LIMIT ?
        `)
        .all(queryVector.length, EMBEDDING_CANDIDATE_LIMIT) as MemoryEmbeddingRow[];

      const hits: SemanticEmbeddingSearchHit[] = [];
      for (const row of rows) {
        if (!row.embedding_blob) {
          continue;
        }
        const vector = bufferToFloat32Array(row.embedding_blob);
        if (!vector || vector.length !== queryVector.length) {
          continue;
        }

        const score = cosineSimilarity(queryVector, vector);
        if (!Number.isFinite(score) || score < threshold) {
          continue;
        }

        hits.push({
          memoryId: row.memory_id,
          score,
        });
      }

      hits.sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return right.memoryId.localeCompare(left.memoryId);
      });

      return hits.slice(0, topK);
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError('Failed to search embeddings.', {
        code: 'STORAGE_SEMANTIC_EMBEDDING_SEARCH_FAILED',
        context: { limit, minScore },
        cause: error,
      });
    }
  }

  async getEmbedding(memoryId: string): Promise<SemanticEmbeddingRecord | null> {
    try {
      const row = this.db
        .prepare(`
          SELECT embedding_blob, embedding_dim, embedding_model
          FROM memory_items
          WHERE id = ?
          LIMIT 1
        `)
        .get(memoryId) as
        | { embedding_blob: Buffer | null; embedding_dim: number; embedding_model: string | null }
        | undefined;

      if (!row || !row.embedding_blob || row.embedding_dim <= 0) {
        return null;
      }

      const values = cloneFloat32Array(row.embedding_blob);
      if (!values) {
        return null;
      }

      return {
        values,
        model: row.embedding_model ?? '',
        dimensions: row.embedding_dim,
      };
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError('Failed to load embedding.', {
        code: 'STORAGE_SEMANTIC_EMBEDDING_FETCH_FAILED',
        context: { memoryId },
        cause: error,
      });
    }
  }

  async deleteEmbedding(memoryId: string): Promise<void> {
    try {
      const tx = this.db.transaction(() => {
        this.db
          .prepare(`
            UPDATE memory_items
            SET embedding_blob = NULL,
                embedding_dim = 0,
                embedding_model = ''
            WHERE id = ?
          `)
          .run(memoryId);
        this.db.prepare('DELETE FROM embedding_meta WHERE memory_id = ?').run(memoryId);
      });
      tx();
    } catch (error) {
      if (error instanceof StorageError) {
        throw error;
      }
      throw new StorageError('Failed to delete embedding.', {
        code: 'STORAGE_SEMANTIC_EMBEDDING_DELETE_FAILED',
        context: { memoryId },
        cause: error,
      });
    }
  }
}
