export interface SanitizeResult {
  cleaned: string;
  strippedPatterns: string[];
}

interface SanitizeRule {
  readonly name: string;
  readonly pattern: RegExp;
  readonly replacement: string;
}

const SANITIZE_RULES: readonly SanitizeRule[] = [
  {
    name: 'evermemory_context_block',
    pattern: /\[?[^\n]*<evermemory-context>[\s\S]*?<\/evermemory-context>\s*/gi,
    replacement: '',
  },
  {
    name: 'behavior_rules_block',
    pattern: /^Applicable behavior rules:\s*(?:\n-\s.*)+\s*/gim,
    replacement: '',
  },
  {
    name: 'json_envelope',
    pattern: /^\s*\{\s*"content"\s*:\s*"(.*?)"\s*\}\s*$/s,
    replacement: '$1',
  },
  {
    name: 'reply_marker',
    pattern: /\[\[reply_to_current\]\]\s*/gi,
    replacement: '',
  },
  {
    name: 'relevant_memory_prefix',
    pattern: /^Relevant\s+memor(?:y|ies)\s*:\s*/gim,
    replacement: '',
  },
  {
    name: 'metadata_line',
    pattern: /^(message_id|sender_id|channel_id|msg_id|conversation_id)\s*[:=]\s*\S+\s*$/gim,
    replacement: '',
  },
  {
    name: 'tool_echo',
    pattern: /evermemory_(store|recall|status|edit|browse)\([^)]*\)/gi,
    replacement: '',
  },
  {
    name: 'separator_line',
    pattern: /^[-=]{3,}\s*$/gm,
    replacement: '',
  },
  {
    name: 'conversation_metadata',
    pattern: /^(Conversation info|Sender)\s*\(untrusted metadata\).*$/gim,
    replacement: '',
  },
  {
    name: 'recursive_memory_ref',
    pattern: /^(Relevant memor(?:y|ies)|Earlier memory|Based on stored memory|根据记忆|此前记忆)\s*[:：].*$/gim,
    replacement: '',
  },
  {
    name: 'memory_id_ref',
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    replacement: '',
  },
  {
    name: 'system_xml_wrapper',
    pattern: /<\/?(context|tool_result|system|antml:[a-z_]+)[^>]*>/gi,
    replacement: '',
  },
  {
    name: 'llm_role_marker',
    pattern: /^(Human|Assistant|User|System)\s*[:：]\s*/gim,
    replacement: '',
  },
  {
    name: 'doubled_prefix',
    pattern: /^([^：:\n]{4,20})(：|:)\1(：|:)/gm,
    replacement: '$1$2',
  },
  {
    name: 'excessive_whitespace',
    pattern: /\n{3,}/g,
    replacement: '\n\n',
  },
] as const;

export function sanitizeContent(text: string): SanitizeResult {
  let cleaned = text;
  const strippedPatterns: string[] = [];

  for (const rule of SANITIZE_RULES) {
    const next = cleaned.replace(rule.pattern, rule.replacement);
    if (next !== cleaned) {
      strippedPatterns.push(rule.name);
      cleaned = next;
    }
  }

  return {
    cleaned: cleaned.trim(),
    strippedPatterns,
  };
}
