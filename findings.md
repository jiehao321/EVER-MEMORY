# Findings & Decisions

## Requirements
- Update `docs/API.md` counts from `21 SDK tool functions` to `19 SDK tool functions`.
- Update `docs/API.md` counts from `20 tools` to `18 tools`.
- Update `docs/API.md` text `OpenClaw currently registers 20 tools` to `OpenClaw currently registers 18 tools`.
- Update `README.md` text `20 tools through the OpenClaw tool interface, plus 1 SDK-only` to `18 tools through the OpenClaw tool interface, plus 1 SDK-only`.
- Update `docs/ARCHITECTURE.md` text `(21 SDK / 20 OC)` to `(19 SDK / 18 OC)`.
- Update `docs/ARCHITECTURE.md` text `21 SDK tool implementations; 20 are currently registered` to `19 SDK tool implementations; 18 are currently registered`.
- Update `CLAUDE.md` text `21 tool implementations` to `19 tool implementations`.
- Update `CLAUDE.md` text `21 tools (18 original` to `19 tools (16 original`.

## Research Findings
- `src/tools/index.ts` currently contains 19 named exports.
- The user states 18 of those are registered in OpenClaw, with `evermemorySmartness` being SDK-only.
- `rg` confirmed one matching stale string in each of the four requested docs files.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Verify stale strings with `rg` before editing | Prevents missing a requested replacement |
| Verify `src/tools/index.ts` export count before editing docs | Confirms the requested corrected totals |

## Issues Encountered
| Issue | Resolution |
|-------|------------|

## Resources
- `/root/evermemory/src/tools/index.ts`
- `/root/evermemory/docs/API.md`
- `/root/evermemory/README.md`
- `/root/evermemory/docs/ARCHITECTURE.md`
- `/root/evermemory/CLAUDE.md`

## Visual/Browser Findings
- None.
