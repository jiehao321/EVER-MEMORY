import type Database from 'better-sqlite3';
import { evaluateBehaviorLifecycle } from '../core/behavior/lifecycle.js';
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
  level: string | null;
  maturity: string | null;
  apply_count: number | null;
  contradiction_count: number | null;
  last_applied_at: string | null;
  last_contradicted_at: string | null;
  last_reviewed_at: string | null;
  stale: number | null;
  staleness: string | null;
  decay_score: number | null;
  frozen_at: string | null;
  freeze_reason: string | null;
  expires_at: string | null;
  active: number;
  deprecated: number;
  superseded_by: string | null;
  frozen: number | null;
  status_reason: string | null;
  status_source_reflection_id: string | null;
  status_changed_at: string | null;
  promoted_from_reflection_id: string | null;
  promoted_reason: string | null;
  promoted_at: string | null;
  review_source_refs_json: string | null;
  promotion_evidence_summary: string | null;
  deactivated_by_rule_id: string | null;
  deactivated_by_reflection_id: string | null;
  deactivated_reason: string | null;
  deactivated_at: string | null;
  tags_json: string | null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim().length > 0);
}

function parseStringArray(value: string | null): string[] {
  const parsed = safeJsonParse<unknown>(value ?? '[]', []);
  return isStringArray(parsed) ? parsed : [];
}

function toBehaviorRule(row: BehaviorRuleRow): BehaviorRule {
  const baseRule: BehaviorRule = {
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
    lifecycle: {
      level: (row.level as BehaviorRule['lifecycle']['level'] | null) ?? 'baseline',
      maturity: (row.maturity as BehaviorRule['lifecycle']['maturity'] | null) ?? 'emerging',
      applyCount: row.apply_count ?? 0,
      contradictionCount: row.contradiction_count ?? 0,
      lastAppliedAt: row.last_applied_at ?? undefined,
      lastContradictedAt: row.last_contradicted_at ?? undefined,
      lastReviewedAt: row.last_reviewed_at ?? undefined,
      stale: row.stale === 1,
      staleness: (row.staleness as BehaviorRule['lifecycle']['staleness'] | null) ?? 'fresh',
      decayScore: row.decay_score ?? 0,
      frozenAt: row.frozen_at ?? undefined,
      freezeReason: (row.freeze_reason as BehaviorRule['lifecycle']['freezeReason'] | null) ?? undefined,
      expiresAt: row.expires_at ?? undefined,
    },
    state: {
      active: row.active === 1,
      deprecated: row.deprecated === 1,
      frozen: row.frozen === 1,
      supersededBy: row.superseded_by ?? undefined,
      statusReason: row.status_reason ?? undefined,
      statusSourceReflectionId: row.status_source_reflection_id ?? undefined,
      statusChangedAt: row.status_changed_at ?? undefined,
    },
    trace: {
      promotedFromReflectionId: row.promoted_from_reflection_id ?? undefined,
      promotedReason: row.promoted_reason ?? undefined,
      promotedAt: row.promoted_at ?? undefined,
      reviewSourceRefs: parseStringArray(row.review_source_refs_json),
      promotionEvidenceSummary: row.promotion_evidence_summary ?? undefined,
      deactivatedByRuleId: row.deactivated_by_rule_id ?? undefined,
      deactivatedByReflectionId: row.deactivated_by_reflection_id ?? undefined,
      deactivatedReason: row.deactivated_reason ?? undefined,
      deactivatedAt: row.deactivated_at ?? undefined,
    },
    tags: parseStringArray(row.tags_json),
  };

  return evaluateBehaviorLifecycle(baseRule, new Date(baseRule.updatedAt));
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
        level, maturity, apply_count, contradiction_count,
        last_applied_at, last_contradicted_at, last_reviewed_at,
        stale, staleness, decay_score, frozen_at, freeze_reason, expires_at,
        active, deprecated, superseded_by,
        frozen, status_reason, status_source_reflection_id, status_changed_at,
        promoted_from_reflection_id, promoted_reason, promoted_at, review_source_refs_json,
        promotion_evidence_summary, deactivated_by_rule_id, deactivated_by_reflection_id,
        deactivated_reason, deactivated_at, tags_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        level = excluded.level,
        maturity = excluded.maturity,
        apply_count = excluded.apply_count,
        contradiction_count = excluded.contradiction_count,
        last_applied_at = excluded.last_applied_at,
        last_contradicted_at = excluded.last_contradicted_at,
        last_reviewed_at = excluded.last_reviewed_at,
        stale = excluded.stale,
        staleness = excluded.staleness,
        decay_score = excluded.decay_score,
        frozen_at = excluded.frozen_at,
        freeze_reason = excluded.freeze_reason,
        expires_at = excluded.expires_at,
        active = excluded.active,
        deprecated = excluded.deprecated,
        superseded_by = excluded.superseded_by,
        frozen = excluded.frozen,
        status_reason = excluded.status_reason,
        status_source_reflection_id = excluded.status_source_reflection_id,
        status_changed_at = excluded.status_changed_at,
        promoted_from_reflection_id = excluded.promoted_from_reflection_id,
        promoted_reason = excluded.promoted_reason,
        promoted_at = excluded.promoted_at,
        review_source_refs_json = excluded.review_source_refs_json,
        promotion_evidence_summary = excluded.promotion_evidence_summary,
        deactivated_by_rule_id = excluded.deactivated_by_rule_id,
        deactivated_by_reflection_id = excluded.deactivated_by_reflection_id,
        deactivated_reason = excluded.deactivated_reason,
        deactivated_at = excluded.deactivated_at,
        tags_json = excluded.tags_json
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
      rule.lifecycle.level,
      rule.lifecycle.maturity,
      rule.lifecycle.applyCount,
      rule.lifecycle.contradictionCount,
      rule.lifecycle.lastAppliedAt ?? null,
      rule.lifecycle.lastContradictedAt ?? null,
      rule.lifecycle.lastReviewedAt ?? null,
      rule.lifecycle.stale ? 1 : 0,
      rule.lifecycle.staleness,
      rule.lifecycle.decayScore,
      rule.lifecycle.frozenAt ?? null,
      rule.lifecycle.freezeReason ?? null,
      rule.lifecycle.expiresAt ?? null,
      rule.state.active ? 1 : 0,
      rule.state.deprecated ? 1 : 0,
      rule.state.supersededBy ?? null,
      rule.state.frozen ? 1 : 0,
      rule.state.statusReason ?? null,
      rule.state.statusSourceReflectionId ?? null,
      rule.state.statusChangedAt ?? null,
      rule.trace?.promotedFromReflectionId ?? null,
      rule.trace?.promotedReason ?? null,
      rule.trace?.promotedAt ?? null,
      JSON.stringify(rule.trace?.reviewSourceRefs ?? []),
      rule.trace?.promotionEvidenceSummary ?? null,
      rule.trace?.deactivatedByRuleId ?? null,
      rule.trace?.deactivatedByReflectionId ?? null,
      rule.trace?.deactivatedReason ?? null,
      rule.trace?.deactivatedAt ?? null,
      JSON.stringify(rule.tags ?? []),
    );
  }

  findById(id: string): BehaviorRule | null {
    const row = this.db.prepare('SELECT * FROM behavior_rules WHERE id = ? LIMIT 1').get(id) as
      | BehaviorRuleRow
      | undefined;
    return row ? this.refreshLifecycle(row) : null;
  }

  listRecent(limit = 20): BehaviorRule[] {
    const rows = this.db.prepare(`
      SELECT * FROM behavior_rules
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(limit) as BehaviorRuleRow[];

    return rows.map((row) => this.refreshLifecycle(row));
  }

  listActiveCandidates(input: {
    userId?: string;
    channel?: string;
    limit?: number;
    includeInactive?: boolean;
    includeDeprecated?: boolean;
    includeFrozen?: boolean;
  } = {}): BehaviorRule[] {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (!input.includeInactive) {
      clauses.push('active = 1');
    }
    if (!input.includeDeprecated) {
      clauses.push('deprecated = 0');
    }
    if (!input.includeFrozen) {
      clauses.push('(frozen IS NULL OR frozen = 0)');
    }

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

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(`
      SELECT * FROM behavior_rules
      ${whereClause}
      ORDER BY priority DESC, updated_at DESC
      LIMIT ?
    `).all(...params, input.limit ?? 100) as BehaviorRuleRow[];

    return rows
      .map((row) => this.refreshLifecycle(row))
      .filter((rule) => (input.includeInactive || rule.state.active)
        && (input.includeDeprecated || !rule.state.deprecated)
        && (input.includeFrozen || !rule.state.frozen));
  }

  countActive(userId?: string): number {
    const row = userId
      ? this.db.prepare(`
          SELECT COUNT(*) as count
          FROM behavior_rules
          WHERE active = 1
            AND deprecated = 0
            AND (frozen IS NULL OR frozen = 0)
            AND (applies_to_user_id IS NULL OR applies_to_user_id = ?)
        `).get(userId) as { count: number }
      : this.db.prepare(`
          SELECT COUNT(*) as count
          FROM behavior_rules
          WHERE active = 1
            AND deprecated = 0
            AND (frozen IS NULL OR frozen = 0)
            AND applies_to_user_id IS NULL
        `).get() as { count: number };

    return row.count;
  }

  private refreshLifecycle(row: BehaviorRuleRow): BehaviorRule {
    const hydrated = toBehaviorRule(row);
    const refreshed = evaluateBehaviorLifecycle(hydrated);
    const changed = JSON.stringify(refreshed.lifecycle) !== JSON.stringify(hydrated.lifecycle)
      || refreshed.priority !== hydrated.priority
      || refreshed.state.active !== hydrated.state.active
      || refreshed.state.deprecated !== hydrated.state.deprecated
      || refreshed.state.frozen !== hydrated.state.frozen;

    if (changed) {
      this.insert(refreshed);
    }
    return refreshed;
  }
}
