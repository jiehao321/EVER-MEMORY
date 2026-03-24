# Task Plan: Verify evermemory compatibility with latest OpenClaw plugin registration

## Goal
Confirm whether the `evermemory` plugin still works after upgrading to the latest `openclaw`, with emphasis on the changed plugin registration mechanism, and implement/verify any minimal compatibility fix if needed.

## Current Phase
All phases complete — archived 2026-03-24

## Phases
### Phase 1: Requirements & Discovery
- [x] Understand user intent
- [x] Identify constraints and requirements
- [x] Document findings in findings.md
- **Status:** complete

### Phase 2: Compatibility Investigation
- [x] Inspect current plugin manifests and entrypoints
- [x] Identify latest OpenClaw registration expectations
- [x] Reproduce or statically validate compatibility gap
- **Status:** complete

### Phase 3: Fix Implementation
- [x] Add minimal compatibility changes if required
- [x] Preserve existing packaging/registration behavior where possible
- [x] Keep changes scoped to registration path
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Run targeted tests/builds
- [x] Verify plugin registration contract against latest OpenClaw expectations
- [x] Document results in progress.md
- **Status:** complete

### Phase 5: Delivery
- [x] Summarize outcome, evidence, and residual risks
- [x] Point to key files and verification results
- [x] Deliver conclusion to user
- **Status:** complete

## Key Questions
1. What registration contract does the latest OpenClaw expect from plugins?
2. Does `evermemory` already expose the required entry/metadata shape?
3. If not, what is the smallest compatible change and how can it be verified?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use file-based planning for this task | Multi-step compatibility investigation with likely 5+ tool calls and possible code changes |
| Investigate root cause before patching | Registration changes can fail at metadata, packaging, or runtime entry boundaries |
| Fix package distribution instead of registration code | Latest OpenClaw already accepted the registration contract; failure came from missing native runtime artifacts in installed plugin dependencies |
| Bundle `sharp` directly instead of bundling all of `@xenova/transformers` | Bundling the full transformers tree exceeded OpenClaw archive extraction limits; only `sharp` native binding was actually missing in isolated installs |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Fresh OpenClaw install failed with `StorageError: Failed to open database.` | 1 | Traced wrapped cause to missing `better-sqlite3` native binding in installed plugin package |
| Bundling all of `@xenova/transformers` made the plugin archive exceed OpenClaw extraction limits | 1 | Narrowed bundling scope to `sharp`, which is the missing native runtime dependency for local embeddings |

## Notes
- Focus first on plugin registration compatibility, not unrelated runtime behavior.
- Local embedding startup is now fixed in isolated installs by bundling `sharp`; no embedding fallback warning reproduced in final verification.
- Prefer repository evidence and official/latest OpenClaw source over assumptions.
