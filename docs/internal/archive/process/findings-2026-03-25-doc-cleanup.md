# Findings & Decisions

## Requirements
- Update repository-facing documentation to match the current codebase reality.
- Clean up GitHub-visible repo structure and ignore rules.
- Reduce overlap between public docs, internal docs, and process artifacts without over-pruning.

## Research Findings
- Root-level docs and artifacts are currently mixed together: `README*`, `SECURITY.md`, `PHASE1_COMPLETION_SUMMARY.md`, `task_plan.md`, `findings.md`, `progress.md`, plus runtime/build files.
- `.gitignore` ignores `dist` and `dist-test` but does not ignore `dist-target-*` or planning/process artifacts that are committed into the repo root.
- `.npmignore` excludes `docs/`, `src/`, `test/`, and `scripts/`, while `package.json > files` explicitly re-includes `scripts/setup.mjs`; package publishing is governed mostly by `files`.
- `src/tools/index.ts` currently exports 23 SDK functions:
  - 19 EverMemory SDK functions
  - 4 Butler SDK functions
- OpenClaw tool registration is split across:
  - `src/openclaw/tools/memory.ts`
  - `src/openclaw/tools/briefing.ts`
  - `src/openclaw/tools/profile.ts`
  - `src/openclaw/tools/io.ts`
  - `src/openclaw/tools/butler.ts`
  - `src/openclaw/tools/butlerReview.ts`
- Public docs are inconsistent with current code:
  - README claims stale test numbers and outdated scope statements
  - API docs still mention outdated aliases and old counts
  - CONTRIBUTING points to the wrong repository URL
  - internal index claims internal docs are gitignored, which is false because they are tracked
- Current verification status from live commands:
  - `npm run check` passes
  - `npm test` currently fails
  - `npm pack --dry-run` succeeds
- Current package metadata:
  - version `2.1.0`
  - Node `>=22`
  - `openclaw` peer dependency `>=2026.3.22 <2027`

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Add a dedicated `docs/INDEX.md` | A single documentation directory entrypoint reduces README bloat and clarifies public navigation |
| Rewrite core docs rather than incremental patching | Current mismatches are broad and cross-document |
| Preserve `docs/internal/` but create a clear archive boundary | Some internal docs are still useful, but many are historical |
| Move root-level process artifacts out of the root surface | These are session/process records, not product docs |
| Document current limitations honestly | The repo currently does not justify strong packaging/test claims |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Existing planning files described a previous packaging investigation | Replaced planning context and treated old task files as archive candidates |
| Live repo state conflicts with several docs and progress records | Use code and command output as source of truth for rewritten docs |

## Resources
- `/root/evermemory/package.json`
- `/root/evermemory/.gitignore`
- `/root/evermemory/.npmignore`
- `/root/evermemory/README.md`
- `/root/evermemory/README.zh-CN.md`
- `/root/evermemory/docs/API.md`
- `/root/evermemory/docs/GUIDE.md`
- `/root/evermemory/docs/ARCHITECTURE.md`
- `/root/evermemory/docs/CONTRIBUTING.md`
- `/root/evermemory/docs/CHANGELOG.md`
- `/root/evermemory/docs/internal/INDEX.md`
- `/root/evermemory/src/tools/index.ts`
- `/root/evermemory/src/openclaw/plugin.ts`

## Visual/Browser Findings
- No browser findings.
