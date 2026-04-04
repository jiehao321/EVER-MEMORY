export const CREATE_PHASE1_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS schema_version (\n    version INTEGER NOT NULL\n  )`,
  `CREATE TABLE IF NOT EXISTS memory_items (\n    id TEXT PRIMARY KEY,\n    content TEXT NOT NULL,\n    type TEXT NOT NULL,\n    lifecycle TEXT NOT NULL,\n    source_kind TEXT NOT NULL,\n    source_actor TEXT,\n    session_id TEXT,\n    message_id TEXT,\n    channel TEXT,\n    scope_user_id TEXT,\n    scope_chat_id TEXT,\n    scope_project TEXT,\n    scope_global INTEGER NOT NULL DEFAULT 0,\n    confidence REAL NOT NULL DEFAULT 0.5,\n    importance REAL NOT NULL DEFAULT 0.5,\n    explicitness REAL NOT NULL DEFAULT 0.5,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    last_accessed_at TEXT,\n    active INTEGER NOT NULL DEFAULT 1,\n    archived INTEGER NOT NULL DEFAULT 0,\n    superseded_by TEXT,\n    evidence_excerpt TEXT,\n    evidence_references_json TEXT,\n    tags_json TEXT NOT NULL,\n    related_entities_json TEXT NOT NULL,\n    access_count INTEGER NOT NULL DEFAULT 0,\n    retrieval_count INTEGER NOT NULL DEFAULT 0\n  )`,
  `CREATE TABLE IF NOT EXISTS boot_briefings (\n    id TEXT PRIMARY KEY,\n    session_id TEXT,\n    user_id TEXT,\n    generated_at TEXT NOT NULL,\n    sections_json TEXT NOT NULL,\n    token_target INTEGER NOT NULL,\n    actual_approx_tokens INTEGER NOT NULL\n  )`,
  `CREATE TABLE IF NOT EXISTS debug_events (\n    id TEXT PRIMARY KEY,\n    created_at TEXT NOT NULL,\n    kind TEXT NOT NULL,\n    entity_id TEXT,\n    payload_json TEXT NOT NULL\n  )`,
  'CREATE INDEX IF NOT EXISTS idx_memory_items_type ON memory_items(type)',
  'CREATE INDEX IF NOT EXISTS idx_memory_items_lifecycle ON memory_items(lifecycle)',
  'CREATE INDEX IF NOT EXISTS idx_memory_items_scope_user ON memory_items(scope_user_id)',
  'CREATE INDEX IF NOT EXISTS idx_memory_items_scope_chat ON memory_items(scope_chat_id)',
  'CREATE INDEX IF NOT EXISTS idx_memory_items_updated_at ON memory_items(updated_at)',
  'CREATE INDEX IF NOT EXISTS idx_debug_events_kind ON debug_events(kind)'
] as const;

export const CREATE_PHASE2_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS intent_records (\n    id TEXT PRIMARY KEY,\n    session_id TEXT,\n    message_id TEXT,\n    created_at TEXT NOT NULL,\n    raw_text TEXT NOT NULL,\n    intent_type TEXT NOT NULL,\n    intent_subtype TEXT,\n    intent_confidence REAL NOT NULL,\n    urgency TEXT NOT NULL,\n    emotional_tone TEXT NOT NULL,\n    action_need TEXT NOT NULL,\n    memory_need TEXT NOT NULL,\n    preference_relevance REAL NOT NULL,\n    correction_signal REAL NOT NULL,\n    entities_json TEXT NOT NULL,\n    retrieval_hints_json TEXT NOT NULL\n  )`,
  'CREATE INDEX IF NOT EXISTS idx_intent_records_session ON intent_records(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_intent_records_created_at ON intent_records(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_intent_records_intent_type ON intent_records(intent_type)',
  'CREATE INDEX IF NOT EXISTS idx_intent_records_memory_need ON intent_records(memory_need)',
] as const;

export const CREATE_PHASE3_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS experience_logs (\n    id TEXT PRIMARY KEY,\n    session_id TEXT,\n    message_id TEXT,\n    created_at TEXT NOT NULL,\n    input_summary TEXT NOT NULL,\n    action_summary TEXT NOT NULL,\n    outcome_summary TEXT,\n    indicators_json TEXT NOT NULL,\n    evidence_refs_json TEXT NOT NULL\n  )`,
  `CREATE TABLE IF NOT EXISTS reflection_records (\n    id TEXT PRIMARY KEY,\n    created_at TEXT NOT NULL,\n    trigger_kind TEXT NOT NULL,\n    experience_ids_json TEXT NOT NULL,\n    analysis_json TEXT NOT NULL,\n    evidence_json TEXT NOT NULL,\n    candidate_rules_json TEXT NOT NULL,\n    state_json TEXT NOT NULL\n  )`,
  'CREATE INDEX IF NOT EXISTS idx_experience_logs_session ON experience_logs(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_experience_logs_created_at ON experience_logs(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_reflection_records_trigger_kind ON reflection_records(trigger_kind)',
  'CREATE INDEX IF NOT EXISTS idx_reflection_records_created_at ON reflection_records(created_at)',
] as const;

export const CREATE_PHASE4_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS behavior_rules (\n    id TEXT PRIMARY KEY,\n    statement TEXT NOT NULL,\n    created_at TEXT NOT NULL,\n    updated_at TEXT NOT NULL,\n    applies_to_user_id TEXT,\n    applies_to_channel TEXT,\n    intent_types_json TEXT NOT NULL,\n    contexts_json TEXT NOT NULL,\n    category TEXT NOT NULL,\n    priority INTEGER NOT NULL DEFAULT 50,\n    reflection_ids_json TEXT NOT NULL,\n    memory_ids_json TEXT NOT NULL,\n    evidence_confidence REAL NOT NULL,\n    recurrence_count INTEGER NOT NULL DEFAULT 1,\n    active INTEGER NOT NULL DEFAULT 1,\n    deprecated INTEGER NOT NULL DEFAULT 0,\n    superseded_by TEXT\n  )`,
  'CREATE INDEX IF NOT EXISTS idx_behavior_rules_user ON behavior_rules(applies_to_user_id)',
  'CREATE INDEX IF NOT EXISTS idx_behavior_rules_channel ON behavior_rules(applies_to_channel)',
  'CREATE INDEX IF NOT EXISTS idx_behavior_rules_category ON behavior_rules(category)',
  'CREATE INDEX IF NOT EXISTS idx_behavior_rules_priority ON behavior_rules(priority)',
  'CREATE INDEX IF NOT EXISTS idx_behavior_rules_active ON behavior_rules(active, deprecated)',
] as const;

export const CREATE_PHASE5_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS semantic_index (\n    memory_id TEXT PRIMARY KEY,\n    updated_at TEXT NOT NULL,\n    content_hash TEXT NOT NULL,\n    tokens_json TEXT NOT NULL,\n    weights_json TEXT NOT NULL\n  )`,
  'CREATE INDEX IF NOT EXISTS idx_semantic_index_updated_at ON semantic_index(updated_at)',
  'CREATE INDEX IF NOT EXISTS idx_semantic_index_content_hash ON semantic_index(content_hash)',
] as const;

export const CREATE_PHASE5_PROFILE_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS projected_profiles (\n    user_id TEXT PRIMARY KEY,\n    updated_at TEXT NOT NULL,\n    stable_json TEXT NOT NULL,\n    derived_json TEXT NOT NULL,\n    behavior_hints_json TEXT NOT NULL\n  )`,
  'CREATE INDEX IF NOT EXISTS idx_projected_profiles_updated_at ON projected_profiles(updated_at)',
] as const;

export const CREATE_PHASE6_BEHAVIOR_LIFECYCLE_SQL = [
  'ALTER TABLE behavior_rules ADD COLUMN level TEXT',
  'ALTER TABLE behavior_rules ADD COLUMN maturity TEXT',
  'ALTER TABLE behavior_rules ADD COLUMN apply_count INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE behavior_rules ADD COLUMN contradiction_count INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE behavior_rules ADD COLUMN last_applied_at TEXT',
  'ALTER TABLE behavior_rules ADD COLUMN last_contradicted_at TEXT',
  'ALTER TABLE behavior_rules ADD COLUMN last_reviewed_at TEXT',
  'ALTER TABLE behavior_rules ADD COLUMN stale INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE behavior_rules ADD COLUMN staleness TEXT',
  'ALTER TABLE behavior_rules ADD COLUMN decay_score REAL NOT NULL DEFAULT 0',
  'ALTER TABLE behavior_rules ADD COLUMN frozen_at TEXT',
  'ALTER TABLE behavior_rules ADD COLUMN freeze_reason TEXT',
  'ALTER TABLE behavior_rules ADD COLUMN expires_at TEXT',
  'ALTER TABLE behavior_rules ADD COLUMN frozen INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE behavior_rules ADD COLUMN status_reason TEXT',
  'ALTER TABLE behavior_rules ADD COLUMN status_source_reflection_id TEXT',
  'ALTER TABLE behavior_rules ADD COLUMN status_changed_at TEXT',
  'ALTER TABLE behavior_rules ADD COLUMN promoted_from_reflection_id TEXT',
  'ALTER TABLE behavior_rules ADD COLUMN promoted_reason TEXT',
  'ALTER TABLE behavior_rules ADD COLUMN promoted_at TEXT',
  'ALTER TABLE behavior_rules ADD COLUMN review_source_refs_json TEXT',
  'ALTER TABLE behavior_rules ADD COLUMN promotion_evidence_summary TEXT',
  'ALTER TABLE behavior_rules ADD COLUMN deactivated_by_rule_id TEXT',
  'ALTER TABLE behavior_rules ADD COLUMN deactivated_by_reflection_id TEXT',
  'ALTER TABLE behavior_rules ADD COLUMN deactivated_reason TEXT',
  'ALTER TABLE behavior_rules ADD COLUMN deactivated_at TEXT',
  'CREATE INDEX IF NOT EXISTS idx_behavior_rules_staleness ON behavior_rules(staleness)',
  'CREATE INDEX IF NOT EXISTS idx_behavior_rules_level ON behavior_rules(level)',
] as const;

export const CREATE_PHASE6_SEMANTIC_VECTOR_SQL = [
  'ALTER TABLE memory_items ADD COLUMN embedding_blob BLOB',
  'ALTER TABLE memory_items ADD COLUMN embedding_dim INTEGER DEFAULT 0',
  "ALTER TABLE memory_items ADD COLUMN embedding_model TEXT DEFAULT ''",
  `CREATE TABLE IF NOT EXISTS embedding_meta (
    memory_id TEXT PRIMARY KEY,
    model TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (memory_id) REFERENCES memory_items(id) ON DELETE CASCADE
  )`,
  'CREATE INDEX IF NOT EXISTS idx_embedding_meta_model ON embedding_meta(model)',
] as const;

export const CREATE_PHASE7_BEHAVIOR_TAGS_SQL = [
  "ALTER TABLE behavior_rules ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]'",
] as const;

export const CREATE_PHASE8_COMPOSITE_INDEXES_SQL = [
  'CREATE INDEX IF NOT EXISTS idx_memory_items_scope_active ON memory_items(scope_user_id, active, archived, updated_at)',
  'CREATE INDEX IF NOT EXISTS idx_behavior_rules_active_priority ON behavior_rules(active, deprecated, priority DESC)',
  'CREATE INDEX IF NOT EXISTS idx_debug_events_created_at ON debug_events(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_boot_briefings_user_generated ON boot_briefings(user_id, generated_at DESC)',
] as const;

export const CREATE_PHASE9_BEHAVIOR_DURATION_SQL = [
  'ALTER TABLE behavior_rules ADD COLUMN duration TEXT',
] as const;

export const CREATE_PHASE10_SOURCE_GRADE_SQL = [
  "ALTER TABLE memory_items ADD COLUMN source_grade TEXT NOT NULL DEFAULT 'primary'",
  // Backfill derived sources
  "UPDATE memory_items SET source_grade = 'derived' WHERE source_kind IN ('runtime_project', 'runtime_user', 'reflection_derived')",
  // Backfill inferred sources
  "UPDATE memory_items SET source_grade = 'inferred' WHERE source_kind IN ('summary', 'inference')",
  // Clean recursive pollution — scoped to auto-generated sources only to avoid deleting legitimate user content
  "DELETE FROM memory_items WHERE content LIKE '%Relevant memor%' AND content LIKE '%memory%' AND source_kind IN ('runtime_project', 'runtime_user', 'reflection_derived', 'summary', 'inference')",
] as const;

export const CREATE_PHASE11_SAFE_SYSTEM_CLEANUP_SQL = [
  // Clean generic outcome-only content, but only for system-derived rows.
  "DELETE FROM memory_items WHERE content IN ('run_success', 'run_failed', 'success', 'failed', 'done', 'completed', '成功', '失败', '完成') AND source_kind IN ('runtime_project', 'runtime_user', 'reflection_derived', 'summary', 'inference') AND COALESCE(source_actor, 'system') = 'system'",
  // Clean orphaned semantic_index entries
  "DELETE FROM semantic_index WHERE memory_id NOT IN (SELECT id FROM memory_items)",
  // Clean orphaned embedding_meta entries
  "DELETE FROM embedding_meta WHERE memory_id NOT IN (SELECT id FROM memory_items)",
] as const;

export const CREATE_PHASE12_KNOWLEDGE_GRAPH_SQL = [
  `CREATE TABLE IF NOT EXISTS memory_relations (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.5,
    weight REAL NOT NULL DEFAULT 1.0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    metadata_json TEXT,
    active INTEGER NOT NULL DEFAULT 1
  )`,
  'CREATE INDEX IF NOT EXISTS idx_rel_source ON memory_relations(source_id, active)',
  'CREATE INDEX IF NOT EXISTS idx_rel_target ON memory_relations(target_id, active)',
  'CREATE INDEX IF NOT EXISTS idx_rel_type ON memory_relations(relation_type, active)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_rel_pair ON memory_relations(source_id, target_id, relation_type)',
  `CREATE TABLE IF NOT EXISTS graph_stats (
    memory_id TEXT PRIMARY KEY,
    in_degree INTEGER NOT NULL DEFAULT 0,
    out_degree INTEGER NOT NULL DEFAULT 0,
    strongest_relation_type TEXT,
    strongest_relation_id TEXT,
    cluster_id TEXT,
    updated_at TEXT NOT NULL
  )`,
] as const;

export const CREATE_PHASE13_RETRIEVAL_FEEDBACK_SQL = [
  `CREATE TABLE IF NOT EXISTS retrieval_feedback (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    memory_id TEXT NOT NULL,
    query TEXT NOT NULL,
    strategy TEXT NOT NULL,
    recall_rank INTEGER NOT NULL,
    score REAL NOT NULL,
    signal TEXT NOT NULL,
    signal_source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    top_factors TEXT NOT NULL DEFAULT '[]'
  )`,
  'CREATE INDEX IF NOT EXISTS idx_feedback_session ON retrieval_feedback(session_id)',
  'CREATE INDEX IF NOT EXISTS idx_feedback_memory ON retrieval_feedback(memory_id)',
  'CREATE INDEX IF NOT EXISTS idx_feedback_signal ON retrieval_feedback(signal, created_at)',
] as const;

export const CREATE_PHASE14_MEMORY_COMPRESSION_SQL = [
  'ALTER TABLE memory_items ADD COLUMN compressed_from_json TEXT',
  'ALTER TABLE memory_items ADD COLUMN compression_level INTEGER DEFAULT 0',
] as const;

export const CREATE_PHASE15_PREFERENCE_DRIFT_SQL = [
  `CREATE TABLE IF NOT EXISTS preference_drift_log (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    preference_key TEXT NOT NULL,
    old_value TEXT NOT NULL,
    new_value TEXT NOT NULL,
    drift_type TEXT NOT NULL,
    detected_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_drift_user ON preference_drift_log(user_id, detected_at)',
] as const;

export const CREATE_PHASE16_TUNING_OVERRIDES_SQL = [
  `CREATE TABLE IF NOT EXISTS tuning_overrides (
    type_grade_key TEXT PRIMARY KEY,
    decay_multiplier REAL NOT NULL DEFAULT 1.0,
    sample_count INTEGER NOT NULL DEFAULT 0,
    last_updated TEXT NOT NULL
  )`,
] as const;

export const CREATE_PHASE17_BUTLER_STATE_SQL = [
  `CREATE TABLE IF NOT EXISTS butler_state (
    id TEXT PRIMARY KEY DEFAULT 'singleton',
    strategy_frame_json TEXT NOT NULL DEFAULT '{}',
    self_model_json TEXT NOT NULL DEFAULT '{}',
    working_memory_json TEXT NOT NULL DEFAULT '[]',
    mode TEXT NOT NULL DEFAULT 'reduced',
    last_cycle_at TEXT,
    last_cycle_version INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )`,
] as const;

export const CREATE_PHASE18_BUTLER_TASKS_SQL = [
  `CREATE TABLE IF NOT EXISTS butler_tasks (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 5,
    status TEXT NOT NULL DEFAULT 'queued',
    trigger TEXT,
    payload_json TEXT,
    budget_class TEXT NOT NULL DEFAULT 'low',
    scheduled_at TEXT,
    lease_until TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    idempotency_key TEXT UNIQUE,
    result_json TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_butler_tasks_status ON butler_tasks(status, priority)',
] as const;

export const CREATE_PHASE19_NARRATIVE_THREADS_SQL = [
  `CREATE TABLE IF NOT EXISTS narrative_threads (
    id TEXT PRIMARY KEY,
    theme TEXT NOT NULL,
    objective TEXT,
    current_phase TEXT NOT NULL DEFAULT 'exploring',
    momentum TEXT NOT NULL DEFAULT 'steady',
    recent_events_json TEXT NOT NULL DEFAULT '[]',
    blockers_json TEXT NOT NULL DEFAULT '[]',
    likely_next_turn TEXT,
    strategic_importance REAL NOT NULL DEFAULT 0.5,
    scope_json TEXT,
    started_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    closed_at TEXT
  )`,
] as const;

export const CREATE_PHASE20_BUTLER_INSIGHTS_SQL = [
  `CREATE TABLE IF NOT EXISTS butler_insights (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    scope_json TEXT,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.5,
    importance REAL NOT NULL DEFAULT 0.5,
    fresh_until TEXT,
    source_refs_json TEXT,
    model_used TEXT,
    cycle_trace_id TEXT,
    surfaced_count INTEGER NOT NULL DEFAULT 0,
    last_surfaced_at TEXT,
    created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_butler_insights_kind ON butler_insights(kind, importance DESC)',
] as const;

export const CREATE_PHASE21_LLM_INVOCATIONS_SQL = [
  `CREATE TABLE IF NOT EXISTS llm_invocations (
    id TEXT PRIMARY KEY,
    task_type TEXT NOT NULL,
    trace_id TEXT,
    provider TEXT,
    model TEXT,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    latency_ms INTEGER,
    cache_hit INTEGER NOT NULL DEFAULT 0,
    success INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`,
] as const;

export const CREATE_PHASE22_BUTLER_FEEDBACK_SQL = [
  `CREATE TABLE IF NOT EXISTS butler_feedback (
    id TEXT PRIMARY KEY,
    insight_id TEXT NOT NULL REFERENCES butler_insights(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK(action IN ('accepted','rejected','snoozed','dismissed')),
    snooze_until TEXT,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  'CREATE INDEX IF NOT EXISTS idx_butler_feedback_insight ON butler_feedback(insight_id)',
  'CREATE INDEX IF NOT EXISTS idx_butler_feedback_created ON butler_feedback(created_at)',
] as const;

export const CREATE_PHASE23_BUTLER_GOALS_SQL = [
  `CREATE TABLE IF NOT EXISTS butler_goals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active'
      CHECK(status IN ('active','paused','completed','abandoned')),
    scope_json TEXT,
    priority INTEGER NOT NULL DEFAULT 5,
    deadline TEXT,
    progress_notes TEXT,
    source_insight_ids TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS idx_butler_goals_status ON butler_goals(status)',
  'CREATE INDEX IF NOT EXISTS idx_butler_goals_priority ON butler_goals(priority)',
] as const;

export const CREATE_PHASE24_RETRIEVAL_FEEDBACK_FACTORS_SQL = [
  "ALTER TABLE retrieval_feedback ADD COLUMN top_factors TEXT NOT NULL DEFAULT '[]'",
] as const;

export const CREATE_PHASE25_BEHAVIOR_OVERRIDE_LIFECYCLE_SQL = [
  'ALTER TABLE behavior_rules ADD COLUMN override_count INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE behavior_rules ADD COLUMN last_overridden_at TEXT',
  'ALTER TABLE behavior_rules ADD COLUMN auto_suspended INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE behavior_rules ADD COLUMN auto_suspended_at TEXT',
] as const;

export const CREATE_PHASE28_BUTLER_ACTIONS_SQL = [
  `CREATE TABLE IF NOT EXISTS butler_actions (
    id TEXT PRIMARY KEY,
    cycle_id TEXT,
    action_type TEXT NOT NULL,
    params_json TEXT,
    result_json TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    rollback_json TEXT,
    budget_cost_ms INTEGER,
    created_at TEXT NOT NULL,
    completed_at TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS idx_butler_actions_cycle ON butler_actions(cycle_id)',
  'CREATE INDEX IF NOT EXISTS idx_butler_actions_status ON butler_actions(status)',
] as const;

export const CREATE_PHASE29_BUTLER_QUESTIONS_SQL = [
  `CREATE TABLE IF NOT EXISTS butler_questions (
    id TEXT PRIMARY KEY,
    gap_type TEXT NOT NULL,
    question_text TEXT NOT NULL,
    context_json TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    answer_text TEXT,
    memory_ids_json TEXT,
    asked_at TEXT,
    answered_at TEXT,
    created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_butler_questions_status ON butler_questions(status)',
  'CREATE INDEX IF NOT EXISTS idx_butler_questions_gap_type ON butler_questions(gap_type)',
] as const;

export const CREATE_PHASE29_BUTLER_SEARCHES_SQL = [
  `CREATE TABLE IF NOT EXISTS butler_searches (
    id TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    gap_id TEXT,
    results_count INTEGER NOT NULL DEFAULT 0,
    results_json TEXT,
    synthesized_json TEXT,
    created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_butler_searches_created ON butler_searches(created_at)',
] as const;

export const CREATE_PHASE30_BUTLER_EVOLUTION_SQL = [
  `CREATE TABLE IF NOT EXISTS butler_evolution_log (
    id TEXT PRIMARY KEY,
    cycle_type TEXT NOT NULL,
    parameter_key TEXT,
    old_value_json TEXT,
    new_value_json TEXT,
    evidence_json TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.5,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_butler_evolution_log_type ON butler_evolution_log(cycle_type)',
  'CREATE INDEX IF NOT EXISTS idx_butler_evolution_log_status ON butler_evolution_log(status)',
  `CREATE TABLE IF NOT EXISTS butler_prompt_variants (
    id TEXT PRIMARY KEY,
    task_type TEXT NOT NULL,
    variant_text TEXT NOT NULL,
    performance_json TEXT,
    status TEXT NOT NULL DEFAULT 'candidate',
    created_at TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_butler_prompt_variants_type ON butler_prompt_variants(task_type)',
  'CREATE INDEX IF NOT EXISTS idx_butler_prompt_variants_status ON butler_prompt_variants(status)',
  `CREATE TABLE IF NOT EXISTS butler_experiments (
    id TEXT PRIMARY KEY,
    hypothesis TEXT NOT NULL,
    parameter_key TEXT NOT NULL,
    control_value_json TEXT,
    treatment_value_json TEXT,
    sample_size INTEGER NOT NULL DEFAULT 0,
    results_json TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    started_at TEXT NOT NULL,
    concluded_at TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS idx_butler_experiments_status ON butler_experiments(status)',
] as const;
