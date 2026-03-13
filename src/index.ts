import { PLUGIN_NAME, PLUGIN_VERSION } from './constants.js';
import { getDefaultConfig as loadDefaultConfig, loadConfig } from './config.js';
import type { EverMemoryConfigInput } from './config.js';
import { BehaviorService } from './core/behavior/service.js';
import { BriefingService } from './core/briefing/service.js';
import { IntentService } from './core/intent/service.js';
import { MemoryArchiveService } from './core/memory/archive.js';
import { MemoryService } from './core/memory/service.js';
import { MemoryTransferService } from './core/memory/transfer.js';
import { ProfileProjectionService } from './core/profile/projection.js';
import { ExperienceService } from './core/reflection/experience.js';
import { ReflectionService } from './core/reflection/service.js';
import { handleMessageReceived } from './hooks/messageReceived.js';
import { handleSessionEnd } from './hooks/sessionEnd.js';
import { handleSessionStart } from './hooks/sessionStart.js';
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
import {
  evermemoryBriefing,
  evermemoryConsolidate,
  evermemoryExplain,
  evermemoryExport,
  evermemoryImport,
  evermemoryIntent,
  evermemoryProfile,
  evermemoryRecall,
  evermemoryRestore,
  evermemoryReflect,
  evermemoryReview,
  evermemoryRules,
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
  EverMemoryStatusToolResult,
  EverMemoryStoreToolInput,
  IntentLLMAnalyzer,
  IntentAnalyzeInput,
  IntentRecord,
  MessageReceivedInput,
  MessageReceivedResult,
  SessionEndInput,
  SessionEndResult,
  SessionStartInput,
  SessionStartResult,
} from './types.js';

export interface InitializeEverMemoryOptions {
  intentLLMAnalyzer?: IntentLLMAnalyzer;
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

export function initializeEverMemory(
  configInput: EverMemoryConfigInput = {},
  options: InitializeEverMemoryOptions = {},
) {
  const config = loadConfig(configInput);
  const database = openDatabase(config.databasePath);
  runMigrations(database.connection);

  const memoryRepo = new MemoryRepository(database.connection);
  const briefingRepo = new BriefingRepository(database.connection);
  const debugRepo = new DebugRepository(database.connection);
  const intentRepo = new IntentRepository(database.connection);
  const experienceRepo = new ExperienceRepository(database.connection);
  const reflectionRepo = new ReflectionRepository(database.connection);
  const behaviorRepo = new BehaviorRepository(database.connection);
  const semanticRepo = new SemanticRepository(database.connection);
  const profileRepo = new ProfileRepository(database.connection);

  const profileService = new ProfileProjectionService(
    memoryRepo,
    behaviorRepo,
    profileRepo,
    debugRepo,
  );
  const memoryService = new MemoryService(memoryRepo, debugRepo, {
    semanticEnabled: config.semantic.enabled,
    semanticRepo,
    profileProjectionService: profileService,
  });
  const retrievalService = new RetrievalService(memoryRepo, debugRepo, {
    semanticEnabled: config.semantic.enabled,
    semanticRepo,
    semanticCandidateLimit: config.semantic.maxCandidates,
    semanticMinScore: config.semantic.minScore,
    maxRecall: config.maxRecall,
    keywordWeights: config.retrieval.keywordWeights,
    hybridWeights: config.retrieval.hybridWeights,
  });
  const briefingService = new BriefingService(memoryRepo, briefingRepo);
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
  const archiveService = new MemoryArchiveService(memoryRepo, debugRepo, {
    semanticEnabled: config.semantic.enabled,
    semanticRepo,
    profileService,
  });

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
    retrievalService,
    briefingService,
    intentService,
    experienceService,
    reflectionService,
    behaviorService,
    profileService,
    transferService,
    archiveService,
    sessionStart(input: SessionStartInput): SessionStartResult {
      return handleSessionStart(input, briefingService, behaviorService, debugRepo);
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
    evermemoryRecall(input: EverMemoryRecallToolInput) {
      return evermemoryRecall(retrievalService, input);
    },
    evermemoryBriefing(input: EverMemoryBriefingToolInput = {}) {
      return evermemoryBriefing(briefingService, input);
    },
    analyzeIntent(input: IntentAnalyzeInput): IntentRecord {
      return intentService.analyze(input);
    },
    messageReceived(input: MessageReceivedInput): MessageReceivedResult {
      return handleMessageReceived(input, intentService, behaviorService, retrievalService, debugRepo);
    },
    sessionEnd(input: SessionEndInput): SessionEndResult {
      return handleSessionEnd(
        input,
        experienceService,
        reflectionService,
        behaviorService,
        memoryService,
        debugRepo,
      );
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
    evermemoryConsolidate(input: EverMemoryConsolidateToolInput = {}): EverMemoryConsolidateToolResult {
      return evermemoryConsolidate(memoryService, input);
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
    evermemoryReview(input: EverMemoryReviewToolInput = {}): EverMemoryReviewToolResult {
      return evermemoryReview(archiveService, behaviorService, input);
    },
    evermemoryRestore(input: EverMemoryRestoreToolInput): EverMemoryRestoreToolResult {
      return evermemoryRestore(archiveService, input);
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
  };
}
