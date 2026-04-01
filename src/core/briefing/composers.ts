import {
  BRIEFING_CLIP_PROJECT_SUMMARY,
  BRIEFING_MAX_ACTIVE_PROJECTS,
  BRIEFING_PICK_COMMITMENTS,
  BRIEFING_PICK_CONTINUITY,
  BRIEFING_PICK_CONTINUITY_OUTPUT,
  BRIEFING_PICK_DECISIONS,
} from '../../tuning.js';
import type { MemoryItem, MemoryScope } from '../../types.js';
import { clip } from '../../util/string.js';
import {
  byProject,
  dedupeEntriesByContent,
  firstEntry,
  gatherProjectNames,
  parseProjectSummary,
  pickEntries,
  pickProjectStatusEntry,
  stripKnownLabel,
  type BriefingSectionEntry,
  type ParsedProjectSummary,
  withEntryPrefix,
} from './formatters.js';

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
  if (!status.content && !keyConstraint.content && !recentDecision.content && !nextStep.content) {
    return null;
  }

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

  return dedupeEntriesByContent([...entryRecords, ...unstructuredSummaryEntries]).slice(0, BRIEFING_MAX_ACTIVE_PROJECTS);
}

export function composeRecentContinuity(
  recentContinuity: MemoryItem[],
  decisions: MemoryItem[],
  commitments: MemoryItem[],
): string[] {
  return composeRecentContinuityEntries(recentContinuity, decisions, commitments).map((entry) => entry.content);
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
