import type { InferenceRule } from '../types/relation.js';

export const RELATION_DETECTION_MAX_CANDIDATES = 10;
export const RELATION_DETECTION_MIN_SIMILARITY = 0.6;
export const RELATION_CONTRADICTION_SIMILARITY_MIN = 0.75;
export const RELATION_EVOLUTION_SIMILARITY_MIN = 0.8;
export const RELATION_DETECTION_TIMEOUT_MS = 2000;
export const RELATION_MAX_PER_MEMORY = 20;

export const GRAPH_TRAVERSAL_MAX_DEPTH = 3;
export const GRAPH_TRAVERSAL_MAX_RESULTS = 50;
export const GRAPH_TRAVERSAL_MIN_WEIGHT = 0.2;

export const RELATION_DECAY_RATE = 0.005;
export const RELATION_REINFORCE_ON_HIT = 0.1;
export const RELATION_PRUNE_THRESHOLD = 0.15;
export const RELATION_WEIGHT_CAP = 2.0;

export const INFERENCE_MAX_CHAIN_LENGTH = 5;
export const INFERENCE_CONFIDENCE_FLOOR = 0.3;
export const INFERENCE_MAX_PER_STORE = 10;

export const INFERENCE_RULES: readonly InferenceRule[] = [
  { if: ['causes', 'causes'], then: 'causes', confidenceDecay: 0.7, maxChainLength: 3 },
  { if: ['contradicts', 'supports'], then: 'contradicts', confidenceDecay: 0.5, maxChainLength: 2 },
  { if: ['evolves_from', 'evolves_from'], then: 'evolves_from', confidenceDecay: 0.8, maxChainLength: 5 },
] as const;
