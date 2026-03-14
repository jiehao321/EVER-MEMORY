import { randomUUID } from 'node:crypto';
import { analyzeIntentHeuristics } from './heuristics.js';
import { parseIntentEnrichment } from './parser.js';
import { buildIntentEnrichPrompt } from './prompt.js';
import type { DebugRepository } from '../../storage/debugRepo.js';
import type { IntentRepository } from '../../storage/intentRepo.js';
import type { IntentAnalyzeInput, IntentLLMAnalyzer, IntentRecord } from '../../types.js';

interface IntentServiceOptions {
  useLLM?: boolean;
  fallbackHeuristics?: boolean;
  llmAnalyzer?: IntentLLMAnalyzer;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class IntentService {
  private readonly useLLM: boolean;
  private readonly fallbackHeuristics: boolean;
  private readonly llmAnalyzer?: IntentLLMAnalyzer;

  constructor(
    private readonly intentRepo: IntentRepository,
    private readonly debugRepo?: DebugRepository,
    options: IntentServiceOptions = {},
  ) {
    this.useLLM = options.useLLM ?? false;
    this.fallbackHeuristics = options.fallbackHeuristics ?? true;
    this.llmAnalyzer = options.llmAnalyzer;
  }

  analyze(input: IntentAnalyzeInput): IntentRecord {
    const normalizedText = input.text.trim();
    const heuristics = analyzeIntentHeuristics({
      ...input,
      text: normalizedText,
    });

    const record: IntentRecord = {
      id: randomUUID(),
      sessionId: input.sessionId,
      messageId: input.messageId,
      createdAt: nowIso(),
      rawText: normalizedText,
      intent: {
        type: heuristics.intentType,
        subtype: heuristics.subtype,
        confidence: heuristics.confidence,
      },
      signals: {
        urgency: heuristics.urgency,
        emotionalTone: heuristics.emotionalTone,
        actionNeed: heuristics.actionNeed,
        memoryNeed: heuristics.memoryNeed,
        preferenceRelevance: heuristics.preferenceRelevance,
        correctionSignal: heuristics.correctionSignal,
      },
      entities: [],
      retrievalHints: {
        preferredTypes: heuristics.preferredTypes,
        preferredScopes: heuristics.preferredScopes,
        preferredTimeBias: heuristics.preferredTimeBias,
      },
    };

    const enriched = this.applyOptionalEnrichment(input, record);
    if (enriched) {
      record.intent = enriched.intent ?? record.intent;
      record.signals = enriched.signals ?? record.signals;
      record.retrievalHints = enriched.retrievalHints ?? record.retrievalHints;
      if (enriched.entities) {
        record.entities = enriched.entities;
      }
    }

    this.intentRepo.insert(record);
    this.debugRepo?.log('intent_generated', record.id, {
      sessionId: record.sessionId,
      messageId: record.messageId,
      intentType: record.intent.type,
      intentConfidence: record.intent.confidence,
      memoryNeed: record.signals.memoryNeed,
      actionNeed: record.signals.actionNeed,
      preferredScopes: record.retrievalHints.preferredScopes,
      preferredTypes: record.retrievalHints.preferredTypes,
      preferredTimeBias: record.retrievalHints.preferredTimeBias,
    });

    return record;
  }

  private applyOptionalEnrichment(
    input: IntentAnalyzeInput,
    baselineRecord: IntentRecord,
  ): Pick<IntentRecord, 'intent' | 'signals' | 'retrievalHints' | 'entities'> | null {
    if (!this.useLLM || !this.llmAnalyzer) {
      return null;
    }

    try {
      const prompt = buildIntentEnrichPrompt(input, {
        intentType: baselineRecord.intent.type,
        confidence: baselineRecord.intent.confidence,
        memoryNeed: baselineRecord.signals.memoryNeed,
      });

      const output = this.llmAnalyzer({
        text: baselineRecord.rawText,
        sessionId: baselineRecord.sessionId,
        messageId: baselineRecord.messageId,
        scope: input.scope,
        heuristic: {
          intentType: baselineRecord.intent.type,
          confidence: baselineRecord.intent.confidence,
          memoryNeed: baselineRecord.signals.memoryNeed,
        },
        prompt,
      });

      if (!output || output.trim().length === 0) {
        this.debugRepo?.log('intent_enrich_failed', baselineRecord.id, {
          reason: 'empty_output',
        });
        if (this.fallbackHeuristics) {
          return null;
        }
        throw new Error('Intent enrichment failed: empty_output');
      }

      const parsed = parseIntentEnrichment(output);
      if (!parsed) {
        this.debugRepo?.log('intent_enrich_failed', baselineRecord.id, {
          reason: 'invalid_json_or_schema',
        });
        if (this.fallbackHeuristics) {
          return null;
        }
        throw new Error('Intent enrichment failed: invalid_json_or_schema');
      }

      const mergedIntent = {
        type: parsed.intentType ?? baselineRecord.intent.type,
        subtype: parsed.subtype ?? baselineRecord.intent.subtype,
        confidence: parsed.confidence ?? baselineRecord.intent.confidence,
      };

      const mergedSignals = {
        ...baselineRecord.signals,
        ...parsed.signals,
      };

      const mergedRetrievalHints = {
        ...baselineRecord.retrievalHints,
        ...parsed.retrievalHints,
      };

      this.debugRepo?.log('intent_enriched', baselineRecord.id, {
        intentType: mergedIntent.type,
        memoryNeed: mergedSignals.memoryNeed,
      });

      return {
        intent: mergedIntent,
        signals: mergedSignals,
        retrievalHints: mergedRetrievalHints,
        entities: parsed.entities ?? baselineRecord.entities,
      };
    } catch (error) {
      this.debugRepo?.log('intent_enrich_failed', baselineRecord.id, {
        reason: 'analyzer_throw',
        error: error instanceof Error ? error.message : String(error),
      });
      if (this.fallbackHeuristics) {
        return null;
      }
      throw error;
    }
  }
}
