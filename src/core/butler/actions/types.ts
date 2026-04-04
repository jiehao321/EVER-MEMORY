export type ActionTier = 'auto' | 'confirm';

export type ActionStep =
  | { type: 'store_memory'; content: string; memoryType: string; tier: 'auto' }
  | { type: 'recall_memory'; query: string; tier: 'auto' }
  | { type: 'create_relation'; fromId: string; toId: string; relationType: string; tier: 'auto' }
  | { type: 'update_goal'; goalId: string; patch: Record<string, unknown>; tier: 'auto' }
  | { type: 'ask_user'; question: string; context: string; tier: 'auto' }
  | { type: 'search_knowledge'; query: string; sources: string[]; tier: 'auto' }
  | { type: 'delete_memory'; memoryId: string; tier: 'confirm' }
  | { type: 'archive_memory'; memoryId: string; tier: 'confirm' };

export interface ActionPlan {
  steps: ActionStep[];
  budgetMs: number;
  reason: string;
}

export interface ActionResult {
  stepResults: Array<{
    step: ActionStep;
    success: boolean;
    result?: unknown;
    error?: string;
    durationMs: number;
  }>;
  totalDurationMs: number;
  actionsExecuted: number;
  actionsFailed: number;
}

export interface ActionPolicyConfig {
  maxActionsPerDay: number;
  maxActionsPerSession: number;
  requireConfirmTiers: ActionTier[];
}

export interface ActionRecord {
  id: string;
  cycleId?: string;
  actionType: string;
  paramsJson?: string;
  resultJson?: string;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'rolled_back';
  rollbackJson?: string;
  budgetCostMs?: number;
  createdAt: string;
  completedAt?: string;
}
