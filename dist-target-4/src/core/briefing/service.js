import { randomUUID } from 'node:crypto';
import { PreferenceGraphService } from '../profile/preferenceGraph.js';
import { BRIEFING_ACTIVE_PROJECT_LIMIT, BRIEFING_CLIP_SHORT, BRIEFING_COMMITMENT_LIMIT, BRIEFING_CONSTRAINT_LIMIT, BRIEFING_CONTINUITY_LIMIT, BRIEFING_DECISION_LIMIT, BRIEFING_IDENTITY_LIMIT, BRIEFING_PICK_CONSTRAINTS, BRIEFING_PICK_IDENTITY, BRIEFING_SUMMARY_LIMIT, } from '../../tuning.js';
import { BriefingError } from '../../errors.js';
import { adaptSectionsByStyle, appendPreferenceSummary, clip, composeActiveProjects, composeRecentContinuity, dedupe, includesProjectSummaryTag, normalizeCommunicationStyle, optimizeSections, resolveTokenTarget, } from './builder.js';
function nowIso() {
    return new Date().toISOString();
}
function pickContent(memories, limit) {
    return memories.slice(0, limit).map((memory) => clip(memory.content));
}
function approxTokens(sections) {
    return Math.ceil(JSON.stringify(sections).length / 4);
}
export { normalizeCommunicationStyle } from './builder.js';
export class BriefingService {
    memoryRepo;
    briefingRepo;
    profileRepo;
    crossProjectTransferService;
    preferenceGraphService;
    constructor(memoryRepo, briefingRepo, profileRepo, crossProjectTransferService, preferenceGraphService = new PreferenceGraphService()) {
        this.memoryRepo = memoryRepo;
        this.briefingRepo = briefingRepo;
        this.profileRepo = profileRepo;
        this.crossProjectTransferService = crossProjectTransferService;
        this.preferenceGraphService = preferenceGraphService;
    }
    build(scope, options) {
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
            const rawSections = {
                identity: appendPreferenceSummary(pickContent(identity, BRIEFING_PICK_IDENTITY), scope, this.preferenceGraphService, this.profileRepo),
                constraints: dedupe([
                    ...pickContent(constraints, BRIEFING_PICK_CONSTRAINTS),
                    ...inheritedGlobalConstraints,
                ]),
                recentContinuity: composeRecentContinuity(recentContinuity, decisions, commitments),
                activeProjects: composeActiveProjects(scope, projectSummaries, activeProjects, constraints, decisions, commitments),
            };
            const optimized = optimizeSections(rawSections, tokenTarget);
            const styledSections = adaptSectionsByStyle(optimized.sections, communicationStyle);
            const briefing = {
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
            // C1: Compute briefing quality score
            const sectionKeys = ['identity', 'constraints', 'recentContinuity', 'activeProjects'];
            const emptySections = sectionKeys.filter((key) => briefing.sections[key].length === 0);
            const nonEmptyCount = sectionKeys.length - emptySections.length;
            const qualityScore = Number((nonEmptyCount / sectionKeys.length).toFixed(2));
            const qualityLabel = qualityScore >= 0.75 ? 'excellent'
                : qualityScore >= 0.5 ? 'good'
                    : qualityScore >= 0.25 ? 'fair'
                        : 'low';
            const nudge = qualityScore < 0.5
                ? 'Run `evermemory_store` to record your current project context for better continuity.'
                : null;
            briefing.quality = { qualityScore, qualityLabel, emptySections, nudge };
            // D3: Compute Session Continuity Score
            const filledSections = nonEmptyCount;
            const totalSections = sectionKeys.length;
            const continuityRaw = filledSections / totalSections;
            const continuityLabel = continuityRaw >= 0.75 ? 'rich'
                : continuityRaw >= 0.5 ? 'moderate'
                    : continuityRaw > 0 ? 'sparse'
                        : 'empty';
            briefing.continuityScore = {
                score: Number(continuityRaw.toFixed(2)),
                label: continuityLabel,
                filledSections,
                totalSections,
            };
            this.briefingRepo.save(briefing);
            return briefing;
        }
        catch (error) {
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
