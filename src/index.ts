import { randomUUID } from 'node:crypto';
import { PLUGIN_NAME, PLUGIN_VERSION } from './constants.js';
import { getDefaultConfig as loadDefaultConfig, loadConfig } from './config.js';
import type { EverMemoryConfigInput } from './config.js';
import { BehaviorService } from './core/behavior/service.js';
import { BriefingService } from './core/briefing/service.js';
import { SmartnessMetricsService } from './core/analytics/smartnessMetrics.js';
import { IntentService } from './core/intent/service.js';
import { MemoryExportService } from './core/io/exportService.js';
import { MemoryArchiveService } from './core/memory/archive.js';
import { MemoryCompressionService } from './core/memory/compression.js';
import { ContradictionMonitor } from './core/memory/contradictionMonitor.js';
import { MemoryHousekeepingService } from './core/memory/housekeeping.js';
import { MemoryLifecycleService } from './core/memory/lifecycle.js';
import { MicroReflectionService } from './core/memory/microReflection.js';
import { PredictiveContextService } from './core/memory/predictiveContext.js';
import { ProactiveAlertsService } from './core/memory/proactiveAlerts.js';
import { ProactiveRecallService } from './core/memory/proactiveRecall.js';
import { ProgressiveConsolidationService } from './core/memory/progressiveConsolidation.js';
import { RelationDetectionService } from './core/memory/relationDetection.js';
import { MemoryService } from './core/memory/service.js';
import { SelfTuningDecayService } from './core/memory/selfTuningDecay.js';
import { MemoryTransferService } from './core/memory/transfer.js';
import { OnboardingService } from './core/profile/onboarding.js';
import { CrossProjectTransferService } from './core/profile/crossProjectTransfer.js';
import { DriftDetectionService } from './core/profile/driftDetection.js';
import { ProfileProjectionService } from './core/profile/projection.js';
import { ExperienceService } from './core/reflection/experience.js';
import { ReflectionService } from './core/reflection/service.js';
import { handleMessageReceived } from './hooks/messageReceived.js';
import { handleSessionEnd } from './hooks/sessionEnd.js';
import { handleSessionStart } from './hooks/sessionStart.js';
import { embeddingManager } from './embedding/manager.js';
import { AdaptiveWeightsService } from './retrieval/adaptiveWeights.js';
import { RetrievalService } from './retrieval/service.js';
import { getInteractionContext, getSessionContext } from './runtime/context.js';
import { BehaviorRepository } from './storage/behaviorRepo.js';
import { BriefingRepository } from './storage/briefingRepo.js';
import { openDatabase } from './storage/db.js';
import { DebugRepository } from './storage/debugRepo.js';
import { ExperienceRepository } from './storage/experienceRepo.js';
import { IntentRepository } from './storage/intentRepo.js';
import { runMigrations } from './storage/migrations.js';
import { MemoryRepository } from './storage/memoryRepo.js';
import { ProfileRepository } from './storage/profileRepo.js';
import { FeedbackRepository } from './storage/feedbackRepo.js';
import { ReflectionRepository } from './storage/reflectionRepo.js';
import { RelationRepository } from './storage/relationRepo.js';
import { SemanticRepository } from './storage/semanticRepo.js';
import {
  evermemoryBriefing,
  evermemoryBrowse,
  evermemoryConsolidate,
  evermemoryEdit,
  evermemoryExplain,
  evermemoryExport,
  evermemoryImport,
  evermemoryIntent,
  evermemoryOnboard,
  evermemoryProfile,
  evermemoryRecall,
  evermemoryRelations,
  evermemoryRestore,
  evermemoryReflect,
  evermemoryReview,
  evermemoryRules,
  evermemorySmartness,
  evermemoryStatus,
  evermemoryStore,
} from './tools/index.js';
import type {
  EverMemoryBriefingToolInput,
  EverMemoryConsolidateToolInput,
  EverMemoryConsolidateToolResult,
  EverMemoryConfig,
  EverMemoryExportToolInput,
  EverMemoryExportToolResult,
  EverMemoryExplainToolInput,
  EverMemoryExplainToolResult,
  EverMemoryImportToolInput,
  EverMemoryImportToolResult,
  EverMemoryIntentToolInput,
  EverMemoryOnboardingToolInput,
  EverMemoryOnboardingToolResult,
  EverMemoryPluginDefinition,
  EverMemoryProfileToolInput,
  EverMemoryProfileToolResult,
  EverMemoryRecallToolInput,
  EverMemoryRestoreToolInput,
  EverMemoryRestoreToolResult,
  EverMemoryReflectToolInput,
  EverMemoryReflectToolResult,
  EverMemoryReviewToolInput,
  EverMemoryReviewToolResult,
  EverMemoryRulesToolInput,
  EverMemoryRulesToolResult,
  EverMemorySmartnessToolInput,
  EverMemoryStatusToolResult,
  EverMemoryStoreToolInput,
  IntentLLMAnalyzer,
  IntentAnalyzeInput,
  IntentRecord,
  MemoryScope,
  MessageReceivedInput,
  MessageReceivedResult,
  SessionEndInput,
  SessionEndResult,
  SessionStartInput,
  SessionStartResult,
  ProjectedProfile,
  RuntimeUserProfile,
} from './types.js';
import type { EverMemoryEditToolInput, EverMemoryEditToolResult } from './tools/edit.js';
import type { EverMemoryBrowseToolInput, EverMemoryBrowseToolResult } from './tools/browse.js';
import type { EverMemoryRelationsToolInput, EverMemoryRelationsToolResult } from './tools/relations.js';

export * from './errors.js';
export * from './core/io/exportService.js';

export interface InitializeEverMemoryOptions {
  intentLLMAnalyzer?: IntentLLMAnalyzer;
}

function toRuntimeUserProfile(profile: ProjectedProfile | null): RuntimeUserProfile | undefined {
  if (!profile) {
    return undefined;
  }

  return {
    communicationStyle: profile.derived.communicationStyle?.tendency,
    likelyInterests: profile.derived.likelyInterests.map((item) => item.value),
    workPatterns: profile.derived.workPatterns.map((item) => item.value),
    explicitPreferences: Object.freeze(Object.fromEntries(
      Object.entries(profile.stable.explicitPreferences).map(([key, value]) => [key, value.value]),
    )),
    displayName: profile.stable.displayName?.value,
  };
}

export const defaultConfig = loadDefaultConfig();

export const plugin: EverMemoryPluginDefinition = {
  name: PLUGIN_NAME,
  version: PLUGIN_VERSION,
  description: 'EverMemory deterministic memory plugin',
};

export function getPluginDefinition(): EverMemoryPluginDefinition {
  return plugin;
}

export function getDefaultConfig(): EverMemoryConfig {
  return { ...defaultConfig };
}

function logEmbeddingInitStatus(
  debugRepo: DebugRepository,
  payload: Record<string, unknown>,
): void {
  try {
    debugRepo.log('embedding_init_status', undefined, payload);
  } catch (error) {
    console.warn('[EverMemory] Failed to log embedding init status.', error);
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function createDisabledBriefing(input: SessionStartInput, tokenTarget: number) {
  return {
    id: randomUUID(),
    sessionId: input.sessionId,
    userId: input.userId,
    generatedAt: nowIso(),
    sections: { identity: [], constraints: [], recentContinuity: [], activeProjects: [] },
    tokenTarget,
    actualApproxTokens: 0,
    optimization: { duplicateBlocksRemoved: 0, tokenPrunedBlocks: 0, highValueBlocksKept: 0 },
  };
}

function createDisabledIntent(input: MessageReceivedInput): IntentRecord {
  return {
    id: randomUUID(),
    sessionId: input.sessionId,
    messageId: input.messageId,
    createdAt: nowIso(),
    rawText: input.text,
    intent: { type: 'other', confidence: 1 },
    signals: {
      urgency: 'low',
      emotionalTone: 'neutral',
      actionNeed: 'none',
      memoryNeed: 'none',
      preferenceRelevance: 0,
      correctionSignal: 0,
    },
    entities: [],
    retrievalHints: {
      preferredTypes: [],
      preferredScopes: [],
      preferredTimeBias: 'balanced',
    },
  };
}

function createDisabledExperience(input: SessionEndInput) {
  return {
    id: randomUUID(),
    sessionId: input.sessionId,
    messageId: input.messageId,
    createdAt: nowIso(),
    inputSummary: input.inputText ?? '',
    actionSummary: input.actionSummary ?? '',
    outcomeSummary: input.outcomeSummary,
    indicators: {
      userCorrection: false,
      userApproval: false,
      hesitation: false,
      externalActionRisk: false,
      repeatMistakeSignal: false,
    },
    evidenceRefs: input.evidenceRefs ?? [],
  };
}

export function initializeEverMemory(
  configInput: EverMemoryConfigInput = {},
  options: InitializeEverMemoryOptions = {},
) {
  const config = loadConfig(configInput);
  let disposed = false;
  const provider = (process.env.EVERMEMORY_EMBEDDING_PROVIDER ?? 'local') as
    | 'local'
    | 'openai'
    | 'none';
  const database = openDatabase(config.databasePath);
  const originalClose = database.connection.close.bind(database.connection);
  (database.connection as typeof database.connection & { close: typeof originalClose }).close = (() => {
    disposed = true;
    return originalClose();
  }) as typeof originalClose;
  runMigrations(database.connection, database.path);

  const memoryRepo = new MemoryRepository(database.connection);
  const briefingRepo = new BriefingRepository(database.connection);
  const debugRepo = new DebugRepository(database.connection, config.debugEnabled);
  const logWarmupStatus = (payload: Record<string, unknown>) => {
    if (disposed) {
      return;
    }
    logEmbeddingInitStatus(debugRepo, payload);
  };
  const intentRepo = new IntentRepository(database.connection);
  const experienceRepo = new ExperienceRepository(database.connection);
  const reflectionRepo = new ReflectionRepository(database.connection);
  const behaviorRepo = new BehaviorRepository(database.connection);
  const semanticRepo = new SemanticRepository(database.connection);
  const relationRepo = new RelationRepository(database.connection);
  const feedbackRepo = new FeedbackRepository(database.connection);
  const profileRepo = new ProfileRepository(database.connection);
  embeddingManager.configure({
    provider,
    onInitProgress: (stage, detail) => {
      logWarmupStatus({
        provider,
        stage,
        detail,
      });
    },
    onDebugEvent: (payload) => {
      logWarmupStatus({
        provider,
        ...payload,
      });
    },
  });

  const profileService = new ProfileProjectionService(
    memoryRepo,
    behaviorRepo,
    profileRepo,
    debugRepo,
  );
  const lifecycleService = new MemoryLifecycleService(memoryRepo, debugRepo);
  const crossProjectTransferService = new CrossProjectTransferService(memoryRepo);
  const relationDetectionService = new RelationDetectionService(
    relationRepo,
    semanticRepo,
    memoryRepo,
    debugRepo,
  );
  const memoryService = new MemoryService(memoryRepo, debugRepo, {
    semanticEnabled: config.semantic.enabled,
    semanticRepo,
    lifecycleService,
    profileProjectionService: profileService,
    relationDetectionService,
  });
  const microReflectionService = new MicroReflectionService(feedbackRepo);
  const contradictionMonitor = new ContradictionMonitor(relationRepo, memoryRepo, debugRepo);
  const proactiveRecallService = new ProactiveRecallService(relationRepo, memoryRepo);
  const adaptiveWeightsService = new AdaptiveWeightsService(feedbackRepo);
  const compressionService = new MemoryCompressionService(memoryRepo, relationRepo, debugRepo);
  const predictiveContextService = new PredictiveContextService(intentRepo, memoryRepo);
  const proactiveAlertsService = new ProactiveAlertsService(memoryRepo);
  const selfTuningDecayService = new SelfTuningDecayService(feedbackRepo, database.connection, debugRepo);
  const progressiveConsolidationService = new ProgressiveConsolidationService(compressionService, memoryRepo);
  const driftDetectionService = new DriftDetectionService(database.connection, debugRepo);
  const housekeepingService = new MemoryHousekeepingService(
    memoryRepo,
    lifecycleService,
    undefined,
    debugRepo,
    database,
    semanticRepo,
  );
  const smartnessMetricsService = new SmartnessMetricsService(memoryRepo, debugRepo);
  const onboardingService = new OnboardingService(
    memoryService,
    memoryRepo,
    profileRepo,
    smartnessMetricsService,
  );
  const retrievalService = new RetrievalService(memoryRepo, debugRepo, {
    semanticEnabled: config.semantic.enabled,
    semanticRepo,
    semanticCandidateLimit: config.semantic.maxCandidates,
    semanticMinScore: config.semantic.minScore,
    maxRecall: config.maxRecall,
    keywordWeights: config.retrieval.keywordWeights,
    hybridWeights: config.retrieval.hybridWeights,
    relationRepo,
  });
  const briefingService = new BriefingService(
    memoryRepo,
    briefingRepo,
    profileRepo,
    crossProjectTransferService,
  );
  const intentService = new IntentService(intentRepo, debugRepo, {
    useLLM: config.intent.useLLM,
    fallbackHeuristics: config.intent.fallbackHeuristics,
    llmAnalyzer: options.intentLLMAnalyzer,
  });
  const experienceService = new ExperienceService(experienceRepo, debugRepo);
  const reflectionService = new ReflectionService(experienceRepo, reflectionRepo, debugRepo);
  const behaviorService = new BehaviorService(behaviorRepo, reflectionRepo, debugRepo);
  const transferService = new MemoryTransferService(memoryRepo, debugRepo, {
    semanticEnabled: config.semantic.enabled,
    semanticRepo,
    profileService,
  });
  const exportService = new MemoryExportService(memoryRepo);
  const archiveService = new MemoryArchiveService(memoryRepo, debugRepo, {
    semanticEnabled: config.semantic.enabled,
    semanticRepo,
    profileService,
  });

  // 2A: Embedding warmup on plugin start
  const warmupPromise = (async () => {
    try {
      const warmupResult = await embeddingManager.warmup();
      logWarmupStatus({
        provider: warmupResult.provider,
        isReady: warmupResult.ready,
        elapsedMs: warmupResult.elapsedMs,
      });
    } catch (error) {
      logWarmupStatus({
        provider,
        stage: 'warmup_error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  return {
    config,
    database,
    memoryRepo,
    briefingRepo,
    debugRepo,
    intentRepo,
    experienceRepo,
    reflectionRepo,
    behaviorRepo,
    semanticRepo,
    relationRepo,
    feedbackRepo,
    profileRepo,
    memoryService,
    relationDetectionService,
    microReflectionService,
    contradictionMonitor,
    proactiveRecallService,
    adaptiveWeightsService,
    compressionService,
    predictiveContextService,
    proactiveAlertsService,
    selfTuningDecayService,
    progressiveConsolidationService,
    driftDetectionService,
    housekeepingService,
    retrievalService,
    briefingService,
    intentService,
    experienceService,
    reflectionService,
    behaviorService,
    profileService,
    crossProjectTransferService,
    onboardingService,
    transferService,
    archiveService,
    smartnessMetricsService,
    sessionStart(input: SessionStartInput): SessionStartResult {
      if (!config.enabled) {
        return {
          sessionId: input.sessionId,
          scope: {
            userId: input.userId,
            chatId: input.chatId,
            project: input.project,
          },
          briefing: createDisabledBriefing(input, config.bootTokenBudget),
          behaviorRules: [],
        };
      }
      return handleSessionStart(
        input,
        briefingService,
        behaviorService,
        debugRepo,
        profileRepo,
        predictiveContextService,
        config.bootTokenBudget,
      );
    },
    getRuntimeSessionContext(sessionId: string) {
      return getSessionContext(sessionId);
    },
    getRuntimeInteractionContext(sessionId: string) {
      return getInteractionContext(sessionId);
    },
    evermemoryStore(input: EverMemoryStoreToolInput) {
      return evermemoryStore(memoryService, input);
    },
    async evermemoryRecall(input: EverMemoryRecallToolInput) {
      return evermemoryRecall(retrievalService, input);
    },
    evermemoryBriefing(input: EverMemoryBriefingToolInput = {}) {
      return evermemoryBriefing(briefingService, input);
    },
    analyzeIntent(input: IntentAnalyzeInput): IntentRecord {
      return intentService.analyze(input);
    },
    async messageReceived(input: MessageReceivedInput): Promise<MessageReceivedResult> {
      if (!config.enabled) {
        return {
          sessionId: input.sessionId,
          messageId: input.messageId,
          intent: createDisabledIntent(input),
          recall: {
            items: [],
            total: 0,
            limit: input.recallLimit ?? config.maxRecall,
          },
          behaviorRules: [],
        };
      }
      const userProfile = input.scope?.userId
        ? toRuntimeUserProfile(profileService.getByUserId(input.scope.userId))
        : undefined;
      return handleMessageReceived(input, {
        intentService,
        behaviorService,
        retrievalService,
        debugRepo,
        semanticRepo,
        memoryRepo,
        proactiveRecallService,
        contradictionMonitor,
        userProfile,
        progressiveConsolidationService,
      });
    },
    async sessionEnd(input: SessionEndInput): Promise<SessionEndResult> {
      if (!config.enabled) {
        return {
          sessionId: input.sessionId,
          experience: createDisabledExperience(input),
          promotedRules: [],
          learningInsights: 0,
          autoPromotedRules: 0,
          staleDemotedRules: 0,
          profileUpdated: false,
          autoMemory: {
            generated: 0,
            accepted: 0,
            rejected: 0,
            storedIds: [],
            rejectedReasons: [],
          },
        };
      }
      return handleSessionEnd(input, {
        experienceService,
        reflectionService,
        behaviorService,
        memoryService,
        debugRepo,
        semanticRepo,
        memoryRepo,
        profileProjection: profileService,
        housekeepingService,
        profileRepo,
        selfTuningDecayService,
        driftDetectionService,
        progressiveConsolidationService,
        predictiveContextService,
        contradictionMonitor,
        relationDetectionService,
      });
    },
    async housekeeping(scope: { userId?: string; chatId?: string; project?: string; global?: boolean }) {
      return housekeepingService.run(scope);
    },
    evermemoryIntent(input: EverMemoryIntentToolInput) {
      return evermemoryIntent(intentService, input);
    },
    evermemoryReflect(input: EverMemoryReflectToolInput = {}): EverMemoryReflectToolResult {
      return evermemoryReflect(reflectionService, experienceRepo, input);
    },
    evermemoryRules(input: EverMemoryRulesToolInput = {}): EverMemoryRulesToolResult {
      return evermemoryRules(behaviorService, input);
    },
    evermemoryProfile(input: EverMemoryProfileToolInput = {}): EverMemoryProfileToolResult {
      return evermemoryProfile(profileService, profileRepo, input);
    },
    async evermemoryOnboard(input: EverMemoryOnboardingToolInput): Promise<EverMemoryOnboardingToolResult> {
      return evermemoryOnboard(onboardingService, input);
    },
    async evermemoryConsolidate(input: EverMemoryConsolidateToolInput = {}): Promise<EverMemoryConsolidateToolResult> {
      return evermemoryConsolidate(memoryService, memoryRepo, semanticRepo, input);
    },
    evermemoryExplain(input: EverMemoryExplainToolInput = {}): EverMemoryExplainToolResult {
      return evermemoryExplain(debugRepo, input);
    },
    evermemoryExport(input: EverMemoryExportToolInput = {}): EverMemoryExportToolResult {
      return evermemoryExport(transferService, input);
    },
    evermemoryImport(input: EverMemoryImportToolInput): EverMemoryImportToolResult {
      return evermemoryImport(transferService, input);
    },
    export(
      format: 'json' | 'markdown',
      scope?: MemoryScope,
      options: { includeArchived?: boolean; limit?: number } = {},
    ) {
      return exportService.export({ format, scope, ...options });
    },
    import(content: string, format: 'json' | 'markdown', scope: MemoryScope) {
      return exportService.import(content, format, scope);
    },
    evermemoryReview(input: EverMemoryReviewToolInput = {}): EverMemoryReviewToolResult {
      return evermemoryReview(archiveService, behaviorService, input);
    },
    evermemoryRestore(input: EverMemoryRestoreToolInput): EverMemoryRestoreToolResult {
      return evermemoryRestore(archiveService, input);
    },
    async evermemoryEdit(input: EverMemoryEditToolInput, callerScope?: MemoryScope): Promise<EverMemoryEditToolResult> {
      return evermemoryEdit(memoryRepo, debugRepo, semanticRepo, input, callerScope);
    },
    evermemoryBrowse(input: EverMemoryBrowseToolInput = {}): EverMemoryBrowseToolResult {
      return evermemoryBrowse(memoryRepo, input);
    },
    evermemoryRelations(input: EverMemoryRelationsToolInput): EverMemoryRelationsToolResult {
      return evermemoryRelations(relationRepo, input, debugRepo);
    },
    evermemoryStatus(input: { userId?: string; sessionId?: string } = {}): EverMemoryStatusToolResult {
      return evermemoryStatus({
        database,
        memoryRepo,
        briefingRepo,
        debugRepo,
        experienceRepo,
        reflectionRepo,
        behaviorRepo,
        semanticRepo,
        profileRepo,
        runtimeSession: input.sessionId ? getSessionContext(input.sessionId) : undefined,
        userId: input.userId,
        sessionId: input.sessionId,
      });
    },
    async evermemorySmartness(input: EverMemorySmartnessToolInput = {}): Promise<string> {
      return evermemorySmartness({
        smartnessMetricsService,
        userId: input.userId,
      });
    },
    async dispose(): Promise<void> {
      disposed = true;
      await warmupPromise.catch(() => undefined);
      if (database.connection.open) {
        database.connection.close();
      }
    },
  };
}
