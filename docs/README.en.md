# EverMemory Docs README (English)

This folder is the unified documentation entrypoint for release `0.0.1` and post-release operations.

## Read These First (Release-Critical)

1. `evermemory-docs-index.md` - full document index and tiers
2. `evermemory-branch-and-release-governance.md` - branch/worktree discipline
3. `evermemory-release-quality-checklist.md` - release quality gates
4. `evermemory-release-0.0.1.md` - release record
5. `evermemory-operator-runbook.md` - operator SOP
6. `evermemory-troubleshooting.md` - troubleshooting guide

## Documentation Tiers

- `L0 Release-Critical`: must stay in sync with code
- `L1 Operations`: runbook, troubleshooting, install, acceptance
- `L2 Design/Planning`: architecture, roadmap, technical plans
- `L3 Historical Evidence`: dated reports, audits, execution logs

See `evermemory-docs-index.md` for exact file mapping.

## Update Rules

1. Release-flow changes must update `L0`.
2. Command/runtime changes must update runbook and troubleshooting docs.
3. Date-stamped reports (`*-YYYY-MM-DD.md`) belong to `L3` and must not replace `L0/L1` docs.

## Minimal Doc Set for Execution Agents

- `evermemory-docs-index.md`
- `evermemory-branch-and-release-governance.md`
- `evermemory-release-quality-checklist.md`
- `evermemory-operator-runbook.md`
- `evermemory-troubleshooting.md`
