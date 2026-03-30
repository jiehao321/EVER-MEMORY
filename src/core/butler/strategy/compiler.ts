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
    `  <next-step>${escapeXml(nextStep)}</next-step>`,
    `  目标: ${escapeXml(goal)}`,
    `  ${escapeXml(renderList('优先级: ', overlay.topPriorities, 'none'))}`,
    `  ${escapeXml(renderList('约束: ', overlay.constraints, 'none'))}`,
    `  建议: ${escapeXml(nextStep)}`,
    '</strategy>',
  ];
  return lines.join('\n');
}

export function renderWatchlist(
  overlay: StrategicOverlay,
  insights: ButlerInsight[] = [],
  ruleAlerts: Array<{ statement: string; action: string }> = [],
): string {
  const items = [
    ...overlay.watchouts,
    ...insights.map((insight) => `${insight.title}: ${insight.summary}`),
    ...ruleAlerts.map((alert) => `[rule:${alert.action}] ${alert.statement}`),
  ];
  const lines = [`<watchlist count="${items.length}">`];
  lines.push(...(items.length > 0 ? items : ['none']).map((item) => `  - ${escapeXml(item)}`));
  lines.push('</watchlist>');
  return lines.join('\n');
}

export function compileSessionWatchlist(
  insights: ButlerInsight[],
  goals: Array<{ title: string; priority: number }>,
): string {
  const reminderLines = insights
    .slice(0, 3)
    .map((insight) => `    [${escapeXml(insight.kind)}] ${escapeXml(insight.title)}`);
  const goalLines = goals
    .slice(0, 3)
    .map((goal) => `    ${goal.priority <= 3 ? '●' : '○'} ${escapeXml(goal.title)}`);
  if (reminderLines.length === 0 && goalLines.length === 0) {
    return '';
  }
  const lines = ['<evermemory-watchlist>'];
  if (reminderLines.length > 0) {
    lines.push(`  <reminders count="${reminderLines.length}">`, ...reminderLines, '  </reminders>');
  }
  if (goalLines.length > 0) {
    lines.push(`  <goals active="${goalLines.length}">`, ...goalLines, '  </goals>');
  }
  lines.push('</evermemory-watchlist>');
  return lines.join('\n');
}

export function compileOverlay(
  overlay: StrategicOverlay,
  insights: ButlerInsight[] = [],
  ruleAlerts: Array<{ statement: string; action: string }> = [],
): string {
  return [
    '<evermemory-butler>',
    renderStrategy(overlay),
    renderWatchlist(overlay, insights, ruleAlerts),
    '</evermemory-butler>',
  ].join('\n');
}
