/**
 * String utilities — centralized clip/dedupe for briefing, capture, profile.
 */

/** Default clip length (matches BRIEFING_CLIP_DEFAULT). */
const DEFAULT_CLIP_MAX = 200;

/**
 * Clip a string to a maximum length, normalizing whitespace, adding ellipsis if truncated.
 */
export function clip(value: string | undefined, max = DEFAULT_CLIP_MAX): string {
  if (!value) return '';
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

/**
 * Deduplicate a string array, trimming each entry. Preserves order.
 */
export function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const v of values) {
    const trimmed = v.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    output.push(trimmed);
  }
  return output;
}
