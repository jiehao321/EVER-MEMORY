function resolveKind(memory) {
    if (memory.tags.includes('explicit_constraint') || memory.type === 'constraint') {
        return 'explicit_constraint';
    }
    if (memory.tags.includes('user_preference') || memory.type === 'preference') {
        return 'user_preference';
    }
    return null;
}
function score(memory) {
    return memory.scores.importance * memory.scores.confidence;
}
function toTransferablePreference(memory) {
    const kind = resolveKind(memory);
    if (!kind) {
        return null;
    }
    return {
        content: memory.content,
        kind,
        sourceProject: memory.scope.project,
        confidence: memory.scores.confidence,
        tags: Object.freeze([...memory.tags]),
    };
}
function tokenize(content) {
    return new Set((content.toLowerCase().match(/[\p{Script=Han}]|[\p{Letter}\p{Number}]+/gu) ?? []).filter(Boolean));
}
function jaccard(left, right) {
    const leftTokens = tokenize(left);
    const rightTokens = tokenize(right);
    if (leftTokens.size === 0 || rightTokens.size === 0) {
        return 0;
    }
    let overlap = 0;
    for (const token of leftTokens) {
        if (rightTokens.has(token)) {
            overlap += 1;
        }
    }
    return overlap / (leftTokens.size + rightTokens.size - overlap);
}
export class CrossProjectTransferService {
    memoryRepo;
    constructor(memoryRepo) {
        this.memoryRepo = memoryRepo;
    }
    getGlobalPreferences(userId) {
        return this.memoryRepo.search({
            scope: { userId },
            types: ['preference', 'constraint'],
            activeOnly: true,
            archived: false,
            limit: 200,
        })
            .filter((memory) => !memory.scope.project || memory.scope.global)
            .map((memory) => ({ memory, preference: toTransferablePreference(memory) }))
            .filter((entry) => Boolean(entry.preference))
            .sort((left, right) => score(right.memory) - score(left.memory))
            .slice(0, 20)
            .map((entry) => entry.preference);
    }
    getTransferableTo(userId, targetProject) {
        const memories = this.memoryRepo.search({
            scope: { userId },
            types: ['preference', 'constraint'],
            activeOnly: true,
            archived: false,
            limit: 200,
        });
        const targetProjectContents = memories
            .filter((memory) => memory.scope.project === targetProject)
            .map((memory) => memory.content);
        return memories
            .filter((memory) => memory.scope.project && memory.scope.project !== targetProject)
            .filter((memory) => memory.scores.confidence > 0.8)
            .map((memory) => ({ memory, preference: toTransferablePreference(memory) }))
            .filter((entry) => Boolean(entry.preference))
            .filter((entry) => !targetProjectContents.some((content) => jaccard(content, entry.memory.content) > 0.7))
            .sort((left, right) => score(right.memory) - score(left.memory))
            .slice(0, 50)
            .map((entry) => entry.preference);
    }
    shouldInheritGlobal(preference) {
        if (preference.kind === 'explicit_constraint') {
            return true;
        }
        if (preference.kind !== 'user_preference') {
            return false;
        }
        return preference.tags.includes('global') || preference.confidence > 0.9;
    }
}
