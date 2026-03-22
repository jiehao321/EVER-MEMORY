# Task Plan

## Goal
Fix 3 medium-priority bugs with minimal, targeted changes only.

## Phases
| Phase | Status | Notes |
|---|---|---|
| Inspect implementation, schema, and existing tests | completed | Verified `preference_drift_log` and `tuning_overrides` schema columns plus current browse filters. |
| Add failing regression coverage | completed | Added drift persistence, tuning persistence, browse archive, and OpenClaw browse registration regressions. |
| Implement minimal fixes | completed | Added SQLite load/persist logic to the two services, archive toggle to browse, and `db` wiring in `src/index.ts`. |
| Verify targeted tests | completed | `npm run build:test && node --test dist-test/test/core/profile/driftDetection.test.js dist-test/test/core/memory/selfTuningDecay.test.js dist-test/test/tools.test.js dist-test/test/openclaw-plugin.test.js` passed. |

## Decisions
- Reuse the current in-memory DB helpers because migrations already create both persistence tables.
- Keep persistence logic inside the affected services instead of introducing new repositories.
- Preserve existing default browse behavior; only relax archive filtering when `includeArchived` is explicitly true.

## Errors Encountered
| Error | Attempt | Resolution |
|---|---|---|
