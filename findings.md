# Findings

- `preference_drift_log` columns from schema v17 are: `id`, `user_id`, `preference_key`, `old_value`, `new_value`, `drift_type`, `detected_at`.
- `tuning_overrides` columns from schema v18 are: `type_grade_key`, `decay_multiplier`, `sample_count`, `last_updated`.
- `DriftDetectionService` currently appends drifts only to an in-memory array and logs debug events; constructor currently takes only `debugRepo`.
- `SelfTuningDecayService` currently writes overrides only to an in-memory `Map`; constructor currently takes `feedbackRepo` and optional `debugRepo`.
- `evermemoryBrowse()` hardcodes `activeOnly: true` and `archived: false`, so archived rows can never be returned.
- The OpenClaw browse tool registration currently exposes `type`, `lifecycle`, `limit`, `sortBy`, `sinceMinutesAgo`, `source`, and `scope`, but not an archive toggle.
