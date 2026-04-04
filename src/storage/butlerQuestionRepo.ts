import type Database from 'better-sqlite3';

export type ButlerQuestionStatus = 'pending' | 'asked' | 'answered' | 'expired' | 'dismissed';

export interface ButlerQuestionRecord {
  id: string;
  gapType: string;
  questionText: string;
  contextJson?: string;
  status: ButlerQuestionStatus;
  answerText?: string;
  memoryIdsJson?: string;
  askedAt?: string;
  answeredAt?: string;
  createdAt: string;
}

interface ButlerQuestionRow {
  id: string;
  gap_type: string;
  question_text: string;
  context_json: string | null;
  status: ButlerQuestionStatus;
  answer_text: string | null;
  memory_ids_json: string | null;
  asked_at: string | null;
  answered_at: string | null;
  created_at: string;
}

interface CountRow {
  count: number;
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function toButlerQuestion(row: ButlerQuestionRow): ButlerQuestionRecord {
  return {
    id: row.id,
    gapType: row.gap_type,
    questionText: row.question_text,
    contextJson: row.context_json ?? undefined,
    status: row.status,
    answerText: row.answer_text ?? undefined,
    memoryIdsJson: row.memory_ids_json ?? undefined,
    askedAt: row.asked_at ?? undefined,
    answeredAt: row.answered_at ?? undefined,
    createdAt: row.created_at,
  };
}

export class ButlerQuestionRepository {
  private readonly stmtInsert: Database.Statement;
  private readonly stmtFindById: Database.Statement;
  private readonly stmtFindByStatus: Database.Statement;
  private readonly stmtUpdateStatus: Database.Statement;
  private readonly stmtDailyCount: Database.Statement;

  constructor(private readonly db: Database.Database) {
    this.stmtInsert = db.prepare(`
      INSERT INTO butler_questions (
        id, gap_type, question_text, context_json, status, answer_text,
        memory_ids_json, asked_at, answered_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.stmtFindById = db.prepare('SELECT * FROM butler_questions WHERE id = ? LIMIT 1');
    this.stmtFindByStatus = db.prepare(`
      SELECT *
      FROM butler_questions
      WHERE status = ?
      ORDER BY created_at DESC, rowid DESC
    `);
    this.stmtUpdateStatus = db.prepare(`
      UPDATE butler_questions
      SET status = ?,
          answer_text = COALESCE(?, answer_text),
          asked_at = COALESCE(?, asked_at),
          answered_at = COALESCE(?, answered_at)
      WHERE id = ?
    `);
    this.stmtDailyCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM butler_questions
      WHERE asked_at IS NOT NULL
        AND substr(asked_at, 1, 10) = ?
    `);
  }

  insert(question: ButlerQuestionRecord): void {
    this.stmtInsert.run(
      question.id,
      question.gapType,
      question.questionText,
      question.contextJson ?? null,
      question.status,
      question.answerText ?? null,
      question.memoryIdsJson ?? null,
      question.askedAt ?? null,
      question.answeredAt ?? null,
      question.createdAt,
    );
  }

  findById(id: string): ButlerQuestionRecord | null {
    const row = this.stmtFindById.get(id) as ButlerQuestionRow | undefined;
    return row ? toButlerQuestion(row) : null;
  }

  findByStatus(status: ButlerQuestionStatus): ButlerQuestionRecord[] {
    const rows = this.stmtFindByStatus.all(status) as ButlerQuestionRow[];
    return rows.map(toButlerQuestion);
  }

  updateStatus(
    id: string,
    status: ButlerQuestionStatus,
    patch: { answerText?: string; askedAt?: string; answeredAt?: string } = {},
  ): void {
    this.stmtUpdateStatus.run(status, patch.answerText ?? null, patch.askedAt ?? null, patch.answeredAt ?? null, id);
  }

  getDailyCount(date = todayStamp()): number {
    return (this.stmtDailyCount.get(date) as CountRow).count;
  }
}

export { ButlerQuestionRepository as ButlerQuestionRepo };
