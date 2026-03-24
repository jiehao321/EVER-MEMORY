# Findings & Decisions

## Requirements
- Check whether `evermemory` still works after upgrading to the latest `openclaw`.
- Focus on the fact that OpenClaw changed the plugin registration mechanism for all plugins.
- Determine whether the plugin is still compatible; if not, identify or implement the minimal fix.

## Research Findings
- `package.json` already declares an `openclaw.extensions` field pointing to `./dist/openclaw/plugin.js`.
- Repository contains both `plugin.json` and `openclaw.plugin.json`, plus `src/openclaw/plugin.ts` and a dedicated compatibility-style test `test/openclaw-plugin.test.ts`.
- Latest OpenClaw docs state that every native plugin must ship `openclaw.plugin.json` in the plugin root.
- Latest OpenClaw docs state that npm-distributed plugins must declare `package.json > openclaw.extensions` with one or more entry files; old packages without this field fail installation.
- Latest OpenClaw docs state plugin runtime may export either a function or an object exposing `register(api)`.
- `openclaw --version` on this machine is `2026.3.22`, matching npm `latest` dist-tag `2026.3.22`.
- With the pre-fix package, `openclaw plugins install` succeeded but `openclaw plugins list/inspect` showed `evermemory` failing during `register` with `StorageError: Failed to open database.`
- The wrapped storage error was misleading: direct import/register traced the root cause to missing `better-sqlite3` native binding (`better_sqlite3.node`) inside the installed plugin directory.
- Local development install contains `node_modules/better-sqlite3/build/Release/better_sqlite3.node`, but the OpenClaw-installed plugin copy did not.
- Adding `bundleDependencies: ["better-sqlite3"]` to the root `package.json` makes `npm pack` include the native binding in the plugin tarball and unblocks OpenClaw registration.
- After the fix, isolated `openclaw plugins inspect evermemory --json` shows plugin `status: "loaded"` from the installed extension path.
- A separate residual warning remains in isolated install: local embedding startup falls back to `NoOp` because the `sharp` native binding used by the transformers stack is missing. This is degraded behavior, not a registration failure.
- Local development install contains `node_modules/sharp/build/Release/sharp-linux-x64.node`, but the OpenClaw-installed plugin copy originally did not.
- `onnxruntime-node` native bindings were already present in the isolated install; the missing runtime artifact was specifically `sharp-linux-x64.node`.
- Bundling all of `@xenova/transformers` made the plugin tarball too large for OpenClaw to extract (`archive entry extracted size exceeds limit`), so that approach is not viable.
- Promoting `sharp` to a direct dependency and bundling only `sharp` keeps the tarball within OpenClaw's extraction limits and restores local embedding startup.
- After the final fix, isolated install contains `/node_modules/sharp/build/Release/sharp-linux-x64.node`, and `openclaw plugins inspect evermemory --json` loads cleanly without the prior local-embedding fallback warning.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Start from manifests, entrypoint, and tests | Registration changes usually break at discovery/manifest boundaries before deeper runtime logic |
| Treat `plugin.json` as legacy/secondary for this investigation | Latest OpenClaw native plugin contract is centered on `openclaw.plugin.json` + `package.json openclaw.extensions` |
| Add release-level regression coverage around `npm pack` contents | The failure only appeared in packaged installation, not in local source execution or unit tests |
| Patch packaging metadata instead of loader logic | OpenClaw already recognized and installed the plugin correctly; missing bundled native artifacts caused runtime failure |
| Bundle `sharp` directly rather than the full transformers dependency tree | This fixes the missing native binding while keeping the plugin archive below OpenClaw extraction limits |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Misleading `StorageError: Failed to open database.` during installed plugin registration | Reproduced in isolated `OPENCLAW_HOME`, then imported built plugin directly to expose underlying missing `better-sqlite3` binding |
| Bundling full `@xenova/transformers` exceeded OpenClaw archive extraction size limits | Replaced that approach with direct `sharp` dependency + bundling only `sharp` |
| Installed plugin warned about local embedding dependency chain (`sharp`) | Fixed by bundling `sharp`, then verifying isolated install includes `sharp-linux-x64.node` and no fallback warning is emitted |

## Resources
- `/root/evermemory/package.json`
- `/root/evermemory/openclaw.plugin.json`
- `/root/evermemory/plugin.json`
- `/root/evermemory/src/openclaw/plugin.ts`
- `/root/evermemory/test/openclaw-plugin.test.ts`
- https://docs.openclaw.ai/tools/plugin
- https://docs.openclaw.ai/plugins/manifest
- https://docs.openclaw.ai/help/troubleshooting
- `/root/evermemory/test/release/native-bundle.test.ts`
- `/root/evermemory/test/release/embedding-native-bundle.test.ts`

## Visual/Browser Findings
- No browser findings yet.
