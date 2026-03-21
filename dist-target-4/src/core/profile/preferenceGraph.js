const IMPLICATION_RULES = [
    { if: /typescript|ts/i, implies: ['静态类型偏好', '编译时错误检查'] },
    { if: /rust|go/i, implies: ['性能敏感', '内存安全意识'] },
    { if: /逐步确认|confirm.*before|stepwise|confirm_before_execution/i, implies: ['高风险操作需要审批', '谨慎执行'] },
    { if: /简洁直接|concise|concise_direct/i, implies: ['不需要冗长解释', '代码优于文字'] },
    { if: /tdd|测试.*先/i, implies: ['质量优先', '回归测试覆盖'] },
    { if: /immutable|不可变/i, implies: ['函数式倾向', '副作用敏感'] },
];
const CONFLICT_RULES = [
    { a: /快速执行|直接执行|speed/i, b: /逐步确认|stepwise|confirm/i, reason: '执行节奏偏好冲突：快速推进 vs 先确认。' },
    { a: /详细|thorough|detailed/i, b: /简洁直接|concise|brief/i, reason: '沟通风格冲突：详尽展开 vs 简洁直接。' },
    { a: /mutable|可变/i, b: /immutable|不可变/i, reason: '状态管理偏好冲突：可变数据 vs 不可变数据。' },
];
function clamp(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(1, value));
}
function slugify(value) {
    return value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-+|-+$/g, '') || 'preference';
}
function freezeNode(node) {
    return Object.freeze(node);
}
function freezeEdge(edge) {
    return Object.freeze(edge);
}
function inferCategory(key, label) {
    const text = `${key} ${label}`.toLowerCase();
    if (/language|timezone|时区|中文|英文/.test(text)) {
        return 'domain';
    }
    if (/style|风格|concise|detailed|structured|cautious|direct/.test(text)) {
        return 'style';
    }
    if (/confirm|stepwise|workflow|执行|规划|tdd|测试/.test(text)) {
        return 'workflow';
    }
    if (/immutable|原则|quality|安全|静态类型|编译时/.test(text)) {
        return 'principle';
    }
    return 'tech';
}
function collectBaseNodes(profile) {
    const nodes = [];
    for (const item of profile.derived.likelyInterests) {
        nodes.push(freezeNode({
            id: `interest:${slugify(item.value)}`,
            category: inferCategory('interest', item.value),
            label: item.value,
            strength: clamp(item.confidence),
            evidenceCount: Math.max(1, item.evidenceRefs.length),
        }));
    }
    for (const item of profile.derived.workPatterns) {
        nodes.push(freezeNode({
            id: `work:${slugify(item.value)}`,
            category: inferCategory('work', item.value),
            label: item.value,
            strength: clamp(item.confidence),
            evidenceCount: Math.max(1, item.evidenceRefs.length),
        }));
    }
    for (const [key, item] of Object.entries(profile.stable.explicitPreferences)) {
        nodes.push(freezeNode({
            id: `explicit:${slugify(key)}:${slugify(item.value)}`,
            category: inferCategory(key, item.value),
            label: item.value,
            strength: 1,
            evidenceCount: Math.max(1, item.evidenceRefs.length),
        }));
    }
    return nodes;
}
export class PreferenceGraphService {
    buildFromProfile(userId, profile) {
        const nodeMap = new Map();
        const edges = [];
        for (const node of collectBaseNodes(profile)) {
            nodeMap.set(node.id, node);
        }
        for (const node of [...nodeMap.values()]) {
            const normalized = node.label.toLowerCase();
            for (const rule of IMPLICATION_RULES) {
                if (!rule.if.test(normalized)) {
                    continue;
                }
                for (const implied of rule.implies) {
                    const impliedId = `implied:${slugify(implied)}`;
                    if (!nodeMap.has(impliedId)) {
                        nodeMap.set(impliedId, freezeNode({
                            id: impliedId,
                            category: inferCategory('implied', implied),
                            label: implied,
                            strength: clamp(node.strength * 0.85),
                            evidenceCount: node.evidenceCount,
                        }));
                    }
                    edges.push(freezeEdge({
                        fromId: node.id,
                        toId: impliedId,
                        relation: 'implies',
                        weight: clamp(node.strength * 0.9),
                    }));
                }
            }
        }
        for (const rule of CONFLICT_RULES) {
            const matching = [...nodeMap.values()].filter((node) => rule.a.test(node.label) || rule.b.test(node.label));
            const groupA = matching.filter((node) => rule.a.test(node.label));
            const groupB = matching.filter((node) => rule.b.test(node.label));
            for (const nodeA of groupA) {
                for (const nodeB of groupB) {
                    if (nodeA.id === nodeB.id) {
                        continue;
                    }
                    edges.push(freezeEdge({
                        fromId: nodeA.id,
                        toId: nodeB.id,
                        relation: 'conflicts',
                        weight: clamp((nodeA.strength + nodeB.strength) / 2),
                    }));
                }
            }
        }
        return Object.freeze({
            nodes: Object.freeze([...nodeMap.values()]),
            edges: Object.freeze(edges),
            userId,
            updatedAt: profile.updatedAt,
        });
    }
    inferImplications(graph) {
        const explicitIds = new Set(graph.nodes.filter((node) => !node.id.startsWith('implied:')).map((node) => node.id));
        const implied = new Set();
        for (const edge of graph.edges) {
            if (edge.relation !== 'implies' || !explicitIds.has(edge.fromId)) {
                continue;
            }
            const node = graph.nodes.find((item) => item.id === edge.toId);
            if (node && !explicitIds.has(node.id)) {
                implied.add(node.label);
            }
        }
        return Object.freeze([...implied]);
    }
    findConflicts(graph) {
        const conflicts = [];
        const seen = new Set();
        for (const rule of CONFLICT_RULES) {
            const groupA = graph.nodes.filter((node) => rule.a.test(node.label));
            const groupB = graph.nodes.filter((node) => rule.b.test(node.label));
            for (const nodeA of groupA) {
                for (const nodeB of groupB) {
                    const key = [nodeA.id, nodeB.id].sort().join('::');
                    if (nodeA.id === nodeB.id || seen.has(key)) {
                        continue;
                    }
                    seen.add(key);
                    conflicts.push(Object.freeze({ nodeA: nodeA.label, nodeB: nodeB.label, reason: rule.reason }));
                }
            }
        }
        return Object.freeze(conflicts);
    }
    getTopPreferences(graph, limit = 5) {
        return Object.freeze(graph.nodes
            .filter((node) => !node.id.startsWith('implied:'))
            .sort((a, b) => (b.strength * b.evidenceCount) - (a.strength * a.evidenceCount))
            .slice(0, limit));
    }
}
