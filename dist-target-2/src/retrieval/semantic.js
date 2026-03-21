import { createHash } from 'node:crypto';
function normalize(text) {
    return text
        .trim()
        .toLowerCase()
        .replace(/[\t\r\n]+/g, ' ')
        .replace(/[.,!?;:()[\]{}"'`~|\\/，。！？；：、（）【】《》“”‘’]+/g, ' ');
}
function buildAsciiTokens(normalized) {
    return normalized
        .split(/\s+/g)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2);
}
function buildCjkBigrams(normalized) {
    const chunks = normalized.match(/[\u4e00-\u9fff]+/g) ?? [];
    const bigrams = [];
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
function countTokens(tokens) {
    const map = new Map();
    for (const token of tokens) {
        map.set(token, (map.get(token) ?? 0) + 1);
    }
    return map;
}
function toNormalizedWeights(counts) {
    const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
    if (total <= 0) {
        return {};
    }
    const weights = {};
    for (const [token, count] of counts.entries()) {
        weights[token] = count / total;
    }
    return weights;
}
export function buildSemanticProfile(text) {
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
export function semanticSimilarity(query, candidate) {
    const queryTokens = query.tokens;
    if (queryTokens.length === 0 || candidate.tokens.length === 0) {
        return { score: 0, matchedTokens: [] };
    }
    const matchedTokens = queryTokens.filter((token) => token in candidate.weights);
    if (matchedTokens.length === 0) {
        return { score: 0, matchedTokens: [] };
    }
    const unionTokenSet = new Set([
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
