import { PROJECT_STATUS_PATTERNS } from '../../patterns.js';
import {
  BRIEFING_CLIP_DEFAULT,
  BRIEFING_CLIP_PROJECT_SUMMARY,
  BRIEFING_CLIP_SHORT,
  BRIEFING_COMMITMENT_LIMIT,
  BRIEFING_MAX_ACTIVE_PROJECTS,
  BRIEFING_PICK_COMMITMENTS,
  BRIEFING_PICK_CONSTRAINTS,
  BRIEFING_PICK_CONTINUITY,
  BRIEFING_PICK_CONTINUITY_OUTPUT,
  BRIEFING_PICK_DECISIONS,
  BRIEFING_PICK_IDENTITY,
} from '../../tuning.js';
import { DEFAULT_BOOT_TOKEN_BUDGET } from '../../constants.js';
import { BriefingError } from '../../errors.js';
import type { MemoryItem, MemoryScope, BootBriefing } from '../../types.js';
import type { ProfileRepository } from '../../storage/profileRepo.js';
import { PreferenceGraphService } from '../profile/preferenceGraph.js';

const PROJECT_SUMMARY_REGEX = /^项目连续性摘要（(?<projectName>[^）]+)）：状态：(?<status>.*?)；关键约束：(?<keyConstraint>.*?)；最近决策：(?<recentDecision>.*?)；下一步：(?<nextStep>.*)$/u;
const SUMMARY_PLACEHOLDER_VALUES = new Set(['待补充', '待确认', '待更新']);
const BRIEFING_STYLE_LIMITS = {
  concise: 2,
  detailed: 5,
  structured: Number.POSITIVE_INFINITY,
} as const;

export interface BriefingSectionEntry {
  readonly content: string;
  readonly memoryIds: readonly string[];
}

export function clip(value: string, max = BRIEFING_CLIP_DEFAULT): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 1)}…`;
}

export function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = clip(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function dedupeByContent(values: string[]): string[] {
  return dedupe(values);
}

function dedupeEntriesByContent(entries: readonly BriefingSectionEntry[]): BriefingSectionEntry[] {
  const seen = new Set<string>();
  const output: BriefingSectionEntry[] = [];

  for (const entry of entries) {
    const normalized = normalizeSectionValue(entry.content);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(entry);
  }

  return output;
}

function humanizeProfileValue(value: string): string {
  return value
    .replace(/concise_direct/gi, '简洁直接')
    .replace(/stepwise_planning/gi, '逐步确认')
    .replace(/confirm_before_execution/gi, '逐步确认')
    .replace(/risk_aware_execution/gi, '谨慎执行')
    .replace(/_/g, ' ');
}

export function appendPreferenceSummary(
  identity: string[],
  scope: MemoryScope,
  graphService: PreferenceGraphService,
  profileRepo?: ProfileRepository,
): string[] {
  if (!profileRepo || !scope.userId) {
    return identity;
  }

  const profile = profileRepo.getByUserId(scope.userId);
  if (!profile) {
    return identity;
  }

  const nextIdentity = [...identity];
  const communicationStyle = profile.derived.communicationStyle?.tendency;
  if (communicationStyle) {
    nextIdentity.push(`沟通风格：${humanizeProfileValue(communicationStyle)}`);
  }

  const workPatterns = profile.derived.workPatterns
    .slice(0, 3)
    .map((item) => humanizeProfileValue(item.value));
  if (workPatterns.length > 0) {
    nextIdentity.push(`工作习惯：${workPatterns.join('、')}`);
  }

  const graph = graphService.buildFromProfile(scope.userId, profile);
  const inferred = graphService.inferImplications(graph).slice(0, 3);
  if (inferred.length > 0) {
    nextIdentity.push(`偏好推断：${inferred.join('、')}`);
  }

  return nextIdentity;
}

function pickContent(memories: MemoryItem[], limit: number): string[] {
  return memories.slice(0, limit).map((memory) => clip(memory.content));
}

function pickEntries(memories: MemoryItem[], limit: number): BriefingSectionEntry[] {
  return memories.slice(0, limit).map((memory) => ({
    content: clip(memory.content),
    memoryIds: [memory.id],
  }));
}

function firstContent(memories: MemoryItem[], fallback = ''): string {
  if (memories.length === 0) {
    return fallback;
  }
  return clip(memories[0].content, BRIEFING_CLIP_SHORT);
}

function firstEntry(memories: MemoryItem[], fallback = ''): BriefingSectionEntry {
  if (memories.length === 0) {
    return { content: fallback, memoryIds: [] };
  }
  return {
    content: clip(memories[0].content, BRIEFING_CLIP_SHORT),
    memoryIds: [memories[0].id],
  };
}

function stripKnownLabel(content: string): string {
  return content
    .replace(/^(项目状态更新：|关键约束：|最近决策：|下一步：)\s*/u, '')
    .trim();
}

function withPrefix(prefix: string, content: string): string {
  return content.startsWith(prefix) ? content : `${prefix}${content}`;
}

function withEntryPrefix(prefix: string, entry: BriefingSectionEntry): BriefingSectionEntry {
  return {
    content: withPrefix(prefix, stripKnownLabel(entry.content)),
    memoryIds: entry.memoryIds,
  };
}

interface ParsedProjectSummary {
  projectName?: string;
  status: string;
  keyConstraint: string;
  recentDecision: string;
  nextStep: string;
}

export function includesProjectSummaryTag(memory: MemoryItem): boolean {
  return memory.tags.includes('active_project_summary') || memory.tags.includes('project_continuity');
}

function gatherProjectNames(scope: MemoryScope, ...groups: MemoryItem[][]): string[] {
  const names: string[] = [];
  if (scope.project) {
    names.push(scope.project);
  }
  for (const group of groups) {
    for (const memory of group) {
      if (memory.scope.project) {
        names.push(memory.scope.project);
      }
    }
  }
  return dedupe(names);
}

function byProject(memories: MemoryItem[], projectName?: string): MemoryItem[] {
  if (!projectName) {
    return memories.filter((item) => !item.scope.project);
  }
  return memories.filter((item) => item.scope.project === projectName);
}

function normalizeSummaryField(value: string | undefined): string {
  const normalized = (value ?? '').trim();
  if (!normalized || SUMMARY_PLACEHOLDER_VALUES.has(normalized)) {
    return '';
  }
  return normalized;
}

function parseProjectSummary(content: string): ParsedProjectSummary | null {
  const match = PROJECT_SUMMARY_REGEX.exec(content.trim());
  if (!match?.groups) {
    return null;
  }
  return {
    projectName: normalizeSummaryField(match.groups.projectName),
    status: normalizeSummaryField(match.groups.status),
    keyConstraint: normalizeSummaryField(match.groups.keyConstraint),
    recentDecision: normalizeSummaryField(match.groups.recentDecision),
    nextStep: normalizeSummaryField(match.groups.nextStep),
  };
}

function hasProjectStatusSignal(content: string): boolean {
  return PROJECT_STATUS_PATTERNS.some((pattern) => pattern.test(content));
}

function pickProjectStatus(projectMemories: MemoryItem[], summaryStatus: string): string {
  const explicitStatus = projectMemories
    .map((memory) => stripKnownLabel(memory.content))
    .find((content) => content && hasProjectStatusSignal(content));
  if (explicitStatus) {
    return clip(explicitStatus, BRIEFING_CLIP_SHORT);
  }
  if (summaryStatus) {
    return clip(summaryStatus, BRIEFING_CLIP_SHORT);
  }
  return stripKnownLabel(firstContent(projectMemories));
}

function pickProjectStatusEntry(
  projectMemories: MemoryItem[],
  summaryStatus: string,
  summaryMemoryId?: string,
): BriefingSectionEntry {
  const explicitStatus = projectMemories.find((memory) => hasProjectStatusSignal(stripKnownLabel(memory.content)));
  if (explicitStatus) {
    return {
      content: clip(stripKnownLabel(explicitStatus.content), BRIEFING_CLIP_SHORT),
      memoryIds: [explicitStatus.id],
    };
  }
  if (summaryStatus) {
    return {
      content: clip(summaryStatus, BRIEFING_CLIP_SHORT),
      memoryIds: summaryMemoryId ? [summaryMemoryId] : [],
    };
  }
  const fallback = firstEntry(projectMemories);
  return {
    content: stripKnownLabel(fallback.content),
    memoryIds: fallback.memoryIds,
  };
}

function composeProjectSummary(input: {
  projectName?: string;
  projectSummaries: MemoryItem[];
  projectMemories: MemoryItem[];
  constraints: MemoryItem[];
  decisions: MemoryItem[];
  commitments: MemoryItem[];
}): BriefingSectionEntry | null {
  const parsedSummaries = input.projectSummaries
    .map((memory) => ({ memory, parsed: parseProjectSummary(memory.content) }))
    .filter((item): item is { memory: MemoryItem; parsed: ParsedProjectSummary } => Boolean(item.parsed));
  const latestParsedSummary = parsedSummaries[0];
  const status = pickProjectStatusEntry(
    input.projectMemories,
    latestParsedSummary?.parsed.status ?? '',
    latestParsedSummary?.memory.id,
  );
  const firstConstraint = firstEntry(input.constraints);
  const keyConstraint = stripKnownLabel(firstConstraint.content)
    ? {
        content: stripKnownLabel(firstConstraint.content),
        memoryIds: firstConstraint.memoryIds,
      }
    : {
        content: latestParsedSummary?.parsed.keyConstraint ?? '',
        memoryIds: latestParsedSummary ? [latestParsedSummary.memory.id] : [],
      };
  const firstDecision = firstEntry(input.decisions);
  const recentDecision = stripKnownLabel(firstDecision.content)
    ? {
        content: stripKnownLabel(firstDecision.content),
        memoryIds: firstDecision.memoryIds,
      }
    : {
        content: latestParsedSummary?.parsed.recentDecision ?? '',
        memoryIds: latestParsedSummary ? [latestParsedSummary.memory.id] : [],
      };
  const firstCommitment = firstEntry(input.commitments);
  const nextStep = stripKnownLabel(firstCommitment.content)
    ? {
        content: stripKnownLabel(firstCommitment.content),
        memoryIds: firstCommitment.memoryIds,
      }
    : {
        content: latestParsedSummary?.parsed.nextStep ?? '',
        memoryIds: latestParsedSummary ? [latestParsedSummary.memory.id] : [],
      };
  if (!status && !keyConstraint && !recentDecision && !nextStep) {
    return null;
  }

  // C1: Only include fields that have actual data — omit empty fields rather than using "待补充"
  const parts: string[] = [];
  const memoryIds = new Set<string>();
  if (status.content) {
    parts.push(`状态：${status.content}`);
    for (const id of status.memoryIds) memoryIds.add(id);
  }
  if (keyConstraint.content) {
    parts.push(`关键约束：${keyConstraint.content}`);
    for (const id of keyConstraint.memoryIds) memoryIds.add(id);
  }
  if (recentDecision.content) {
    parts.push(`最近决策：${recentDecision.content}`);
    for (const id of recentDecision.memoryIds) memoryIds.add(id);
  }
  if (nextStep.content) {
    parts.push(`下一步：${nextStep.content}`);
    for (const id of nextStep.memoryIds) memoryIds.add(id);
  }
  return {
    content: clip(
      `项目连续性摘要（${input.projectName ?? 'current'}）：${parts.join('；')}`,
      BRIEFING_CLIP_PROJECT_SUMMARY,
    ),
    memoryIds: [...memoryIds],
  };
}

export function composeActiveProjects(
  scope: MemoryScope,
  projectSummaries: MemoryItem[],
  projectMemories: MemoryItem[],
  constraints: MemoryItem[],
  decisions: MemoryItem[],
  commitments: MemoryItem[],
): string[] {
  return composeActiveProjectEntries(
    scope,
    projectSummaries,
    projectMemories,
    constraints,
    decisions,
    commitments,
  ).map((entry) => entry.content);
}

export function composeActiveProjectEntries(
  scope: MemoryScope,
  projectSummaries: MemoryItem[],
  projectMemories: MemoryItem[],
  constraints: MemoryItem[],
  decisions: MemoryItem[],
  commitments: MemoryItem[],
): BriefingSectionEntry[] {
  const entries: string[] = [];
  const entryRecords: BriefingSectionEntry[] = [];
  const projectNames = gatherProjectNames(scope, projectSummaries, projectMemories, decisions, commitments);

  for (const projectName of projectNames) {
    if (entryRecords.length >= BRIEFING_MAX_ACTIVE_PROJECTS) {
      break;
    }
    const summary = composeProjectSummary({
      projectName,
      projectSummaries: byProject(projectSummaries, projectName),
      projectMemories: byProject(projectMemories, projectName),
      constraints: byProject(constraints, projectName),
      decisions: byProject(decisions, projectName),
      commitments: byProject(commitments, projectName),
    });
    if (summary && !entries.includes(summary.content)) {
      entries.push(summary.content);
      entryRecords.push(summary);
    }
  }

  if (entryRecords.length === 0) {
    const globalFallback = composeProjectSummary({
      projectSummaries: byProject(projectSummaries),
      projectMemories: byProject(projectMemories),
      constraints: byProject(constraints),
      decisions: byProject(decisions),
      commitments: byProject(commitments),
    });
    if (globalFallback) {
      entries.push(globalFallback.content);
      entryRecords.push(globalFallback);
    }
  }

  const unstructuredSummaryEntries: BriefingSectionEntry[] = projectSummaries
    .filter((memory) => !parseProjectSummary(memory.content))
    .map((memory) => ({
      content: memory.content,
      memoryIds: [memory.id],
    }));

  return dedupeEntriesByContent([
    ...entryRecords,
    ...unstructuredSummaryEntries,
  ]).slice(0, BRIEFING_MAX_ACTIVE_PROJECTS);
}

export function composeRecentContinuity(
  recentContinuity: MemoryItem[],
  decisions: MemoryItem[],
  commitments: MemoryItem[],
): string[] {
  return composeRecentContinuityEntries(recentContinuity, decisions, commitments)
    .map((entry) => entry.content);
}

export function composeRecentContinuityEntries(
  recentContinuity: MemoryItem[],
  decisions: MemoryItem[],
  commitments: MemoryItem[],
): BriefingSectionEntry[] {
  return dedupeEntriesByContent([
    ...pickEntries(decisions, BRIEFING_PICK_DECISIONS).map((entry) => withEntryPrefix('决策：', entry)),
    ...pickEntries(commitments, BRIEFING_PICK_COMMITMENTS).map((entry) => withEntryPrefix('下一步：', entry)),
    ...pickEntries(recentContinuity, BRIEFING_PICK_CONTINUITY),
  ]).slice(0, BRIEFING_PICK_CONTINUITY_OUTPUT);
}

type BriefingSectionKey = keyof BootBriefing['sections'];

interface BriefingOptimizationStats {
  duplicateBlocksRemoved: number;
  tokenPrunedBlocks: number;
  highValueBlocksKept: number;
}

function approxTokens(sections: BootBriefing['sections']): number {
  return Math.ceil(JSON.stringify(sections).length / 4);
}

function normalizeSectionValue(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function resolveTokenTarget(tokenTarget: number | undefined): number {
  if (tokenTarget === undefined) {
    return DEFAULT_BOOT_TOKEN_BUDGET;
  }
  if (!Number.isInteger(tokenTarget) || tokenTarget <= 0) {
    throw new BriefingError('Briefing token target must be a positive integer.', {
      code: 'BRIEFING_INVALID_TOKEN_TARGET',
      context: { tokenTarget },
    });
  }
  return tokenTarget;
}

export function optimizeSections(
  sections: BootBriefing['sections'],
  tokenTarget: number,
): { sections: BootBriefing['sections']; stats: BriefingOptimizationStats } {
  const order: BriefingSectionKey[] = ['activeProjects', 'constraints', 'recentContinuity', 'identity'];
  const deduped: BootBriefing['sections'] = {
    identity: [],
    constraints: [],
    recentContinuity: [],
    activeProjects: [],
  };
  const seen = new Set<string>();
  let duplicateBlocksRemoved = 0;

  for (const key of order) {
    for (const value of sections[key]) {
      const normalized = normalizeSectionValue(value);
      if (!normalized) {
        continue;
      }
      if (seen.has(normalized)) {
        duplicateBlocksRemoved += 1;
        continue;
      }
      seen.add(normalized);
      deduped[key].push(value);
    }
  }

  const minKeep: Record<BriefingSectionKey, number> = {
    activeProjects: deduped.activeProjects.length > 0 ? 1 : 0,
    constraints: deduped.constraints.length > 0 ? 1 : 0,
    recentContinuity: 0,
    identity: 0,
  };
  const pruneOrder: BriefingSectionKey[] = ['identity', 'recentContinuity', 'constraints', 'activeProjects'];
  let tokenPrunedBlocks = 0;

  while (approxTokens(deduped) > tokenTarget) {
    let pruned = false;
    for (const key of pruneOrder) {
      if (deduped[key].length > minKeep[key]) {
        deduped[key].pop();
        tokenPrunedBlocks += 1;
        pruned = true;
        break;
      }
    }
    if (!pruned) {
      break;
    }
  }

  return {
    sections: deduped,
    stats: {
      duplicateBlocksRemoved,
      tokenPrunedBlocks,
      highValueBlocksKept: deduped.activeProjects.length + deduped.constraints.length,
    },
  };
}

export function normalizeCommunicationStyle(style?: string): 'concise' | 'detailed' | 'structured' {
  if (style === 'concise' || style === 'detailed' || style === 'structured') {
    return style;
  }
  if (style === 'concise_direct') {
    return 'concise';
  }
  return 'structured';
}

function toConciseProjectSummary(entry: string): string {
  const parsed = parseProjectSummary(entry);
  if (!parsed) {
    return clip(entry, BRIEFING_CLIP_SHORT);
  }
  const keyField = parsed.status || parsed.nextStep || parsed.keyConstraint || parsed.recentDecision;
  if (!keyField) {
    return clip(entry, BRIEFING_CLIP_SHORT);
  }
  return clip(`项目状态（${parsed.projectName || 'current'}）：${keyField}`, BRIEFING_CLIP_SHORT);
}

export function adaptSectionsByStyle(
  sections: BootBriefing['sections'],
  communicationStyle: 'concise' | 'detailed' | 'structured',
): BootBriefing['sections'] {
  if (communicationStyle === 'structured') {
    return sections;
  }

  const limit = BRIEFING_STYLE_LIMITS[communicationStyle];
  return {
    identity: dedupeByContent(sections.identity).slice(0, limit),
    constraints: dedupeByContent(sections.constraints).slice(0, limit),
    recentContinuity: dedupeByContent(sections.recentContinuity).slice(0, limit),
    activeProjects: dedupeByContent(
      communicationStyle === 'concise'
        ? sections.activeProjects.map((entry) => toConciseProjectSummary(entry))
        : sections.activeProjects,
    ).slice(0, limit),
  };
}

type BriefingEntrySections = Record<BriefingSectionKey, BriefingSectionEntry[]>;

export function optimizeSectionEntries(
  sections: BriefingEntrySections,
  tokenTarget: number,
): { sections: BootBriefing['sections']; entrySections: BriefingEntrySections; stats: BriefingOptimizationStats } {
  const order: BriefingSectionKey[] = ['activeProjects', 'constraints', 'recentContinuity', 'identity'];
  const deduped: BriefingEntrySections = {
    identity: [],
    constraints: [],
    recentContinuity: [],
    activeProjects: [],
  };
  const seen = new Set<string>();
  let duplicateBlocksRemoved = 0;

  for (const key of order) {
    for (const entry of sections[key]) {
      const normalized = normalizeSectionValue(entry.content);
      if (!normalized) {
        continue;
      }
      if (seen.has(normalized)) {
        duplicateBlocksRemoved += 1;
        continue;
      }
      seen.add(normalized);
      deduped[key].push(entry);
    }
  }

  const minKeep: Record<BriefingSectionKey, number> = {
    activeProjects: deduped.activeProjects.length > 0 ? 1 : 0,
    constraints: deduped.constraints.length > 0 ? 1 : 0,
    recentContinuity: 0,
    identity: 0,
  };
  const pruneOrder: BriefingSectionKey[] = ['identity', 'recentContinuity', 'constraints', 'activeProjects'];
  let tokenPrunedBlocks = 0;

  while (approxTokens(sectionEntriesToSections(deduped)) > tokenTarget) {
    let pruned = false;
    for (const key of pruneOrder) {
      if (deduped[key].length > minKeep[key]) {
        deduped[key].pop();
        tokenPrunedBlocks += 1;
        pruned = true;
        break;
      }
    }
    if (!pruned) {
      break;
    }
  }

  return {
    sections: sectionEntriesToSections(deduped),
    entrySections: deduped,
    stats: {
      duplicateBlocksRemoved,
      tokenPrunedBlocks,
      highValueBlocksKept: deduped.activeProjects.length + deduped.constraints.length,
    },
  };
}

function sectionEntriesToSections(sections: BriefingEntrySections): BootBriefing['sections'] {
  return {
    identity: sections.identity.map((entry) => entry.content),
    constraints: sections.constraints.map((entry) => entry.content),
    recentContinuity: sections.recentContinuity.map((entry) => entry.content),
    activeProjects: sections.activeProjects.map((entry) => entry.content),
  };
}

export function adaptSectionEntriesByStyle(
  sections: BriefingEntrySections,
  communicationStyle: 'concise' | 'detailed' | 'structured',
): { sections: BootBriefing['sections']; entrySections: BriefingEntrySections } {
  if (communicationStyle === 'structured') {
    return {
      sections: sectionEntriesToSections(sections),
      entrySections: sections,
    };
  }

  const limit = BRIEFING_STYLE_LIMITS[communicationStyle];
  const activeProjects = dedupeEntriesByContent(
    communicationStyle === 'concise'
      ? sections.activeProjects.map((entry) => ({
          content: toConciseProjectSummary(entry.content),
          memoryIds: entry.memoryIds,
        }))
      : sections.activeProjects,
  ).slice(0, limit);
  const entrySections: BriefingEntrySections = {
    identity: dedupeEntriesByContent(sections.identity).slice(0, limit),
    constraints: dedupeEntriesByContent(sections.constraints).slice(0, limit),
    recentContinuity: dedupeEntriesByContent(sections.recentContinuity).slice(0, limit),
    activeProjects,
  };

  return {
    sections: sectionEntriesToSections(entrySections),
    entrySections,
  };
}

export const BRIEFING_SECTION_PICKS = {
  commitmentLimit: BRIEFING_COMMITMENT_LIMIT,
  constraintLimit: BRIEFING_PICK_CONSTRAINTS,
  identityLimit: BRIEFING_PICK_IDENTITY,
} as const;
