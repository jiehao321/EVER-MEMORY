export const DISPLAY_NAME_REGEX = /(?:我叫|我是|my name is|i am)\s*([A-Za-z\u4e00-\u9fff0-9_\-·]{1,32})/i;
export const PREFERRED_ADDRESS_REGEX = /(?:称呼我|叫我|请叫我|address me as)\s*(?:为|as)?\s*([A-Za-z\u4e00-\u9fff0-9_\-·]{1,32})/i;
export const TIMEZONE_UTC_REGEX = /\b(?:UTC|GMT)\s*([+-]\d{1,2})(?::?(\d{2}))?\b/i;
export const TIMEZONE_CN_REGEX = /东八区|UTC\+8|北京时间/i;
export const TIMEZONE_PACIFIC_REGEX = /太平洋时间|PST|PDT/i;
export const PREFERENCE_LANGUAGE_TAG_REGEX = /language|语言|lang/i;
export const PREFERENCE_TIMEZONE_TAG_REGEX = /timezone|时区|tz/i;
export const PREFERENCE_STYLE_TAG_REGEX = /style|风格|tone/i;
export const PREFERENCE_LANGUAGE_CONTENT_REGEX = /中文|英文|language|lang/i;
export const PREFERENCE_TIMEZONE_CONTENT_REGEX = /时区|timezone|utc|gmt|北京时间|太平洋时间/i;
export const PREFERENCE_STYLE_CONTENT_REGEX = /简洁|详细|直接|结论先行|style|tone|concise|detailed|direct/i;
export const VALUE_LANGUAGE_ZH_REGEX = /中文|chinese|zh/i;
export const VALUE_LANGUAGE_EN_REGEX = /英文|english|en/i;
export const VALUE_STYLE_CONCISE_REGEX = /简洁|结论先行|concise|brief|direct/i;
export const VALUE_STYLE_DETAILED_REGEX = /详细|展开|detailed|thorough/i;
export const VALUE_STYLE_STRUCTURED_REGEX = /分点|结构化|step|checklist|structured/i;
export const WORK_PATTERN_RULES = [
    { key: 'confirm_before_execution', value: 'confirm_before_execution', regex: /确认|review|check|validate/i },
    { key: 'stepwise_planning', value: 'stepwise_planning', regex: /分步|步骤|计划|roadmap|milestone/i },
    { key: 'risk_aware_execution', value: 'risk_aware_execution', regex: /风险|回滚|安全|风险控制|rollback|safety/i },
];
export const COMMUNICATION_STYLE_RULES = [
    { value: 'concise_direct', regex: /简洁|结论先行|direct|concise|brief/i },
    { value: 'detailed', regex: /详细|展开|thorough|detailed/i },
    { value: 'structured', regex: /结构化|分点|步骤|checklist|structured/i },
    { value: 'cautious', regex: /确认|复核|review|validate/i },
];
