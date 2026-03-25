# README Homepage Repositioning Design

## Goal

Rewrite the public README experience so GitHub visitors immediately understand EverMemory as an OpenClaw memory plugin that helps agents remember what matters, surface it at the right time, and stay grounded across sessions.

The README should feel like a product homepage first, with docs navigation and operational caveats still present but clearly secondary.

## Target Audience

Primary audience:

- OpenClaw users evaluating a memory plugin for real agent workflows
- Operators who want to know what the plugin does before they care how it is implemented

Secondary audience:

- Developers who may later read deeper docs, API reference, or architecture notes

## Messaging Direction

The homepage should answer three questions in the first screen:

1. What is EverMemory?
2. Why is it useful in practice?
3. Why does it feel different from a naive "chat history memory" layer?

The tone should be concrete and vivid, not fluffy. It should speak in terms of the user's agent:

- remembering preferences
- keeping constraints alive
- bringing back relevant facts at the right moment
- reducing repeated prompting

The copy should stay honest about current repo reality:

- current docs are maintained
- packaging coverage is not fully green in the current snapshot
- optional subsystems remain optional

## Recommended README Structure

### 1. Hero

A short, strong opening:

- title
- one-line positioning statement
- one short paragraph that explains the core feeling of using the plugin

Example direction:

EverMemory gives OpenClaw a long-term memory that is selective, governed, and useful at the moment it matters.

### 2. Why It Feels Different

A short section with 4-5 bullets, written from the user perspective rather than the internal module perspective.

Example themes:

- remembers facts, preferences, constraints, and recurring patterns
- stores memory locally in SQLite instead of depending on ephemeral chat state
- retrieves by structured rules and optional semantic recall
- builds briefings and profiles instead of dumping raw memory lists
- can add an optional Butler layer for strategic overlays

### 3. A Concrete Example

One short scenario that makes the plugin feel real.

Example pattern:

- user says they prefer concise code reviews
- they work in a specific timezone
- they do not want repeated onboarding questions
- later sessions can recover those facts and feed them back into the agent context

This section should make the plugin's behavior legible without requiring architecture knowledge.

### 4. Quick Start

OpenClaw installation should come first.

Then:

- plugin enablement
- slot configuration
- restart

SDK install can remain below as a secondary path.

### 5. What You Get

Summarize the major product capabilities in user-facing language:

- memory store and recall
- session briefings
- profile projection
- rule governance
- import/export
- optional semantic recall
- optional Butler overlay

### 6. How It Works

A small 4-step lifecycle:

1. capture
2. store
3. retrieve
4. brief / govern

This keeps the system legible without introducing too much architecture detail.

### 7. Requirements And Caveats

Keep this section, but move it below the product value sections.

Required points:

- Node.js / OpenClaw requirements
- native dependency note
- current repo packaging caveat
- optional semantic dependency note
- Butler increases scope and operational complexity

### 8. Documentation Links

Keep docs navigation concise and point to `docs/INDEX.md` plus the main public docs.

### 9. Chinese Counterpart

`README.zh-CN.md` should be a real Chinese rewrite of the same structure and intent, not a compressed translation stub.

## Content Constraints

- Do not claim packaging/native bundling is fully verified.
- Do not present Butler as mandatory or as the default user story.
- Do not let the README collapse into a changelog, architecture summary, or internal status memo.
- Do not use exaggerated marketing language that the codebase cannot support.

## Expected File Changes

- `README.md`
- `README.zh-CN.md`
- potentially small doc-link adjustments if needed after rewrite

## Verification Plan

- Read both final README files for structure, clarity, and honesty.
- Verify links referenced from both files exist.
- Confirm the homepage leads with product value, not maintenance caveats.
