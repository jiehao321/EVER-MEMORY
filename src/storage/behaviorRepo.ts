import type Database from 'better-sqlite3';
import type { BehaviorRule, BehaviorRuleCategory, IntentType } from '../types.js';
import { safeJsonParse } from '../util/json.js';

interface BehaviorRuleRow {
  id: string;
  statement: string;
  created_at: string;
  updated_at: string;
  applies_to_user_id: string | null;
  applies_to_channel: string | null;
  intent_types_json: string;
  contexts_json: string;
  category: string;
  priority: number;
  reflection_ids_json: string;
  memory_ids_json: string;
  evidence_confidence: number;
  recurrence_count: number;
  active: number;
  deprecated: number;
  superseded_by: string | null;
}

function parseStringArray(value: string): string[] {
  const parsed = safeJsonParse(value, []) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function toBehaviorRule(row: BehaviorRuleRow): BehaviorRule {
  return {
    id: row.id,
    statement: row.statement,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    appliesTo: {
      userId: row.applies_to_user_id ?? undefined,
      channel: row.applies_to_channel ?? undefined,
      intentTypes: parseStringArray(row.intent_types_json) as IntentType[],
      contexts: parseStringArray(row.contexts_json),
    },
    category: row.category as BehaviorRuleCategory,
    priority: row.priority,
    evidence: {
      reflectionIds: parseStringArray(row.reflection_ids_json),
      memoryIds: parseStringArray(row.memory_ids_json),
      confidence: row.evidence_confidence,
      recurrenceCount: row.recurrence_count,
    },
    state: {
      active: row.active === 1,
      deprecated: row.deprecated === 1,
      supersededBy: row.superseded_by ?? undefined,
    },
  };
}

export class BehaviorRepository {
  constructor(private readonly db: Database.Database) {}

  insert(rule: BehaviorRule): void {
    this.db.prepare(`
      INSERT INTO behavior_rules (
        id, statement, created_at, updated_at,
        applies_to_user_id, applies_to_channel, intent_types_json, contexts_json,
        category, priority,
        reflection_ids_json, memory_ids_json, evidence_confidence, recurrence_count,
        active, deprecated, superseded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        statement = excluded.statement,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        applies_to_user_id = excluded.applies_to_user_id,
        applies_to_channel = excluded.applies_to_channel,
        intent_types_json = excluded.intent_types_json,
        contexts_json = excluded.contexts_json,
        category = excluded.category,
        priority = excluded.priority,
        reflection_ids_json = excluded.reflection_ids_json,
        memory_ids_json = excluded.memory_ids_json,
        evidence_confidence = excluded.evidence_confidence,
        recurrence_count = excluded.recurrence_count,
        active = excluded.active,
        deprecated = excluded.deprecated,
        superseded_by = excluded.superseded_by
    `).run(
      rule.id,
      rule.statement,
      rule.createdAt,
      rule.updatedAt,
      rule.appliesTo.userId ?? null,
      rule.appliesTo.channel ?? null,
      JSON.stringify(rule.appliesTo.intentTypes ?? []),
      JSON.stringify(rule.appliesTo.contexts ?? []),
      rule.category,
      rule.priority,
      JSON.stringify(rule.evidence.reflectionIds),
      JSON.stringify(rule.evidence.memoryIds),
      rule.evidence.confidence,
      rule.evidence.recurrenceCount,
      rule.state.active ? 1 : 0,
      rule.state.deprecated ? 1 : 0,
      rule.state.supersededBy ?? null,
    );
  }

  findById(id: string): BehaviorRule | null {
    const row = this.db.prepare('SELECT * FROM behavior_rules WHERE id = ? LIMIT 1').get(id) as
      | BehaviorRuleRow
      | undefined;
    return row ? toBehaviorRule(row) : null;
  }

  listRecent(limit = 20): BehaviorRule[] {
    const rows = this.db.prepare(`
      SELECT * FROM behavior_rules
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(limit) as BehaviorRuleRow[];

    return rows.map(toBehaviorRule);
  }

  listActiveCandidates(input: { userId?: string; channel?: string; limit?: number } = {}): BehaviorRule[] {
    const clauses = ['active = 1', 'deprecated = 0'];
    const params: unknown[] = [];

    if (input.userId) {
      clauses.push('(applies_to_user_id IS NULL OR applies_to_user_id = ?)');
      params.push(input.userId);
    } else {
      clauses.push('applies_to_user_id IS NULL');
    }

    if (input.channel) {
      clauses.push('(applies_to_channel IS NULL OR applies_to_channel = ?)');
      params.push(input.channel);
    } else {
      clauses.push('applies_to_channel IS NULL');
    }

    const rows = this.db.prepare(`
      SELECT * FROM behavior_rules
      WHERE ${clauses.join(' AND ')}
      ORDER BY priority DESC, updated_at DESC
      LIMIT ?
    `).all(...params, input.limit ?? 100) as BehaviorRuleRow[];

    return rows.map(toBehaviorRule);
  }

  countActive(userId?: string): number {
    const row = userId
      ? this.db.prepare(`
          SELECT COUNT(*) as count
          FROM behavior_rules
          WHERE active = 1
            AND deprecated = 0
            AND (applies_to_user_id IS NULL OR applies_to_user_id = ?)
        `).get(userId) as { count: number }
      : this.db.prepare(`
          SELECT COUNT(*) as count
          FROM behavior_rules
          WHERE active = 1
            AND deprecated = 0
            AND applies_to_user_id IS NULL
        `).get() as { count: number };

    return row.count;
  }
}
