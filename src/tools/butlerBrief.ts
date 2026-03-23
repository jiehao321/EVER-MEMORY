import type { AttentionService } from '../core/butler/attention/service.js';
import type { CommitmentWatcher } from '../core/butler/commitments/watcher.js';
import type { NarrativeThreadService } from '../core/butler/narrative/service.js';
import { compileOverlay } from '../core/butler/strategy/compiler.js';
import type { StrategicOverlayGenerator } from '../core/butler/strategy/overlay.js';
import type {
  ButlerAgent,
} from '../core/butler/agent.js';
import type { ButlerInsight, NarrativeThread, StrategicOverlay } from '../core/butler/types.js';

export interface ButlerBriefResult {
  overlayXml: string;
  overlay: StrategicOverlay;
  narratives?: NarrativeThread[];
  commitments?: ButlerInsight[];
}

function toScopedRecord(scope?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!scope) {
    return undefined;
  }
  const scoped = Object.fromEntries(
    ['userId', 'chatId', 'project']
      .map((key) => [key, scope[key]])
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0),
  );
  return Object.keys(scoped).length > 0 ? scoped : undefined;
}

async function ensureState(agent: ButlerAgent, scope?: Record<string, unknown>) {
  if (agent.getState()) {
    return agent.getState();
  }
  await agent.runCycle({ type: 'service_started', scope });
  return agent.getState();
}

export async function butlerBrief(input: {
  agent: ButlerAgent;
  overlayGenerator: StrategicOverlayGenerator;
  narrativeService: NarrativeThreadService;
  commitmentWatcher: CommitmentWatcher;
  attentionService: AttentionService;
  scope?: Record<string, unknown>;
  includeNarratives?: boolean;
  includeCommitments?: boolean;
}): Promise<ButlerBriefResult> {
  const scope = toScopedRecord(input.scope);
  const state = await ensureState(input.agent, scope);
  if (!state) {
    throw new Error('Butler state unavailable.');
  }
  const topInsights = input.attentionService.getTopInsights();
  const overlay = await input.overlayGenerator.generateOverlay(state, { scope, recentMessages: [] });
  const narratives = input.includeNarratives ? input.narrativeService.getActiveThreads(scope) : undefined;
  const commitments = input.includeCommitments
    ? (await input.commitmentWatcher.scanCommitments(scope), input.commitmentWatcher.getActiveCommitments())
    : undefined;
  return {
    overlayXml: compileOverlay(overlay, topInsights),
    overlay,
    narratives,
    commitments,
  };
}
