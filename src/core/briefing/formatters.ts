import { PROJECT_STATUS_PATTERNS } from '../../patterns.js';
import {
  BRIEFING_CLIP_PROJECT_SUMMARY,
  BRIEFING_CLIP_SHORT,
} from '../../tuning.js';
import { DEFAULT_BOOT_TOKEN_BUDGET } from '../../constants.js';
import { BriefingError } from '../../errors.js';
import type { MemoryItem, MemoryScope, BootBriefing } from '../../types.js';
import type { ProfileRepository } from '../../storage/profileRepo.js';
import { clip } from '../../util/string.js';
import { PreferenceGraphService } from '../profile/preferenceGraph.js';

const PROJECT_SUMMARY_REGEX =
  /^项目连续性摘要（(?<projectName>[^）]+)）：状态：(?<status>.*?)；关键约束：(?<keyConstraint>.*?)；最近决策：(?<recentDecision>.*?)；下一步：(?<nextStep>.*)$/u;
const SUMMARY_PLACEHOLDER_VALUES = new Set(['待补充', '待确认', '待更新']);

export interface BriefingSectionEntry {
  readonly content: string;
  readonly memoryIds: readonly string[];
}

export interface ParsedProjectSummary {
  projectName?: string;
  status: string;
  keyConstraint: string;
  recentDecision: string;
  nextStep: string;
}

export function stripKnownLabel(content: string): string {
  return content
    .replace(/^(项目状态更新：|关键约束：|最近决策：|下一步：)\s*/u, '')
    .trim();
}

export function withPrefix(prefix: string, content: string): string {
  return content.startsWith(prefix) ? content : `${prefix}${content}`;
}

export function withEntryPrefix(prefix: string, entry: BriefingSectionEntry): BriefingSectionEntry {
  return {
    content: withPrefix(prefix, stripKnownLabel(entry.content)),
    memoryIds: entry.memoryIds,
  };
}

export function normalizeSectionValue(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function normalizeSummaryField(value: string | undefined): string {
  const normalized = (value ?? '').trim();
  if (!normalized || SUMMARY_PLACEHOLDER_VALUES.has(normalized)) {
    return '';
  }
  return normalized;
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

export function pickContent(memories: MemoryItem[], limit: number): string[] {
  return memories.slice(0, limit).map((memory) => clip(memory.content));
}

export function pickEntries(memories: MemoryItem[], limit: number): BriefingSectionEntry[] {
  return memories.slice(0, limit).map((memory) => ({
    content: clip(memory.content),
    memoryIds: [memory.id],
  }));
}

export function firstContent(memories: MemoryItem[], fallback = ''): string {
  if (memories.length === 0) {
    return fallback;
  }
  return clip(memories[0].content, BRIEFING_CLIP_SHORT);
}

export function firstEntry(memories: MemoryItem[], fallback = ''): BriefingSectionEntry {
  if (memories.length === 0) {
    return { content: fallback, memoryIds: [] };
  }
  return {
    content: clip(memories[0].content, BRIEFING_CLIP_SHORT),
    memoryIds: [memories[0].id],
  };
}

export function humanizeProfileValue(value: string): string {
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

export function includesProjectSummaryTag(memory: MemoryItem): boolean {
  return memory.tags.includes('active_project_summary') || memory.tags.includes('project_continuity');
}

export function gatherProjectNames(scope: MemoryScope, ...groups: MemoryItem[][]): string[] {
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
  return dedupeByContent(names);
}

export function byProject(memories: MemoryItem[], projectName?: string): MemoryItem[] {
  if (!projectName) {
    return memories.filter((item) => !item.scope.project);
  }
  return memories.filter((item) => item.scope.project === projectName);
}

export function parseProjectSummary(content: string): ParsedProjectSummary | null {
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

export function hasProjectStatusSignal(content: string): boolean {
  return PROJECT_STATUS_PATTERNS.some((pattern) => pattern.test(content));
}

export function pickProjectStatus(projectMemories: MemoryItem[], summaryStatus: string): string {
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

export function pickProjectStatusEntry(
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

export function approxTokens(sections: BootBriefing['sections']): number {
  return Math.ceil(JSON.stringify(sections).length / 4);
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

export function toConciseProjectSummary(entry: string): string {
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

export function dedupeByContent(values: string[]): string[] {
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

export function dedupeEntriesByContent(entries: readonly BriefingSectionEntry[]): BriefingSectionEntry[] {
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

export function composeProjectSummaryContent(projectName: string | undefined, parts: string[]): string {
  return clip(`项目连续性摘要（${projectName ?? 'current'}）：${parts.join('；')}`, BRIEFING_CLIP_PROJECT_SUMMARY);
}
