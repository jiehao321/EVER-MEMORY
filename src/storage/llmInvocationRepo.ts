import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { LlmInvocation } from '../core/butler/types.js';

interface UsageRow {
  total_tokens: number | null;
  count: number;
}

export class LlmInvocationRepository {
  private readonly stmtInsert: Database.Statement;
  private readonly stmtDailyUsage: Database.Statement;
  private readonly stmtSessionUsage: Database.Statement;

  constructor(private readonly db: Database.Database) {
    this.stmtInsert = db.prepare(`
      INSERT INTO llm_invocations (
        id, task_type, trace_id, provider, model, prompt_tokens, completion_tokens, latency_ms, cache_hit, success, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.stmtDailyUsage = db.prepare(`
      SELECT
        SUM(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)) AS total_tokens,
        COUNT(*) AS count
      FROM llm_invocations
      WHERE substr(created_at, 1, 10) = ?
    `);
    this.stmtSessionUsage = db.prepare(`
      SELECT
        SUM(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)) AS total_tokens,
        COUNT(*) AS count
      FROM llm_invocations
      WHERE trace_id = ?
    `);
  }

  insert(invocation: Omit<LlmInvocation, 'id'>): string {
    const id = randomUUID();
    this.stmtInsert.run(
      id,
      invocation.taskType,
      invocation.traceId ?? null,
      invocation.provider ?? null,
      invocation.model ?? null,
      invocation.promptTokens ?? null,
      invocation.completionTokens ?? null,
      invocation.latencyMs ?? null,
      invocation.cacheHit ? 1 : 0,
      invocation.success ? 1 : 0,
      invocation.createdAt,
    );
    return id;
  }

  getDailyUsage(date = new Date().toISOString().slice(0, 10)): { totalTokens: number; count: number } {
    const row = this.stmtDailyUsage.get(date) as UsageRow;
    return {
      totalTokens: row.total_tokens ?? 0,
      count: row.count,
    };
  }

  getSessionUsage(traceId: string): { totalTokens: number; count: number } {
    const row = this.stmtSessionUsage.get(traceId) as UsageRow;
    return {
      totalTokens: row.total_tokens ?? 0,
      count: row.count,
    };
  }
}

export { LlmInvocationRepository as LlmInvocationRepo };
