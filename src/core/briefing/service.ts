import { randomUUID } from 'node:crypto';
import { DEFAULT_BOOT_TOKEN_BUDGET } from '../../constants.js';
import type { BriefingRepository } from '../../storage/briefingRepo.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { BootBriefing, MemoryItem, MemoryScope } from '../../types.js';

const PROJECT_STATUS_PATTERNS = [
  /\b(status|progress|phase|stage|milestone|roadmap|batch)\b/i,
  /(状态|进展|阶段|里程碑|路线图|批次|当前阶段)/u,
];
const PROJECT_SUMMARY_REGEX = /^项目连续性摘要（(?<projectName>[^）]+)）：状态：(?<status>.*?)；关键约束：(?<keyConstraint>.*?)；最近决策：(?<recentDecision>.*?)；下一步：(?<nextStep>.*)$/u;
const SUMMARY_PLACEHOLDER_VALUES = new Set(['待补充', '待确认', '待更新']);

function nowIso(): string {
  return new Date().toISOString();
}

function clip(value: string, max = 220): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 1)}…`;
}

function dedupe(values: string[]): string[] {
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

function pickContent(memories: MemoryItem[], limit: number): string[] {
  return memories.slice(0, limit).map((memory) => clip(memory.content));
}

function firstContent(memories: MemoryItem[], fallback = ''): string {
  if (memories.length === 0) {
    return fallback;
  }
  return clip(memories[0].content, 120);
}

function stripKnownLabel(content: string): string {
  return content
    .replace(/^(项目状态更新：|关键约束：|最近决策：|下一步：)\s*/u, '')
    .trim();
}

function withPrefix(prefix: string, content: string): string {
  return content.startsWith(prefix) ? content : `${prefix}${content}`;
}

interface ParsedProjectSummary {
  projectName?: string;
  status: string;
  keyConstraint: string;
  recentDecision: string;
  nextStep: string;
}

function includesProjectSummaryTag(memory: MemoryItem): boolean {
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
    return clip(explicitStatus, 120);
  }
  if (summaryStatus) {
    return clip(summaryStatus, 120);
  }
  return stripKnownLabel(firstContent(projectMemories));
}

function composeProjectSummary(input: {
  projectName?: string;
  projectSummaries: MemoryItem[];
  projectMemories: MemoryItem[];
  constraints: MemoryItem[];
  decisions: MemoryItem[];
  commitments: MemoryItem[];
}): string | null {
  const parsedSummaries = input.projectSummaries
    .map((memory) => parseProjectSummary(memory.content))
    .filter((item): item is ParsedProjectSummary => Boolean(item));
  const latestParsedSummary = parsedSummaries[0];
  const status = pickProjectStatus(input.projectMemories, latestParsedSummary?.status ?? '');
  const keyConstraint = stripKnownLabel(firstContent(input.constraints))
    || latestParsedSummary?.keyConstraint
    || '';
  const recentDecision = stripKnownLabel(firstContent(input.decisions))
    || latestParsedSummary?.recentDecision
    || '';
  const nextStep = stripKnownLabel(firstContent(input.commitments))
    || latestParsedSummary?.nextStep
    || '';
  if (!status && !keyConstraint && !recentDecision && !nextStep) {
    return null;
  }

  return clip(
    `项目连续性摘要（${input.projectName ?? 'current'}）：状态：${status || '待补充'}；关键约束：${keyConstraint || '待补充'}；最近决策：${recentDecision || '待补充'}；下一步：${nextStep || '待补充'}`,
    300,
  );
}

function composeActiveProjects(
  scope: MemoryScope,
  projectSummaries: MemoryItem[],
  projectMemories: MemoryItem[],
  constraints: MemoryItem[],
  decisions: MemoryItem[],
  commitments: MemoryItem[],
): string[] {
  const entries: string[] = [];
  const projectNames = gatherProjectNames(scope, projectSummaries, projectMemories, decisions, commitments);

  for (const projectName of projectNames) {
    if (entries.length >= 5) {
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
    if (summary && !entries.includes(summary)) {
      entries.push(summary);
    }
  }

  if (entries.length === 0) {
    const globalFallback = composeProjectSummary({
      projectSummaries: byProject(projectSummaries),
      projectMemories: byProject(projectMemories),
      constraints: byProject(constraints),
      decisions: byProject(decisions),
      commitments: byProject(commitments),
    });
    if (globalFallback) {
      entries.push(globalFallback);
    }
  }

  const unstructuredSummaryEntries = projectSummaries
    .filter((memory) => !parseProjectSummary(memory.content))
    .map((memory) => memory.content);

  return dedupe([
    ...entries,
    ...unstructuredSummaryEntries,
  ]).slice(0, 5);
}

function composeRecentContinuity(
  recentContinuity: MemoryItem[],
  decisions: MemoryItem[],
  commitments: MemoryItem[],
): string[] {
  return dedupe([
    ...pickContent(decisions, 3).map((content) => withPrefix('决策：', stripKnownLabel(content))),
    ...pickContent(commitments, 2).map((content) => withPrefix('下一步：', stripKnownLabel(content))),
    ...pickContent(recentContinuity, 6),
  ]).slice(0, 5);
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

function optimizeSections(
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

export class BriefingService {
  constructor(
    private readonly memoryRepo: MemoryRepository,
    private readonly briefingRepo: BriefingRepository,
  ) {}

  build(scope: MemoryScope, options?: { sessionId?: string; tokenTarget?: number }): BootBriefing {
    const identity = this.memoryRepo.search({
      scope,
      types: ['identity'],
      activeOnly: true,
      archived: false,
      limit: 5,
    });

    const constraints = this.memoryRepo.search({
      scope,
      types: ['constraint'],
      activeOnly: true,
      archived: false,
      limit: 5,
    });

    const recentContinuity = this.memoryRepo.search({
      scope,
      lifecycles: ['semantic', 'episodic'],
      activeOnly: true,
      archived: false,
      limit: 8,
    });

    const decisions = this.memoryRepo.search({
      scope,
      types: ['decision'],
      activeOnly: true,
      archived: false,
      limit: 8,
    });

    const commitments = this.memoryRepo.search({
      scope,
      types: ['commitment'],
      activeOnly: true,
      archived: false,
      limit: 8,
    });

    const activeProjects = this.memoryRepo.search({
      scope,
      types: ['project'],
      activeOnly: true,
      archived: false,
      limit: 10,
    });

    const summaryMemories = this.memoryRepo.search({
      scope,
      types: ['summary'],
      activeOnly: true,
      archived: false,
      limit: 12,
    });
    const projectSummaries = summaryMemories.filter((memory) => includesProjectSummaryTag(memory));

    const tokenTarget = options?.tokenTarget ?? DEFAULT_BOOT_TOKEN_BUDGET;
    const rawSections: BootBriefing['sections'] = {
      identity: pickContent(identity, 3),
      constraints: pickContent(constraints, 5),
      recentContinuity: composeRecentContinuity(recentContinuity, decisions, commitments),
      activeProjects: composeActiveProjects(
        scope,
        projectSummaries,
        activeProjects,
        constraints,
        decisions,
        commitments,
      ),
    };
    const optimized = optimizeSections(rawSections, tokenTarget);

    const briefing: BootBriefing = {
      id: randomUUID(),
      sessionId: options?.sessionId,
      userId: scope.userId,
      generatedAt: nowIso(),
      sections: optimized.sections,
      tokenTarget,
      actualApproxTokens: 0,
      optimization: optimized.stats,
    };

    briefing.actualApproxTokens = approxTokens(briefing.sections);
    this.briefingRepo.save(briefing);
    return briefing;
  }
}
