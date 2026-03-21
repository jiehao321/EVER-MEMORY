import { REFLECTION_MAX_CANDIDATE_RULES } from '../../tuning.js';
function uniqueNonEmpty(values) {
    return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)));
}
export function generateCandidateRules(triggerKind, experiences, reflection) {
    const rules = [];
    if (triggerKind === 'correction') {
        rules.push('当用户明确更正时，先复述修正点并确认后再继续执行。');
    }
    if (triggerKind === 'mistake' || experiences.some((item) => item.indicators.externalActionRisk)) {
        rules.push('涉及高风险外部动作时，若指令不完整，先确认再执行。');
    }
    if (triggerKind === 'repeat-pattern' || reflection.evidence.recurrenceCount >= 2) {
        rules.push('同类问题重复出现时，优先检索最近反思并复用已验证做法。');
    }
    if (triggerKind === 'success' || experiences.some((item) => item.indicators.userApproval)) {
        rules.push('当用户明确认可当前输出风格时，在后续会话保持相同表达约束。');
    }
    if (reflection.analysis.nextTimeRecommendation) {
        rules.push(reflection.analysis.nextTimeRecommendation);
    }
    return uniqueNonEmpty(rules).slice(0, REFLECTION_MAX_CANDIDATE_RULES);
}
