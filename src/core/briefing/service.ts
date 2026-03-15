import { randomUUID } from 'node:crypto';
import type { BriefingRepository } from '../../storage/briefingRepo.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { ProfileRepository } from '../../storage/profileRepo.js';
import type { BootBriefing, MemoryItem, MemoryScope } from '../../types.js';
import { PreferenceGraphService } from '../profile/preferenceGraph.js';
import { CrossProjectTransferService } from '../profile/crossProjectTransfer.js';
import {
  BRIEFING_ACTIVE_PROJECT_LIMIT,
  BRIEFING_CLIP_SHORT,
  BRIEFING_COMMITMENT_LIMIT,
  BRIEFING_CONSTRAINT_LIMIT,
  BRIEFING_CONTINUITY_LIMIT,
  BRIEFING_DECISION_LIMIT,
  BRIEFING_IDENTITY_LIMIT,
  BRIEFING_PICK_CONSTRAINTS,
  BRIEFING_PICK_IDENTITY,
  BRIEFING_SUMMARY_LIMIT,
} from '../../tuning.js';
import { BriefingError } from '../../errors.js';
import {
  adaptSectionsByStyle,
  appendPreferenceSummary,
  clip,
  composeActiveProjects,
  composeRecentContinuity,
  dedupe,
  includesProjectSummaryTag,
  normalizeCommunicationStyle,
  optimizeSections,
  resolveTokenTarget,
} from './builder.js';

function nowIso(): string {
  return new Date().toISOString();
}

function pickContent(memories: MemoryItem[], limit: number): string[] {
  return memories.slice(0, limit).map((memory) => clip(memory.content));
}

export interface BriefingBuildOptions {
  sessionId?: string;
  tokenTarget?: number;
  communicationStyle?: 'concise' | 'detailed' | 'structured';
}

function approxTokens(sections: BootBriefing['sections']): number {
  return Math.ceil(JSON.stringify(sections).length / 4);
}

export { normalizeCommunicationStyle } from './builder.js';

export class BriefingService {
  constructor(
    private readonly memoryRepo: MemoryRepository,
    private readonly briefingRepo: BriefingRepository,
    private readonly profileRepo?: ProfileRepository,
    private readonly crossProjectTransferService?: CrossProjectTransferService,
    private readonly preferenceGraphService = new PreferenceGraphService(),
  ) {}

  build(scope: MemoryScope, options?: BriefingBuildOptions): BootBriefing {
    try {
      const identity = this.memoryRepo.search({
        scope,
        types: ['identity'],
        activeOnly: true,
        archived: false,
        limit: BRIEFING_IDENTITY_LIMIT,
      });

      const constraints = this.memoryRepo.search({
        scope,
        types: ['constraint'],
        activeOnly: true,
        archived: false,
        limit: BRIEFING_CONSTRAINT_LIMIT,
      });

      const recentContinuity = this.memoryRepo.search({
        scope,
        lifecycles: ['semantic', 'episodic'],
        activeOnly: true,
        archived: false,
        limit: BRIEFING_CONTINUITY_LIMIT,
      });

      const decisions = this.memoryRepo.search({
        scope,
        types: ['decision'],
        activeOnly: true,
        archived: false,
        limit: BRIEFING_DECISION_LIMIT,
      });

      const commitments = this.memoryRepo.search({
        scope,
        types: ['commitment'],
        activeOnly: true,
        archived: false,
        limit: BRIEFING_COMMITMENT_LIMIT,
      });

      const activeProjects = this.memoryRepo.search({
        scope,
        types: ['project'],
        activeOnly: true,
        archived: false,
        limit: BRIEFING_ACTIVE_PROJECT_LIMIT,
      });

      const summaryMemories = this.memoryRepo.search({
        scope,
        types: ['summary'],
        activeOnly: true,
        archived: false,
        limit: BRIEFING_SUMMARY_LIMIT,
      });
      const projectSummaries = summaryMemories.filter((memory) => includesProjectSummaryTag(memory));
      const communicationStyle = normalizeCommunicationStyle(options?.communicationStyle);
      const inheritedGlobalConstraints = scope.project && scope.userId && this.crossProjectTransferService
        ? this.crossProjectTransferService
          .getGlobalPreferences(scope.userId)
          .filter((preference) => preference.kind === 'explicit_constraint')
          .filter((preference) => this.crossProjectTransferService?.shouldInheritGlobal(preference))
          .slice(0, 3)
          .map((preference) => `[全局] ${clip(preference.content, BRIEFING_CLIP_SHORT)}`)
        : [];

      const tokenTarget = resolveTokenTarget(options?.tokenTarget);
      const rawSections: BootBriefing['sections'] = {
        identity: appendPreferenceSummary(
          pickContent(identity, BRIEFING_PICK_IDENTITY),
          scope,
          this.preferenceGraphService,
          this.profileRepo,
        ),
        constraints: dedupe([
          ...pickContent(constraints, BRIEFING_PICK_CONSTRAINTS),
          ...inheritedGlobalConstraints,
        ]),
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
      const styledSections = adaptSectionsByStyle(optimized.sections, communicationStyle);

      const briefing: BootBriefing = {
        id: randomUUID(),
        sessionId: options?.sessionId,
        userId: scope.userId,
        generatedAt: nowIso(),
        sections: styledSections,
        tokenTarget,
        actualApproxTokens: 0,
        optimization: optimized.stats,
      };

      briefing.actualApproxTokens = approxTokens(briefing.sections);
      this.briefingRepo.save(briefing);
      return briefing;
    } catch (error) {
      if (error instanceof BriefingError) {
        throw error;
      }
      throw new BriefingError('Failed to build boot briefing.', {
        code: 'BRIEFING_BUILD_FAILED',
        context: {
          userId: scope.userId,
          sessionId: options?.sessionId,
          tokenTarget: options?.tokenTarget,
        },
        cause: error,
      });
    }
  }
}
