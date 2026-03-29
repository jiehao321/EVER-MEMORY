import type Database from 'better-sqlite3';
import type {
  FeedbackAggregation,
  FeedbackSignal,
  FeedbackSignalSource,
  RetrievalFactor,
  RetrievalFactorAggregation,
  RetrievalFeedback,
} from '../types/feedback.js';

interface RetrievalFeedbackRow {
  id: string;
  session_id: string;
  memory_id: string;
  query: string;
  strategy: string;
  recall_rank: number;
  score: number;
  signal: FeedbackSignal;
  signal_source: FeedbackSignalSource;
  created_at: string;
  top_factors: string;
}

interface FeedbackAggregationRow {
  strategy: string;
  total_used: number;
  total_ignored: number;
  total_unknown: number;
}

interface FactorAccumulator {
  usedTotal: number;
  usedCount: number;
  ignoredTotal: number;
  ignoredCount: number;
}

function isRetrievalFactor(value: unknown): value is RetrievalFactor {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<RetrievalFactor>;
  return typeof candidate.name === 'string'
    && candidate.name.length > 0
    && typeof candidate.value === 'number'
    && Number.isFinite(candidate.value);
}

function parseTopFactors(raw: string | null | undefined): RetrievalFactor[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isRetrievalFactor);
  } catch {
    return [];
  }
}

function toFeedback(row: RetrievalFeedbackRow): RetrievalFeedback {
  return {
    id: row.id,
    sessionId: row.session_id,
    memoryId: row.memory_id,
    query: row.query,
    strategy: row.strategy,
    recallRank: row.recall_rank,
    score: row.score,
    signal: row.signal,
    signalSource: row.signal_source,
    createdAt: row.created_at,
    topFactors: parseTopFactors(row.top_factors),
  };
}

export class FeedbackRepository {
  constructor(private readonly db: Database.Database) {}

  /** Insert a new feedback record */
  insert(feedback: RetrievalFeedback): void {
    const stmt = this.db.prepare(`
      INSERT INTO retrieval_feedback (
        id, session_id, memory_id, query, strategy, recall_rank, score, signal, signal_source, created_at, top_factors
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      feedback.id,
      feedback.sessionId,
      feedback.memoryId,
      feedback.query,
      feedback.strategy,
      feedback.recallRank,
      feedback.score,
      feedback.signal,
      feedback.signalSource,
      feedback.createdAt,
      JSON.stringify(feedback.topFactors),
    );
  }

  /** Update signal for a specific feedback record */
  updateSignal(id: string, signal: FeedbackSignal, signalSource: FeedbackSignalSource): void {
    this.db.prepare(
      'UPDATE retrieval_feedback SET signal = ?, signal_source = ? WHERE id = ?',
    ).run(signal, signalSource, id);
  }

  /** Update signal for all feedback records matching session + memory */
  updateSignalBySessionMemory(
    sessionId: string,
    memoryId: string,
    signal: FeedbackSignal,
    signalSource: FeedbackSignalSource,
  ): void {
    this.db.prepare(
      'UPDATE retrieval_feedback SET signal = ?, signal_source = ? WHERE session_id = ? AND memory_id = ? AND signal = ?',
    ).run(signal, signalSource, sessionId, memoryId, 'unknown');
  }

  /** Get feedback for a session */
  findBySession(sessionId: string): RetrievalFeedback[] {
    const rows = this.db.prepare(
      'SELECT * FROM retrieval_feedback WHERE session_id = ? ORDER BY created_at DESC',
    ).all(sessionId) as RetrievalFeedbackRow[];

    return rows.map(toFeedback);
  }

  /** Get feedback for a memory */
  findByMemory(memoryId: string, limit = 50): RetrievalFeedback[] {
    const rows = this.db.prepare(
      'SELECT * FROM retrieval_feedback WHERE memory_id = ? ORDER BY created_at DESC LIMIT ?',
    ).all(memoryId, limit) as RetrievalFeedbackRow[];

    return rows.map(toFeedback);
  }

  /** Aggregate feedback by strategy over the last N days */
  aggregateByStrategy(days = 30): FeedbackAggregation[] {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const rows = this.db.prepare(`
      SELECT strategy,
        SUM(CASE WHEN signal = 'used' THEN 1 ELSE 0 END) as total_used,
        SUM(CASE WHEN signal = 'ignored' THEN 1 ELSE 0 END) as total_ignored,
        SUM(CASE WHEN signal = 'unknown' THEN 1 ELSE 0 END) as total_unknown
      FROM retrieval_feedback
      WHERE created_at >= ?
      GROUP BY strategy
      ORDER BY strategy ASC
    `).all(cutoff) as FeedbackAggregationRow[];

    return rows.map((row) => ({
      strategy: row.strategy,
      totalUsed: row.total_used,
      totalIgnored: row.total_ignored,
      totalUnknown: row.total_unknown,
      effectiveness: (row.total_used + row.total_ignored) > 0
        ? row.total_used / (row.total_used + row.total_ignored)
        : Number.NaN,
    }));
  }

  /** Aggregate average factor values by factor name over the last N days. */
  aggregateFactorEffectiveness(days = 30): RetrievalFactorAggregation[] {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const rows = this.db.prepare(`
      SELECT signal, top_factors
      FROM retrieval_feedback
      WHERE created_at >= ?
        AND signal IN ('used', 'ignored')
    `).all(cutoff) as Array<Pick<RetrievalFeedbackRow, 'signal' | 'top_factors'>>;

    const accumulators = new Map<string, FactorAccumulator>();

    for (const row of rows) {
      const factors = parseTopFactors(row.top_factors);
      for (const factor of factors) {
        const accumulator = accumulators.get(factor.name) ?? {
          usedTotal: 0,
          usedCount: 0,
          ignoredTotal: 0,
          ignoredCount: 0,
        };

        if (row.signal === 'used') {
          accumulator.usedTotal += factor.value;
          accumulator.usedCount += 1;
        } else if (row.signal === 'ignored') {
          accumulator.ignoredTotal += factor.value;
          accumulator.ignoredCount += 1;
        }

        accumulators.set(factor.name, accumulator);
      }
    }

    return [...accumulators.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([factor, accumulator]) => ({
        factor,
        usedAverage: accumulator.usedCount > 0
          ? accumulator.usedTotal / accumulator.usedCount
          : Number.NaN,
        ignoredAverage: accumulator.ignoredCount > 0
          ? accumulator.ignoredTotal / accumulator.ignoredCount
          : Number.NaN,
        usedCount: accumulator.usedCount,
        ignoredCount: accumulator.ignoredCount,
      }));
  }

  /** Count total feedback records */
  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM retrieval_feedback').get() as { count: number };
    return row.count;
  }
}
