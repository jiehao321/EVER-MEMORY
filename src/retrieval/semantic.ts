import { createHash } from 'node:crypto';

export interface SemanticTextProfile {
  contentHash: string;
  tokens: string[];
  weights: Record<string, number>;
}

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/[.,!?;:()[\]{}"'`~|\\/，。！？；：、（）【】《》“”‘’]+/g, ' ');
}

function buildAsciiTokens(normalized: string): string[] {
  return normalized
    .split(/\s+/g)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

function buildCjkBigrams(normalized: string): string[] {
  const chunks = normalized.match(/[\u4e00-\u9fff]+/g) ?? [];
  const bigrams: string[] = [];

  for (const chunk of chunks) {
    if (chunk.length === 1) {
      bigrams.push(chunk);
      continue;
    }
    for (let index = 0; index < chunk.length - 1; index += 1) {
      bigrams.push(chunk.slice(index, index + 2));
    }
  }

  return bigrams;
}

function countTokens(tokens: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const token of tokens) {
    map.set(token, (map.get(token) ?? 0) + 1);
  }
  return map;
}

function toNormalizedWeights(counts: Map<string, number>): Record<string, number> {
  const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  if (total <= 0) {
    return {};
  }

  const weights: Record<string, number> = {};
  for (const [token, count] of counts.entries()) {
    weights[token] = count / total;
  }
  return weights;
}

export function buildSemanticProfile(text: string): SemanticTextProfile {
  const normalized = normalize(text);
  const allTokens = [
    ...buildAsciiTokens(normalized),
    ...buildCjkBigrams(normalized),
  ];
  const tokens = Array.from(new Set(allTokens));
  const counts = countTokens(allTokens);

  return {
    contentHash: createHash('sha1').update(normalized).digest('hex'),
    tokens,
    weights: toNormalizedWeights(counts),
  };
}

export function semanticSimilarity(
  query: Pick<SemanticTextProfile, 'tokens' | 'weights'>,
  candidate: Pick<SemanticTextProfile, 'tokens' | 'weights'>,
): { score: number; matchedTokens: string[] } {
  const queryTokens = query.tokens;
  if (queryTokens.length === 0 || candidate.tokens.length === 0) {
    return { score: 0, matchedTokens: [] };
  }

  const matchedTokens = queryTokens.filter((token) => token in candidate.weights);
  if (matchedTokens.length === 0) {
    return { score: 0, matchedTokens: [] };
  }

  const unionTokenSet = new Set<string>([
    ...Object.keys(query.weights),
    ...Object.keys(candidate.weights),
  ]);

  let intersection = 0;
  let union = 0;
  for (const token of unionTokenSet) {
    const queryWeight = query.weights[token] ?? 0;
    const candidateWeight = candidate.weights[token] ?? 0;
    intersection += Math.min(queryWeight, candidateWeight);
    union += Math.max(queryWeight, candidateWeight);
  }

  if (union <= 0) {
    return { score: 0, matchedTokens: [] };
  }

  return {
    score: intersection / union,
    matchedTokens,
  };
}
