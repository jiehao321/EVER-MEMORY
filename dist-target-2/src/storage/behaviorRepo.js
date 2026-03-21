import { evaluateBehaviorLifecycle } from '../core/behavior/lifecycle.js';
import { safeJsonParse } from '../util/json.js';
function isStringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim().length > 0);
}
function parseStringArray(value) {
    const parsed = safeJsonParse(value ?? '[]', []);
    return isStringArray(parsed) ? parsed : [];
}
function toBehaviorRule(row) {
    const baseRule = {
        id: row.id,
        statement: row.statement,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        appliesTo: {
            userId: row.applies_to_user_id ?? undefined,
            channel: row.applies_to_channel ?? undefined,
            intentTypes: parseStringArray(row.intent_types_json),
            contexts: parseStringArray(row.contexts_json),
        },
        category: row.category,
        priority: row.priority,
        evidence: {
            reflectionIds: parseStringArray(row.reflection_ids_json),
            memoryIds: parseStringArray(row.memory_ids_json),
            confidence: row.evidence_confidence,
            recurrenceCount: row.recurrence_count,
        },
        lifecycle: {
            duration: row.duration ?? undefined,
            level: row.level ?? 'baseline',
            maturity: row.maturity ?? 'emerging',
            applyCount: row.apply_count ?? 0,
            contradictionCount: row.contradiction_count ?? 0,
            lastAppliedAt: row.last_applied_at ?? undefined,
            lastContradictedAt: row.last_contradicted_at ?? undefined,
            lastReviewedAt: row.last_reviewed_at ?? undefined,
            stale: row.stale === 1,
            staleness: row.staleness ?? 'fresh',
            decayScore: row.decay_score ?? 0,
            frozenAt: row.frozen_at ?? undefined,
            freezeReason: row.freeze_reason ?? undefined,
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
    db;
    constructor(db) {
        this.db = db;
    }
    /** A9: Run a block of operations inside a single SQLite transaction */
    transaction(fn) {
        return this.db.transaction(fn)();
    }
    insert(rule) {
        this.db.prepare(`
      INSERT INTO behavior_rules (
        id, statement, created_at, updated_at,
        applies_to_user_id, applies_to_channel, intent_types_json, contexts_json,
        category, priority,
        reflection_ids_json, memory_ids_json, evidence_confidence, recurrence_count,
        duration, level, maturity, apply_count, contradiction_count,
        last_applied_at, last_contradicted_at, last_reviewed_at,
        stale, staleness, decay_score, frozen_at, freeze_reason, expires_at,
        active, deprecated, superseded_by,
        frozen, status_reason, status_source_reflection_id, status_changed_at,
        promoted_from_reflection_id, promoted_reason, promoted_at, review_source_refs_json,
        promotion_evidence_summary, deactivated_by_rule_id, deactivated_by_reflection_id,
        deactivated_reason, deactivated_at, tags_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        duration = excluded.duration,
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
    `).run(rule.id, rule.statement, rule.createdAt, rule.updatedAt, rule.appliesTo.userId ?? null, rule.appliesTo.channel ?? null, JSON.stringify(rule.appliesTo.intentTypes ?? []), JSON.stringify(rule.appliesTo.contexts ?? []), rule.category, rule.priority, JSON.stringify(rule.evidence.reflectionIds), JSON.stringify(rule.evidence.memoryIds), rule.evidence.confidence, rule.evidence.recurrenceCount, rule.lifecycle.duration ?? null, rule.lifecycle.level, rule.lifecycle.maturity, rule.lifecycle.applyCount, rule.lifecycle.contradictionCount, rule.lifecycle.lastAppliedAt ?? null, rule.lifecycle.lastContradictedAt ?? null, rule.lifecycle.lastReviewedAt ?? null, rule.lifecycle.stale ? 1 : 0, rule.lifecycle.staleness, rule.lifecycle.decayScore, rule.lifecycle.frozenAt ?? null, rule.lifecycle.freezeReason ?? null, rule.lifecycle.expiresAt ?? null, rule.state.active ? 1 : 0, rule.state.deprecated ? 1 : 0, rule.state.supersededBy ?? null, rule.state.frozen ? 1 : 0, rule.state.statusReason ?? null, rule.state.statusSourceReflectionId ?? null, rule.state.statusChangedAt ?? null, rule.trace?.promotedFromReflectionId ?? null, rule.trace?.promotedReason ?? null, rule.trace?.promotedAt ?? null, JSON.stringify(rule.trace?.reviewSourceRefs ?? []), rule.trace?.promotionEvidenceSummary ?? null, rule.trace?.deactivatedByRuleId ?? null, rule.trace?.deactivatedByReflectionId ?? null, rule.trace?.deactivatedReason ?? null, rule.trace?.deactivatedAt ?? null, JSON.stringify(rule.tags ?? []));
    }
    findById(id) {
        const row = this.db.prepare('SELECT * FROM behavior_rules WHERE id = ? LIMIT 1').get(id);
        return row ? this.refreshLifecycle(row) : null;
    }
    listRecent(limit = 20) {
        const rows = this.db.prepare(`
      SELECT * FROM behavior_rules
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(limit);
        return rows.map((row) => this.refreshLifecycle(row));
    }
    listByDuration(input) {
        const clauses = ['duration = ?'];
        const params = [input.duration];
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
        }
        if (input.channel) {
            clauses.push('(applies_to_channel IS NULL OR applies_to_channel = ?)');
            params.push(input.channel);
        }
        const rows = this.db.prepare(`
      SELECT * FROM behavior_rules
      WHERE ${clauses.join(' AND ')}
      ORDER BY updated_at DESC
    `).all(...params);
        return rows.map((row) => this.refreshLifecycle(row));
    }
    listActiveCandidates(input = {}) {
        const clauses = [];
        const params = [];
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
        }
        else {
            clauses.push('applies_to_user_id IS NULL');
        }
        if (input.channel) {
            clauses.push('(applies_to_channel IS NULL OR applies_to_channel = ?)');
            params.push(input.channel);
        }
        else {
            clauses.push('applies_to_channel IS NULL');
        }
        const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
        const rows = this.db.prepare(`
      SELECT * FROM behavior_rules
      ${whereClause}
      ORDER BY priority DESC, updated_at DESC
      LIMIT ?
    `).all(...params, input.limit ?? 100);
        return rows
            .map((row) => this.refreshLifecycle(row))
            .filter((rule) => (input.includeInactive || rule.state.active)
            && (input.includeDeprecated || !rule.state.deprecated)
            && (input.includeFrozen || !rule.state.frozen));
    }
    countActive(userId) {
        const row = userId
            ? this.db.prepare(`
          SELECT COUNT(*) as count
          FROM behavior_rules
          WHERE active = 1
            AND deprecated = 0
            AND (frozen IS NULL OR frozen = 0)
            AND (applies_to_user_id IS NULL OR applies_to_user_id = ?)
        `).get(userId)
            : this.db.prepare(`
          SELECT COUNT(*) as count
          FROM behavior_rules
          WHERE active = 1
            AND deprecated = 0
            AND (frozen IS NULL OR frozen = 0)
            AND applies_to_user_id IS NULL
        `).get();
        return row.count;
    }
    listStaleEmerging(olderThanDays) {
        const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
        const rows = this.db.prepare(`
      SELECT * FROM behavior_rules
      WHERE maturity = 'emerging'
        AND (apply_count IS NULL OR apply_count = 0)
        AND created_at < ?
        AND active = 1
        AND deprecated = 0
      ORDER BY created_at ASC
    `).all(cutoff);
        return rows.map((row) => this.refreshLifecycle(row));
    }
    refreshLifecycle(row) {
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
