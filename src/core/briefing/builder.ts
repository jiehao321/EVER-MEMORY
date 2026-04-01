import {
  BRIEFING_COMMITMENT_LIMIT,
  BRIEFING_PICK_CONSTRAINTS,
  BRIEFING_PICK_IDENTITY,
} from '../../tuning.js';
import type { BootBriefing } from '../../types.js';
import { clip } from '../../util/string.js';
import {
  approxTokens,
  appendPreferenceSummary,
  dedupeByContent,
  dedupeEntriesByContent,
  includesProjectSummaryTag,
  normalizeCommunicationStyle,
  normalizeSectionValue,
  resolveTokenTarget,
  toConciseProjectSummary,
  type BriefingSectionEntry,
} from './formatters.js';
import {
  composeActiveProjectEntries,
  composeActiveProjects,
  composeRecentContinuity,
  composeRecentContinuityEntries,
} from './composers.js';

export { clip };
export type { BriefingSectionEntry } from './formatters.js';
export {
  appendPreferenceSummary,
  composeActiveProjectEntries,
  composeActiveProjects,
  composeRecentContinuity,
  composeRecentContinuityEntries,
  includesProjectSummaryTag,
  normalizeCommunicationStyle,
  resolveTokenTarget,
};

const BRIEFING_STYLE_LIMITS = {
  concise: 2,
  detailed: 5,
  structured: Number.POSITIVE_INFINITY,
} as const;

type BriefingSectionKey = keyof BootBriefing['sections'];
type BriefingEntrySections = Record<BriefingSectionKey, BriefingSectionEntry[]>;

interface BriefingOptimizationStats {
  duplicateBlocksRemoved: number;
  tokenPrunedBlocks: number;
  highValueBlocksKept: number;
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

export function optimizeSections(
  sections: BootBriefing['sections'],
  tokenTarget: number,
): { sections: BootBriefing['sections']; stats: BriefingOptimizationStats } {
  const order: BriefingSectionKey[] = ['activeProjects', 'constraints', 'recentContinuity', 'identity'];
  const deduped: BootBriefing['sections'] = { identity: [], constraints: [], recentContinuity: [], activeProjects: [] };
  const seen = new Set<string>();
  let duplicateBlocksRemoved = 0;

  for (const key of order) {
    for (const value of sections[key]) {
      const normalized = normalizeSectionValue(value);
      if (!normalized) continue;
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
      if (deduped[key].length <= minKeep[key]) {
        continue;
      }
      deduped[key].pop();
      tokenPrunedBlocks += 1;
      pruned = true;
      break;
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

export function optimizeSectionEntries(
  sections: BriefingEntrySections,
  tokenTarget: number,
): { sections: BootBriefing['sections']; entrySections: BriefingEntrySections; stats: BriefingOptimizationStats } {
  const order: BriefingSectionKey[] = ['activeProjects', 'constraints', 'recentContinuity', 'identity'];
  const deduped: BriefingEntrySections = { identity: [], constraints: [], recentContinuity: [], activeProjects: [] };
  const seen = new Set<string>();
  let duplicateBlocksRemoved = 0;

  for (const key of order) {
    for (const entry of sections[key]) {
      const normalized = normalizeSectionValue(entry.content);
      if (!normalized) continue;
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
      if (deduped[key].length <= minKeep[key]) {
        continue;
      }
      deduped[key].pop();
      tokenPrunedBlocks += 1;
      pruned = true;
      break;
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
    return { sections: sectionEntriesToSections(sections), entrySections: sections };
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

  return { sections: sectionEntriesToSections(entrySections), entrySections };
}

export const BRIEFING_SECTION_PICKS = {
  commitmentLimit: BRIEFING_COMMITMENT_LIMIT,
  constraintLimit: BRIEFING_PICK_CONSTRAINTS,
  identityLimit: BRIEFING_PICK_IDENTITY,
} as const;
