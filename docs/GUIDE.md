# EverMemory User Guide

EverMemory is a deterministic memory plugin for [OpenClaw](https://github.com/openclaw). It provides structured knowledge storage, recall, rule governance, and user profiling as reliable, explainable, and rollback-safe workflows.

- **Version**: 1.0.3
- **Runtime**: Node.js 22+
- **Language**: TypeScript (strict ESM)
- **Storage**: SQLite with WAL mode (via better-sqlite3)

---

## Getting Started

### SDK Usage

```typescript
import { initializeEverMemory } from "evermemory";

const em = initializeEverMemory({
  databasePath: "./memory.db",
  semantic: { enabled: true },
});
```

The `initializeEverMemory` call provisions the SQLite database (creating it if necessary), runs idempotent migrations, and returns a configured EverMemory instance ready for use.

When `semantic.enabled` is `true`, the built-in embedding provider (`@xenova/transformers`) is activated automatically. No additional installation or API keys are required.

### OpenClaw Plugin

```bash
openclaw plugins install evermemory@1.0.3
openclaw plugins enable evermemory
openclaw config set plugins.slots.memory evermemory
openclaw gateway restart
```

After restarting the gateway, EverMemory registers its lifecycle hooks (`sessionStart`, `sessionEnd`) and exposes its tool commands to the agent runtime.

---

## Core Concepts

### Memory Types

Every stored memory carries a `type` field drawn from a fixed vocabulary:

| Type | Purpose |
|------|---------|
| `identity` | Who the user is -- name, role, background |
| `fact` | Verified objective information |
| `preference` | User likes, dislikes, and stylistic choices |
| `decision` | Choices made and their rationale |
| `commitment` | Promises or agreements the agent has made |
| `relationship` | Connections between people, projects, or concepts |
| `task` | Action items and their status |
| `project` | Ongoing projects and their context |
| `style` | Communication and formatting preferences |
| `summary` | Condensed overviews of longer interactions |
| `constraint` | Hard rules or boundaries the user has set |

Choosing the correct type ensures that recall queries and briefings surface the right memories at the right time.

### Memory Lifecycle

Memories progress through four stages:

1. **working** -- Short-lived, session-scoped memories. Created during active conversation and not yet validated for long-term retention.
2. **episodic** -- Memories that have been confirmed as worth keeping. They retain full contextual detail (session, timestamp, surrounding conversation).
3. **semantic** -- Distilled knowledge. Episodic memories that have been consolidated, merged, or generalized lose their session-specific context and become reusable facts.
4. **archive** -- Memories that are no longer actively surfaced but are preserved for audit, rollback, or historical reference. Archived memories can be restored.

Consolidation operations (`evermemory_consolidate`) drive memories forward through these stages. The `evermemory_restore` command can move archived memories back into active circulation.

### Memory Scope

Each memory is scoped to control its visibility:

- **userId** -- Visible only within a specific user's sessions.
- **chatId** -- Visible only within a specific conversation thread.
- **project** -- Shared across all sessions within a named project.
- **global** -- Available everywhere, regardless of user or project context.

### Source Tracking

Every memory records its provenance:

- **kind** -- How the memory was created (e.g., `user_stated`, `agent_inferred`, `imported`).
- **actor** -- Who created it (user ID or agent ID).
- **sessionId** -- The session in which the memory was created.
- **messageId** -- The specific message that triggered creation.
- **channel** -- The communication channel (e.g., `chat`, `api`, `import`).

Source tracking powers the audit trail exposed by `evermemory_explain`.

---

## Storing and Recalling Memories

### Storing Memories

Use `evermemory_store` to write a memory:

```typescript
await em.tools.store({
  content: "User prefers dark mode in all code editors",
  type: "preference",
  lifecycle: "episodic",
  scope: { userId: "user-123" },
  tags: ["ui", "editor", "dark-mode"],
});
```

The store command validates input against the schema, assigns a unique ID, computes an embedding (when semantic search is enabled), and persists the memory atomically.

### Recalling Memories

Use `evermemory_recall` to retrieve memories. Three retrieval modes are available:

**Structured mode** -- Filters by type, scope, lifecycle, and tags:

```typescript
const results = await em.tools.recall({
  mode: "structured",
  filter: {
    type: "preference",
    scope: { userId: "user-123" },
    tags: ["editor"],
  },
  limit: 10,
});
```

**Keyword mode** -- Full-text search across memory content:

```typescript
const results = await em.tools.recall({
  mode: "keyword",
  query: "dark mode editor",
  limit: 10,
});
```

**Hybrid mode** -- Combines keyword matching with semantic similarity for the best of both approaches:

```typescript
const results = await em.tools.recall({
  mode: "hybrid",
  query: "user's preferred color scheme for development tools",
  filter: { type: "preference" },
  limit: 10,
});
```

### Semantic Search

Semantic search is powered by `@xenova/transformers`, which is bundled as a direct dependency. No external API calls or keys are needed. When enabled, embeddings are computed at store time and used during `keyword` and `hybrid` recall to surface semantically related memories even when exact keywords do not match.

---

## Session Briefing and Continuity

### Generating Briefings

`evermemory_briefing` generates a startup context document for the agent at the beginning of each session. The briefing assembles relevant memories and profile data into structured sections:

- **identity** -- Who the user is, based on stored identity memories and the canonical profile.
- **constraints** -- Hard rules and boundaries the user has established.
- **recentContinuity** -- What happened in recent sessions, so the agent can resume naturally.
- **activeProjects** -- Ongoing projects and their current status.

```typescript
const briefing = await em.tools.briefing({
  tokenTarget: 2000,
});
```

The `tokenTarget` parameter controls how much context the briefing should aim for, allowing you to balance richness against token budget.

### Cross-Session Continuity

Briefings pull from stored memories and profiles, ensuring that the agent retains context across sessions without requiring the user to repeat themselves. When the `sessionStart` lifecycle hook fires, EverMemory automatically generates a briefing and injects it into the agent's context.

### Hook Integration

EverMemory registers two lifecycle hooks with OpenClaw:

- **sessionStart** -- Generates a briefing and injects it as system context.
- **sessionEnd** -- Captures experience logs and triggers reflection (see below).

---

## Intent Analysis and Reflection

### Intent Analysis

`evermemory_intent` analyzes incoming messages to determine:

- **Intent type** -- What the user is trying to accomplish.
- **Urgency** -- How time-sensitive the request is.
- **Emotional tone** -- The user's apparent emotional state.
- **Action need** -- Whether the message requires the agent to take action.
- **Memory need** -- Whether the message contains information worth storing.

```typescript
const analysis = await em.tools.intent({
  message: "Please remember that I never want to use tabs for indentation",
});
// analysis.memoryNeed -> true
// analysis.intentType -> "preference_statement"
```

### Reflection

`evermemory_reflect` processes experience logs from completed sessions to generate reflections and candidate rules:

```typescript
const reflection = await em.tools.reflect({
  sessionId: "session-456",
});
```

Reflections summarize what went well, what could be improved, and propose candidate rules for future behavior. These candidate rules feed into the governance system described below.

### Active Learning

On `sessionEnd`, EverMemory automatically captures experience data and runs reflection. This creates a feedback loop: interactions produce experiences, experiences produce reflections, and reflections produce rules that improve future interactions.

---

## Behavior Rules and Governance

### How Rules Work

Rules are behavioral directives extracted from reflections and user statements. They govern how the agent behaves in future sessions. Examples:

- "Always use TypeScript strict mode in code examples"
- "Never suggest refactoring unless the user asks"

### Rule Lifecycle

Rules progress through a defined lifecycle:

1. **candidate** -- Newly proposed rules, awaiting evidence.
2. **active** -- Rules that have accumulated sufficient evidence and confidence.
3. **frozen** -- Rules that are locked and cannot be modified (typically by operator decision).
4. **deprecated** -- Rules that have been retired but are preserved for audit.

### Auto-Promotion

A candidate rule is automatically promoted to `active` when:
- Its confidence score reaches **0.85 or higher**, and
- It has been supported by **2 or more** independent pieces of evidence.

### Managing Rules

Use `evermemory_rules` to manage the rule lifecycle:

```typescript
// List all active rules
await em.tools.rules({ action: "list", filter: { status: "active" } });

// Freeze a rule to prevent modification
await em.tools.rules({ action: "freeze", ruleId: "rule-789" });

// Deprecate a rule
await em.tools.rules({ action: "deprecate", ruleId: "rule-789" });

// Rollback a rule to its previous state
await em.tools.rules({ action: "rollback", ruleId: "rule-789" });
```

---

## User Profiles

### First-Run Onboarding

`profile_onboard` runs a questionnaire to collect baseline user information:

```typescript
await em.tools.profileOnboard({
  displayName: "Alice",
  language: "en",
  timezone: "America/New_York",
});
```

This establishes the canonical profile fields used by briefings and personalization.

### Reading and Recomputing Profiles

`evermemory_profile` reads the current profile or triggers a recomputation from stored memories:

```typescript
// Read current profile
const profile = await em.tools.profile({ action: "read" });

// Recompute derived fields from stored memories
const updated = await em.tools.profile({ action: "recompute" });
```

### Two-Layer Design

Profiles use a two-layer architecture:

- **Canonical fields** -- Stable, user-confirmed data (display name, language, timezone). These are authoritative and only change when the user explicitly updates them.
- **Derived fields** -- Inferred from stored memories and marked as `weak_hint_only`. These include preferences, communication style, and behavioral patterns. They inform agent behavior but are never treated as ground truth.

The guardrail ensures that derived fields cannot override explicit user statements or canonical profile data.

---

## Memory Maintenance

### Consolidation

`evermemory_consolidate` performs housekeeping on the memory store. Three modes are available:

- **light** -- Quick pass: merges near-duplicates and reinforces high-frequency memories.
- **daily** -- Standard maintenance: includes light operations plus archival of stale working memories.
- **deep** -- Full consolidation: includes daily operations plus semantic deduplication and lifecycle promotion.

```typescript
await em.tools.consolidate({ mode: "daily" });
```

### Reviewing Archived Memories

`evermemory_review` lets you inspect archived memories and check rule provenance:

```typescript
const archived = await em.tools.review({
  filter: { lifecycle: "archive" },
  limit: 20,
});
```

### Restoring Memories

`evermemory_restore` uses a two-phase process for safety:

```typescript
// Phase 1: Review what would be restored
const preview = await em.tools.restore({
  mode: "review",
  memoryIds: ["mem-001", "mem-002"],
});

// Phase 2: Apply the restoration after reviewing
await em.tools.restore({
  mode: "apply",
  memoryIds: ["mem-001", "mem-002"],
});
```

### Automatic Housekeeping

During consolidation, EverMemory automatically:

- Merges near-duplicate memories (same content, similar embeddings).
- Archives stale working memories that have not been accessed recently.
- Reinforces high-frequency memories by boosting their retrieval weight.

---

## Import and Export

### Exporting Memories

`evermemory_export` generates a snapshot in the `evermemory.snapshot.v1` format:

```typescript
const snapshot = await em.tools.export({ format: "json" });
```

The OpenClaw integration layer supports three output formats:

- **json** -- Machine-readable, suitable for programmatic import.
- **markdown** -- Human-readable, suitable for review and documentation.
- **snapshot** -- Full binary snapshot including embeddings and metadata.

### Importing Memories

`evermemory_import` follows the same two-phase governance pattern as restore:

```typescript
// Phase 1: Review the import
const preview = await em.tools.import({
  mode: "review",
  source: "./backup.json",
  format: "json",
});

// Phase 2: Apply after reviewing
await em.tools.import({
  mode: "apply",
  source: "./backup.json",
  format: "json",
});
```

Supported import formats: `snapshot`, `json`, `markdown`.

### Use Cases

- **Migration** -- Move memories between environments (dev, staging, production).
- **Backup** -- Create periodic snapshots for disaster recovery.
- **Cross-environment transfer** -- Share memory sets across different OpenClaw instances.

---

## Operations

### Troubleshooting

**Database location**: The default database path is:

```
.openclaw/memory/evermemory/store/evermemory.db
```

**Diagnostic commands**:

| Command | Purpose |
|---------|---------|
| `npm run doctor` | Diagnoses database integrity, migration state, embeddings health, and rules consistency |
| `npm run validate` | Full validation: runs doctor, type checking, and the complete test suite |
| `evermemory_status` | Runtime state inspection -- reports database size, memory counts, rule counts, and embedding provider status |
| `evermemory_explain` | Audit trail for any operation: write, retrieval, rule change, session event, archive action, or intent analysis |

### Rollback

**Rule rollback** -- Revert a rule to its previous state:

```typescript
await em.tools.rules({ action: "rollback", ruleId: "rule-789" });
```

**Memory restore** -- Bring archived memories back into active circulation using the two-phase `evermemory_restore` process described above.

**Database backup** -- Before performing destructive operations, copy the database file:

```bash
cp .openclaw/memory/evermemory/store/evermemory.db ./evermemory-backup.db
```

### Test Data Cleanup

To purge test data from a development environment:

```bash
# Dry run first -- see what would be removed
npm run openclaw:cleanup:test-data:dry

# Purge test data
npm run openclaw:cleanup:test-data
```

---

## FAQ

**Q: What does semantic search require?**
A: Nothing beyond EverMemory itself. `@xenova/transformers` is bundled as a direct dependency. Semantic search works out of the box with no external APIs or additional installation steps.

**Q: Where is data stored?**
A: By default, data is stored in `.openclaw/memory/evermemory/store/evermemory.db`, a SQLite database running in WAL mode.

**Q: How do I export and import memories?**
A: Use `evermemory_export` to create snapshots in json, markdown, or snapshot format. Use `evermemory_import` with `mode: "review"` first to preview changes, then `mode: "apply"` to commit them.

**Q: What is the difference between `profile_onboard` and `evermemory_profile`?**
A: `profile_onboard` handles first-run data collection, establishing canonical profile fields through a guided questionnaire. `evermemory_profile` reads or recomputes the current profile from stored memories at any time after onboarding.

**Q: Why do import and restore have separate review and apply steps?**
A: This is a governance design choice. The review phase lets you preview exactly what will change -- including any rejections -- before committing. It prevents accidental overwrites and supports auditability.

**Q: How do I check system health?**
A: Run `npm run doctor` from the command line for a comprehensive diagnostic, or call `evermemory_status` at runtime for live state inspection.

**Q: Can I use EverMemory without OpenClaw?**
A: Yes. The SDK can be imported directly into any Node.js 22+ application via `initializeEverMemory`. The OpenClaw integration is an optional plugin layer.

**Q: How are near-duplicate memories handled?**
A: During consolidation, EverMemory detects near-duplicates using content comparison and embedding similarity, then merges them into a single memory with combined metadata.

**Q: What happens if the embedding provider fails?**
A: EverMemory uses a fallback strategy. If the local embedding provider encounters an error, semantic search degrades gracefully to keyword-only retrieval. The `evermemory_status` command reports the current provider state.
