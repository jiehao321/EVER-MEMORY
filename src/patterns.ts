/**
 * Centralized pattern definitions for EverMemory.
 *
 * All RegExp arrays that are used across multiple modules live here
 * so they are compiled once at module-load time and shared.
 */

// ---------------------------------------------------------------------------
// Project detection patterns
// ---------------------------------------------------------------------------

/** Broad project-related keyword detection. */
export const PROJECT_PATTERNS: RegExp[] = [
  /\b(project|phase|milestone|roadmap|plan)\b/i,
  /(项目|阶段|里程碑|路线图|计划|推进|下一步)/,
];

/** Compact project status / progress detection (superset includes 'status' & 'progress'). */
export const PROJECT_COMPACT_PATTERNS: RegExp[] = [
  /\b(project|phase|milestone|roadmap|status|progress)\b/i,
  /(项目状态|项目进展|阶段|里程碑|路线图|状态|进展|当前阶段|项目代号)/,
];

/** Project status patterns shared by briefing and session-end. */
export const PROJECT_STATUS_PATTERNS: RegExp[] = [
  /\b(status|progress|phase|stage|milestone|roadmap|batch)\b/i,
  /(状态|进展|阶段|里程碑|路线图|批次|当前阶段)/,
];

/** Project progress route patterns (avoid stage/next-step bleed). */
export const PROJECT_PROGRESS_ROUTE_PATTERNS: RegExp[] = [
  /\b(project\s*(progress|update)|progress\s+(update|report)|where\s+are\s+we|how\s+far\s+(along)?|latest\s+progress)\b/i,
  /(项目进展|项目进度|进展|进度|推进到|到哪了|到哪里了|进展到|现在进展|当前进度|最近进展)/,
];

/** Current stage route patterns (explicitly match phase/stage phrases). */
export const PROJECT_STAGE_ROUTE_PATTERNS: RegExp[] = [
  /\b(current\s+(phase|stage)|which\s+phase|what\s+stage|phase\s+status|stage\s+status|current\s+milestone|current\s+batch)\b/i,
  /(当前阶段|现在阶段|阶段状态|第几阶段|第几期|第几批|阶段进度|现在在第|处于第|当前批次)/,
];

/** Planning-oriented patterns (used by intent heuristics). */
export const PLANNING_PATTERNS: RegExp[] = [
  /\b(plan|roadmap|milestone|phase)\b/i,
  /(计划|路线图|里程碑|阶段|拆分|推进)/,
];

/** Status inquiry patterns (used by intent heuristics). */
export const STATUS_PATTERNS: RegExp[] = [
  /\b(progress|status|where are we|current phase|latest)\b/i,
  /(进展|状态|到哪了|到哪里了|当前阶段|最近情况|最新情况|汇报)/,
];

// ---------------------------------------------------------------------------
// Correction / feedback patterns
// ---------------------------------------------------------------------------

/** Correction signal patterns (shared by session-end & intent heuristics). */
export const CORRECTION_PATTERNS: RegExp[] = [
  /\b(i mean|correction|to be clear)\b/i,
  /(不是|更正|纠正|准确来说|修正一下)/,
];

// ---------------------------------------------------------------------------
// Preference patterns
// ---------------------------------------------------------------------------

/** Preference detection (shared by session-end, write policy, intent heuristics). */
export const PREFERENCE_PATTERNS: RegExp[] = [
  /\b(i like|i prefer|i love|i hate|i want)\b/i,
  /(我喜欢|我更喜欢|我偏好|我不喜欢|我讨厌|希望你|我想要)/,
];

/** Narrow preference detection preserved for write-policy classification parity. */
export const WRITE_PREFERENCE_PATTERNS: RegExp[] = [
  /\b(i like|i prefer|i love|i hate)\b/i,
  /(我喜欢|我更喜欢|我偏好|我不喜欢|我讨厌)/,
];

// ---------------------------------------------------------------------------
// Constraint patterns
// ---------------------------------------------------------------------------

/** Constraint / prohibition detection (shared by session-end & write policy). */
export const CONSTRAINT_PATTERNS: RegExp[] = [
  /\b(don't|do not|never|always|must)\b/i,
  /(不要|别|务必|必须|一律|先确认)/,
];

/** Narrow constraint detection preserved for write-policy classification parity. */
export const WRITE_CONSTRAINT_PATTERNS: RegExp[] = [
  /\b(don't|do not|never|always)\b/i,
  /(不要|别|务必|必须|一律)/,
];

// ---------------------------------------------------------------------------
// Decision patterns
// ---------------------------------------------------------------------------

/** Decision detection (shared by session-end & write policy). */
export const DECISION_PATTERNS: RegExp[] = [
  /\b(decide|decided|choose|selected|final|we will|we should)\b/i,
  /(决定|定为|采用|改为|最终方案|最近决策|决策：)/,
];

/** Narrow decision detection preserved for write-policy classification parity. */
export const WRITE_DECISION_PATTERNS: RegExp[] = [
  /\b(decide|decided|we will|we should)\b/i,
  /(决定|定为|采用|改为)/,
];

// ---------------------------------------------------------------------------
// Next-step / follow-up patterns
// ---------------------------------------------------------------------------

/** Next-step cues used in session-end auto-capture. */
export const NEXT_STEP_PATTERNS: RegExp[] = [
  /\b(next step|follow up|todo|to do|then)\b/i,
  /(下一步|接下来|后续|待办|跟进)/,
];

// ---------------------------------------------------------------------------
// Intent analysis patterns (used only by heuristics, but pre-compiled here)
// ---------------------------------------------------------------------------

/** Execution-oriented intent patterns. */
export const EXECUTION_PATTERNS: RegExp[] = [
  /\b(implement|execute|fix|build)\b/i,
  /(实现|执行|修复|落地|开发|开始做)/,
];

/** Memory-cue patterns. */
export const MEMORY_CUE_PATTERNS: RegExp[] = [
  /\bremember|previous|before|history|earlier\b/i,
  /(记住|之前|上次|历史|延续|连续性)/,
];

/** Frustration tone patterns. */
export const FRUSTRATION_PATTERNS: RegExp[] = [
  /\b(frustrated|annoyed|angry)\b/i,
  /(烦|气死|崩溃|离谱|不行)/,
];

/** Excited tone patterns. */
export const EXCITED_PATTERNS: RegExp[] = [
  /\b(great|awesome|excited)\b/i,
  /(太好了|很棒|兴奋)/,
];

// ---------------------------------------------------------------------------
// Write-policy patterns (only in write.ts, but co-located for completeness)
// ---------------------------------------------------------------------------

/** Commitment / follow-up patterns. */
export const COMMITMENT_PATTERNS: RegExp[] = [
  /\b(i will|we will|todo|to do|follow up)\b/i,
  /(我会|我们会|待办|跟进|后续做)/,
];

/** Identity patterns. */
export const IDENTITY_PATTERNS: RegExp[] = [
  /\bmy name is\b/i,
  /\bcall me\b/i,
  /(我叫|叫我)/,
];

/** Low-value / trivial response patterns. */
export const LOW_VALUE_PATTERNS: RegExp[] = [
  /^ok[.!]*$/i,
  /^okay[.!]*$/i,
  /^thanks?[.!]*$/i,
  /^thx[.!]*$/i,
  /^lol[.!]*$/i,
  /^收到[。！!]*$/,
  /^好的[。！!]*$/,
  /^嗯[。！!]*$/,
  /^哈哈[。！!]*$/,
];

// ---------------------------------------------------------------------------
// Noise / test patterns
// ---------------------------------------------------------------------------

/** Generic outcome patterns (session-end). */
export const GENERIC_OUTCOME_PATTERNS: RegExp[] = [
  /^run_(success|failed)$/i,
  /^(success|failed|done|completed)$/i,
  /^(成功|失败|完成)$/u,
];

/** Test noise patterns (session-end). */
export const TEST_NOISE_PATTERNS: RegExp[] = [
  /\bopenclaw-smoke\b/i,
  /\bE2E-\d+/i,
  /\bevermemory_(store|recall|status)\b/i,
  /请调用\s*(evermemory_store|evermemory_recall|evermemory_status)/,
  /skills store policy \(operator configured\)/i,
  /AGENTS\.md instructions/i,
  /do not claim exclusivity/i,
];
