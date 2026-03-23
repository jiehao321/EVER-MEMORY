import type { ButlerInsight, StrategicOverlay } from '../types.js';

function renderList(prefix: string, values: string[], emptyValue: string): string {
  return values.length > 0 ? `${prefix}${values.join(' | ')}` : `${prefix}${emptyValue}`;
}

export function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function renderStrategy(overlay: StrategicOverlay): string {
  const goal = overlay.likelyUserGoal.trim() || 'Unknown';
  const nextStep = overlay.suggestedNextStep?.trim() || 'none';
  const lines = [
    `<strategy mode="${escapeXml(overlay.currentMode)}" posture="${escapeXml(overlay.recommendedPosture)}" confidence="${overlay.confidence.toFixed(2)}">`,
    `  目标: ${escapeXml(goal)}`,
    `  ${escapeXml(renderList('优先级: ', overlay.topPriorities, 'none'))}`,
    `  ${escapeXml(renderList('约束: ', overlay.constraints, 'none'))}`,
    `  建议: ${escapeXml(nextStep)}`,
    '</strategy>',
  ];
  return lines.join('\n');
}

export function renderWatchlist(overlay: StrategicOverlay, insights: ButlerInsight[] = []): string {
  const items = [
    ...overlay.watchouts,
    ...insights.map((insight) => `${insight.title}: ${insight.summary}`),
  ];
  const lines = [`<watchlist count="${items.length}">`];
  lines.push(...(items.length > 0 ? items : ['none']).map((item) => `  - ${escapeXml(item)}`));
  lines.push('</watchlist>');
  return lines.join('\n');
}

export function compileOverlay(overlay: StrategicOverlay, insights: ButlerInsight[] = []): string {
  return [
    '<evermemory-butler>',
    renderStrategy(overlay),
    renderWatchlist(overlay, insights),
    '</evermemory-butler>',
  ].join('\n');
}
