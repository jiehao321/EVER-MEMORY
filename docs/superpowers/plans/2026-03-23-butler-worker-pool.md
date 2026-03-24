# Butler Worker Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a worker_threads-backed Butler background task pool, wire it into Butler config/plugin/agent, and verify the existing project still builds and tests cleanly.

**Architecture:** Introduce a focused `WorkerThreadPool` abstraction under Butler worker infrastructure and a thin worker runner entrypoint. Keep ButlerAgent responsible only for dispatch policy while plugin bootstrap owns pool creation and shutdown, and config owns parsed worker settings.

**Tech Stack:** TypeScript strict ESM, Node.js `worker_threads`, Node test runner, better-sqlite3-backed Butler services.

---

### Task 1: Add failing tests for worker pool behavior

**Files:**
- Create: `test/butler/phase3Worker.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests for:
- lazy worker creation
- dispatch success
- dispatch timeout
- queue full rejection
- terminate rejection of pending work
- drain behavior

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/butler/phase3Worker.test.ts`
Expected: FAIL because worker pool files do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create worker pool files and enough behavior for the first failing assertions.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/butler/phase3Worker.test.ts`
Expected: PASS for the new pool tests.

### Task 2: Add failing tests for ButlerAgent deferred-task dispatch

**Files:**
- Modify: `test/butler/phase3Worker.test.ts`
- Reference: `src/core/butler/agent.ts`

- [ ] **Step 1: Write the failing test**

Add tests that call `runDeferredTask` through bracket access and assert:
- `narrative_update` dispatches to worker pool when present
- `narrative_update` does nothing harmful when no pool is configured

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/butler/phase3Worker.test.ts`
Expected: FAIL because ButlerAgent does not yet accept `workerPool`.

- [ ] **Step 3: Write minimal implementation**

Update `ButlerAgentOptions`, constructor fields, and deferred-task branching.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/butler/phase3Worker.test.ts`
Expected: PASS for agent dispatch/fallback tests.

### Task 3: Wire config and plugin support

**Files:**
- Modify: `src/config.ts`
- Modify: `src/openclaw/plugin.ts`
- Inspect as needed: `src/types/index.js` exports and config type definitions

- [ ] **Step 1: Write or extend failing tests**

Add assertions only if existing config/plugin coverage needs explicit worker checks.

- [ ] **Step 2: Run targeted tests to verify failure**

Run: `node --test test/config.test.ts test/openclaw-plugin.test.ts`
Expected: FAIL if types or runtime config shape are incomplete.

- [ ] **Step 3: Write minimal implementation**

Add Butler workers config parsing and synchronous pool creation/shutdown in plugin bootstrap.

- [ ] **Step 4: Run targeted tests to verify pass**

Run: `node --test test/config.test.ts test/openclaw-plugin.test.ts`
Expected: PASS.

### Task 4: Full verification

**Files:**
- Modify as needed based on failures from previous tasks

- [ ] **Step 1: Run build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: PASS.
