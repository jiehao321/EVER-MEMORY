# Findings

- Config contract drift is real: `enabled`, `debugEnabled`, and `bootTokenBudget` are parsed and documented, but the runtime does not apply them. `maxRecall` and semantic config are wired; these three are not.
- Embedding warmup/init logging has an async teardown race. `initializeEverMemory()` starts warmup in a fire-and-forget task; tests that close the DB then emit repeated `TypeError: The database connection is not open` warnings from `logEmbeddingInitStatus()`.
- Relation removal reports success even when nothing was removed. `evermemoryRelations(... action='remove')` returns `{ removed: true, total: 1 }` unconditionally after `relationRepo.deactivate(...)`, and the repository method itself does not report affected rows.
- `scripts/stability-check.mjs` only discovers top-level files under `dist-test/test`, so nested suites in folders like `embedding/`, `retrieval/`, `storage/`, `tools/`, `core/`, and `openclaw/` are excluded from its “unit test pass rate”.
- `node --test 'dist-test/test/**/*.test.js' 'dist-test/test/*.test.js'` is broadly passing in direct execution, but it repeatedly prints the closed-DB embedding warnings, so the test signal is noisy and teardown is not clean.
