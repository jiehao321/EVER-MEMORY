# Progress

- Re-read and reset the planning files for the current three-bug persistence/archive task.
- Confirmed the target schema columns in `src/storage/migrations.ts`.
- Identified existing test homes: `test/core/profile/driftDetection.test.ts`, `test/core/memory/selfTuningDecay.test.ts`, `test/tools.test.ts`, and `test/openclaw-plugin.test.ts`.
- Added regression coverage first, captured the expected red build from the missing constructor/input changes, then implemented the requested source fixes.
- Verified with `npm run build:test && node --test dist-test/test/core/profile/driftDetection.test.js dist-test/test/core/memory/selfTuningDecay.test.js dist-test/test/tools.test.js dist-test/test/openclaw-plugin.test.js` (4/4 passed).
