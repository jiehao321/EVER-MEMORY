import { embeddingManager } from '../../embedding/manager.js';
const CONFLICT_RESOLVED_TAG = 'conflict_resolved';
const DUPLICATE_THRESHOLD = 0.92;
const SEARCH_LIMIT = 10;
const KEYWORD_LIMIT = 5;
const STOPWORDS = new Set([
    '的', '了', '和', '是', '在', '就', '先', '再', '把', '要', '不要', '允许', '禁止', '总是', '从不',
    '请', '需要', '可以', '不能', '用户', '记录', '偏好', '最近', '当前', '这个', '那个', '进行', '继续',
    'the', 'a', 'an', 'and', 'or', 'to', 'of', 'for', 'is', 'are', 'be', 'with', 'then',
]);
const ANTONYM_PAIRS = [
    ['不要', '要'],
    ['禁止', '允许'],
    ['总是', '从不'],
    ['必须', '无需'],
    ['开启', '关闭'],
    ['启用', '禁用'],
    ['保留', '删除'],
    ['公开', '私有'],
];
function sameScope(left, right) {
    return (left.scope.userId ?? '') === (right.scope.userId ?? '')
        && (left.scope.chatId ?? '') === (right.scope.chatId ?? '')
        && (left.scope.project ?? '') === (right.scope.project ?? '')
        && Boolean(left.scope.global) === Boolean(right.scope.global);
}
function collectTerms(content) {
    const matches = content.toLowerCase().match(/[\p{Script=Han}]+|[a-z0-9]+/gu) ?? [];
    const terms = [];
    for (const match of matches) {
        if (/^[\p{Script=Han}]+$/u.test(match)) {
            if (match.length <= 4) {
                terms.push(match);
                continue;
            }
            for (let size = 2; size <= 4; size += 1) {
                for (let index = 0; index <= match.length - size; index += 1) {
                    terms.push(match.slice(index, index + size));
                }
            }
            continue;
        }
        terms.push(match);
    }
    return terms.filter((term) => term.length >= 2 && !STOPWORDS.has(term));
}
function topKeywords(content) {
    const counts = new Map();
    for (const term of collectTerms(content)) {
        counts.set(term, (counts.get(term) ?? 0) + 1);
    }
    return Array.from(counts.entries())
        .sort((left, right) => {
        if (right[1] !== left[1]) {
            return right[1] - left[1];
        }
        if (right[0].length !== left[0].length) {
            return right[0].length - left[0].length;
        }
        return left[0].localeCompare(right[0]);
    })
        .slice(0, KEYWORD_LIMIT)
        .map(([term]) => term);
}
function antonymCount(left, right) {
    const normalizedLeft = left.toLowerCase();
    const normalizedRight = right.toLowerCase();
    let count = 0;
    for (const [a, b] of ANTONYM_PAIRS) {
        if ((normalizedLeft.includes(a) && normalizedRight.includes(b))
            || (normalizedLeft.includes(b) && normalizedRight.includes(a))) {
            count += 1;
        }
    }
    return count;
}
function sharedKeywordCount(left, right) {
    const leftKeywords = new Set(topKeywords(left));
    const rightKeywords = new Set(topKeywords(right));
    let shared = 0;
    for (const keyword of leftKeywords) {
        if (rightKeywords.has(keyword)) {
            shared += 1;
        }
    }
    return shared;
}
function buildConflictScore(similarity, sharedKeywords, antonyms) {
    const score = (similarity - 0.75) / (DUPLICATE_THRESHOLD - 0.75)
        + Math.min(sharedKeywords / 5, 1)
        + Math.min(antonyms / 2, 1);
    return Number((score / 3).toFixed(3));
}
function isConflictCandidate(current, other, similarity) {
    if (current.id === other.id || similarity < 0.75 || similarity >= DUPLICATE_THRESHOLD) {
        return null;
    }
    if (current.type !== other.type || !sameScope(current, other)) {
        return null;
    }
    if (!current.state.active || current.state.archived || !other.state.active || other.state.archived) {
        return null;
    }
    if (current.tags.includes(CONFLICT_RESOLVED_TAG) || other.tags.includes(CONFLICT_RESOLVED_TAG)) {
        return null;
    }
    const sharedKeywords = sharedKeywordCount(current.content, other.content);
    const antonyms = antonymCount(current.content, other.content);
    if (sharedKeywords <= 2 || antonyms === 0) {
        return null;
    }
    return {
        memoryA: current,
        memoryB: other,
        similarity,
        conflictScore: buildConflictScore(similarity, sharedKeywords, antonyms),
    };
}
export async function detectConflicts(memoryId, content, semanticRepo, memoryRepo, threshold = 0.75) {
    if (!embeddingManager.isReady()) {
        return [];
    }
    const current = memoryRepo.findById(memoryId);
    if (!current) {
        return [];
    }
    const vector = await embeddingManager.embed(content);
    if (!vector) {
        return [];
    }
    const hits = await semanticRepo.searchByCosine(vector.values, SEARCH_LIMIT, threshold);
    const conflicts = [];
    for (const hit of hits) {
        const other = memoryRepo.findById(hit.memoryId);
        if (!other) {
            continue;
        }
        const pair = isConflictCandidate(current, other, hit.score);
        if (pair) {
            conflicts.push(pair);
        }
    }
    conflicts.sort((left, right) => {
        if (right.conflictScore !== left.conflictScore) {
            return right.conflictScore - left.conflictScore;
        }
        return right.similarity - left.similarity;
    });
    return conflicts;
}
export async function resolveConflict(pair, memoryRepo) {
    const newer = pair.memoryA.timestamps.updatedAt >= pair.memoryB.timestamps.updatedAt ? pair.memoryA : pair.memoryB;
    const older = newer.id === pair.memoryA.id ? pair.memoryB : pair.memoryA;
    if (older.tags.includes(CONFLICT_RESOLVED_TAG)) {
        return;
    }
    memoryRepo.update({
        ...older,
        tags: [...older.tags, CONFLICT_RESOLVED_TAG],
    });
}
