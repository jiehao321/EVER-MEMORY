import { INTENT_ACTION_NEEDS, INTENT_EMOTIONAL_TONES, INTENT_MEMORY_NEEDS, INTENT_TYPES, INTENT_URGENCY_LEVELS, MEMORY_TYPES, RETRIEVAL_SCOPE_HINTS, RETRIEVAL_TIME_BIASES, } from '../../constants.js';
function extractJsonBlock(text) {
    const trimmed = text.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        return trimmed;
    }
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first === -1 || last === -1 || first >= last) {
        return null;
    }
    return trimmed.slice(first, last + 1);
}
function asRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value;
}
function isOneOf(value, candidates) {
    return typeof value === 'string' && candidates.includes(value);
}
function clamp01(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return undefined;
    }
    if (value < 0) {
        return 0;
    }
    if (value > 1) {
        return 1;
    }
    return value;
}
function parseEntities(value) {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const entities = [];
    for (const entity of value) {
        const record = asRecord(entity);
        if (!record) {
            continue;
        }
        const type = typeof record.type === 'string' ? record.type.trim() : '';
        const entryValue = typeof record.value === 'string' ? record.value.trim() : '';
        if (!type || !entryValue) {
            continue;
        }
        entities.push({
            type,
            value: entryValue,
            confidence: clamp01(record.confidence) ?? 0.5,
        });
    }
    return entities;
}
export function parseIntentEnrichment(rawOutput) {
    const jsonBlock = extractJsonBlock(rawOutput);
    if (!jsonBlock) {
        return null;
    }
    let parsed;
    try {
        parsed = JSON.parse(jsonBlock);
    }
    catch {
        return null;
    }
    const root = asRecord(parsed);
    if (!root) {
        return null;
    }
    const result = {};
    if (isOneOf(root.intentType, INTENT_TYPES)) {
        result.intentType = root.intentType;
    }
    if (typeof root.subtype === 'string' && root.subtype.trim()) {
        result.subtype = root.subtype.trim();
    }
    result.confidence = clamp01(root.confidence);
    const signals = asRecord(root.signals);
    if (signals) {
        const parsedSignals = {};
        if (isOneOf(signals.urgency, INTENT_URGENCY_LEVELS)) {
            parsedSignals.urgency = signals.urgency;
        }
        if (isOneOf(signals.emotionalTone, INTENT_EMOTIONAL_TONES)) {
            parsedSignals.emotionalTone = signals.emotionalTone;
        }
        if (isOneOf(signals.actionNeed, INTENT_ACTION_NEEDS)) {
            parsedSignals.actionNeed = signals.actionNeed;
        }
        if (isOneOf(signals.memoryNeed, INTENT_MEMORY_NEEDS)) {
            parsedSignals.memoryNeed = signals.memoryNeed;
        }
        const preferenceRelevance = clamp01(signals.preferenceRelevance);
        if (preferenceRelevance !== undefined) {
            parsedSignals.preferenceRelevance = preferenceRelevance;
        }
        const correctionSignal = clamp01(signals.correctionSignal);
        if (correctionSignal !== undefined) {
            parsedSignals.correctionSignal = correctionSignal;
        }
        if (Object.keys(parsedSignals).length > 0) {
            result.signals = parsedSignals;
        }
    }
    const retrievalHints = asRecord(root.retrievalHints);
    if (retrievalHints) {
        const parsedHints = {};
        if (Array.isArray(retrievalHints.preferredTypes)) {
            parsedHints.preferredTypes = retrievalHints.preferredTypes.filter((value) => isOneOf(value, MEMORY_TYPES));
        }
        if (Array.isArray(retrievalHints.preferredScopes)) {
            parsedHints.preferredScopes = retrievalHints.preferredScopes.filter((value) => isOneOf(value, RETRIEVAL_SCOPE_HINTS));
        }
        if (isOneOf(retrievalHints.preferredTimeBias, RETRIEVAL_TIME_BIASES)) {
            parsedHints.preferredTimeBias = retrievalHints.preferredTimeBias;
        }
        if (Object.keys(parsedHints).length > 0) {
            result.retrievalHints = parsedHints;
        }
    }
    const entities = parseEntities(root.entities);
    if (entities) {
        result.entities = entities;
    }
    return result;
}
