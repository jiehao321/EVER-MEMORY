import type Database from 'better-sqlite3';

export interface ButlerSearchRecord {
  id: string;
  query: string;
  gapId?: string;
  resultsCount: number;
  resultsJson?: string;
  synthesizedJson?: string;
  createdAt: string;
}

interface ButlerSearchRow {
  id: string;
  query: string;
  gap_id: string | null;
  results_count: number;
  results_json: string | null;
  synthesized_json: string | null;
  created_at: string;
}

function toButlerSearch(row: ButlerSearchRow): ButlerSearchRecord {
  return {
    id: row.id,
    query: row.query,
    gapId: row.gap_id ?? undefined,
    resultsCount: row.results_count,
    resultsJson: row.results_json ?? undefined,
    synthesizedJson: row.synthesized_json ?? undefined,
    createdAt: row.created_at,
  };
}

export class ButlerSearchRepository {
  private readonly stmtInsert: Database.Statement;
  private readonly stmtFindById: Database.Statement;
  private readonly stmtFindRecent: Database.Statement;

  constructor(private readonly db: Database.Database) {
    this.stmtInsert = db.prepare(`
      INSERT INTO butler_searches (
        id, query, gap_id, results_count, results_json, synthesized_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    this.stmtFindById = db.prepare('SELECT * FROM butler_searches WHERE id = ? LIMIT 1');
    this.stmtFindRecent = db.prepare(`
      SELECT *
      FROM butler_searches
      ORDER BY created_at DESC, rowid DESC
      LIMIT ?
    `);
  }

  insert(search: ButlerSearchRecord): void {
    this.stmtInsert.run(
      search.id,
      search.query,
      search.gapId ?? null,
      search.resultsCount,
      search.resultsJson ?? null,
      search.synthesizedJson ?? null,
      search.createdAt,
    );
  }

  findById(id: string): ButlerSearchRecord | null {
    const row = this.stmtFindById.get(id) as ButlerSearchRow | undefined;
    return row ? toButlerSearch(row) : null;
  }

  findRecent(limit: number): ButlerSearchRecord[] {
    const rows = this.stmtFindRecent.all(limit) as ButlerSearchRow[];
    return rows.map(toButlerSearch);
  }
}

export { ButlerSearchRepository as ButlerSearchRepo };
