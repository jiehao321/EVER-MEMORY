import { PLUGIN_NAME, PLUGIN_VERSION } from './constants.js';
import { getDefaultConfig as loadDefaultConfig, loadConfig } from './config.js';
import { BehaviorService } from './core/behavior/service.js';
import { BriefingService } from './core/briefing/service.js';
import { SmartnessMetricsService } from './core/analytics/smartnessMetrics.js';
import { IntentService } from './core/intent/service.js';
import { MemoryExportService } from './core/io/exportService.js';
import { MemoryArchiveService } from './core/memory/archive.js';
import { MemoryHousekeepingService } from './core/memory/housekeeping.js';
import { MemoryLifecycleService } from './core/memory/lifecycle.js';
import { MemoryService } from './core/memory/service.js';
import { MemoryTransferService } from './core/memory/transfer.js';
import { OnboardingService } from './core/profile/onboarding.js';
import { CrossProjectTransferService } from './core/profile/crossProjectTransfer.js';
import { ProfileProjectionService } from './core/profile/projection.js';
import { ExperienceService } from './core/reflection/experience.js';
import { ReflectionService } from './core/reflection/service.js';
import { handleMessageReceived } from './hooks/messageReceived.js';
import { handleSessionEnd } from './hooks/sessionEnd.js';
import { handleSessionStart } from './hooks/sessionStart.js';
import { embeddingManager } from './embedding/manager.js';
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
import { ReflectionRepository } from './storage/reflectionRepo.js';
import { SemanticRepository } from './storage/semanticRepo.js';
import { evermemoryBriefing, evermemoryBrowse, evermemoryConsolidate, evermemoryEdit, evermemoryExplain, evermemoryExport, evermemoryImport, evermemoryIntent, evermemoryOnboard, evermemoryProfile, evermemoryRecall, evermemoryRestore, evermemoryReflect, evermemoryReview, evermemoryRules, evermemorySmartness, evermemoryStatus, evermemoryStore, } from './tools/index.js';
export * from './errors.js';
export * from './core/io/exportService.js';
export const defaultConfig = loadDefaultConfig();
export const plugin = {
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    description: 'EverMemory deterministic memory plugin',
};
export function getPluginDefinition() {
    return plugin;
}
export function getDefaultConfig() {
    return { ...defaultConfig };
}
export function initializeEverMemory(configInput = {}, options = {}) {
    const config = loadConfig(configInput);
    const provider = (process.env.EVERMEMORY_EMBEDDING_PROVIDER ?? 'local');
    const database = openDatabase(config.databasePath);
    runMigrations(database.connection, database.path);
    const memoryRepo = new MemoryRepository(database.connection);
    const briefingRepo = new BriefingRepository(database.connection);
    const debugRepo = new DebugRepository(database.connection);
    const intentRepo = new IntentRepository(database.connection);
    const experienceRepo = new ExperienceRepository(database.connection);
    const reflectionRepo = new ReflectionRepository(database.connection);
    const behaviorRepo = new BehaviorRepository(database.connection);
    const semanticRepo = new SemanticRepository(database.connection);
    const profileRepo = new ProfileRepository(database.connection);
    embeddingManager.configure({
        provider,
        onInitProgress: (stage, detail) => {
            debugRepo.log('embedding_init_status', undefined, {
                provider,
                stage,
                detail,
            });
        },
        onDebugEvent: (payload) => {
            debugRepo.log('embedding_init_status', undefined, {
                provider,
                ...payload,
            });
        },
    });
    const profileService = new ProfileProjectionService(memoryRepo, behaviorRepo, profileRepo, debugRepo);
    const lifecycleService = new MemoryLifecycleService(memoryRepo, debugRepo);
    const crossProjectTransferService = new CrossProjectTransferService(memoryRepo);
    const memoryService = new MemoryService(memoryRepo, debugRepo, {
        semanticEnabled: config.semantic.enabled,
        semanticRepo,
        lifecycleService,
        profileProjectionService: profileService,
    });
    const housekeepingService = new MemoryHousekeepingService(memoryRepo, lifecycleService, undefined, debugRepo, database, semanticRepo);
    const smartnessMetricsService = new SmartnessMetricsService(memoryRepo, debugRepo);
    const onboardingService = new OnboardingService(memoryService, memoryRepo, profileRepo, smartnessMetricsService);
    const retrievalService = new RetrievalService(memoryRepo, debugRepo, {
        semanticEnabled: config.semantic.enabled,
        semanticRepo,
        semanticCandidateLimit: config.semantic.maxCandidates,
        semanticMinScore: config.semantic.minScore,
        maxRecall: config.maxRecall,
        keywordWeights: config.retrieval.keywordWeights,
        hybridWeights: config.retrieval.hybridWeights,
    });
    const briefingService = new BriefingService(memoryRepo, briefingRepo, profileRepo, crossProjectTransferService);
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
    void (async () => {
        try {
            const warmupResult = await embeddingManager.warmup();
            debugRepo.log('embedding_init_status', undefined, {
                provider: warmupResult.provider,
                isReady: warmupResult.ready,
                elapsedMs: warmupResult.elapsedMs,
            });
        }
        catch (error) {
            debugRepo.log('embedding_init_status', undefined, {
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
        profileRepo,
        memoryService,
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
        sessionStart(input) {
            return handleSessionStart(input, briefingService, behaviorService, debugRepo, profileRepo);
        },
        getRuntimeSessionContext(sessionId) {
            return getSessionContext(sessionId);
        },
        getRuntimeInteractionContext(sessionId) {
            return getInteractionContext(sessionId);
        },
        evermemoryStore(input) {
            return evermemoryStore(memoryService, input);
        },
        async evermemoryRecall(input) {
            return evermemoryRecall(retrievalService, input);
        },
        evermemoryBriefing(input = {}) {
            return evermemoryBriefing(briefingService, input);
        },
        analyzeIntent(input) {
            return intentService.analyze(input);
        },
        async messageReceived(input) {
            return handleMessageReceived(input, intentService, behaviorService, retrievalService, debugRepo, semanticRepo, memoryRepo);
        },
        async sessionEnd(input) {
            return handleSessionEnd(input, experienceService, reflectionService, behaviorService, memoryService, debugRepo, semanticRepo, memoryRepo, profileService, housekeepingService);
        },
        async housekeeping(scope) {
            return housekeepingService.run(scope);
        },
        evermemoryIntent(input) {
            return evermemoryIntent(intentService, input);
        },
        evermemoryReflect(input = {}) {
            return evermemoryReflect(reflectionService, experienceRepo, input);
        },
        evermemoryRules(input = {}) {
            return evermemoryRules(behaviorService, input);
        },
        evermemoryProfile(input = {}) {
            return evermemoryProfile(profileService, profileRepo, input);
        },
        async evermemoryOnboard(input) {
            return evermemoryOnboard(onboardingService, input);
        },
        async evermemoryConsolidate(input = {}) {
            return evermemoryConsolidate(memoryService, memoryRepo, semanticRepo, input);
        },
        evermemoryExplain(input = {}) {
            return evermemoryExplain(debugRepo, input);
        },
        evermemoryExport(input = {}) {
            return evermemoryExport(transferService, input);
        },
        evermemoryImport(input) {
            return evermemoryImport(transferService, input);
        },
        export(format, scope, options = {}) {
            return exportService.export({ format, scope, ...options });
        },
        import(content, format, scope) {
            return exportService.import(content, format, scope);
        },
        evermemoryReview(input = {}) {
            return evermemoryReview(archiveService, behaviorService, input);
        },
        evermemoryRestore(input) {
            return evermemoryRestore(archiveService, input);
        },
        async evermemoryEdit(input, callerScope) {
            return evermemoryEdit(memoryRepo, debugRepo, semanticRepo, input, callerScope);
        },
        evermemoryBrowse(input = {}) {
            return evermemoryBrowse(memoryRepo, input);
        },
        evermemoryStatus(input = {}) {
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
        async evermemorySmartness(input = {}) {
            return evermemorySmartness({
                smartnessMetricsService,
                userId: input.userId,
            });
        },
    };
}
