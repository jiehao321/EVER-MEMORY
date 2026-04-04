import type {
  ButlerFeedback,
  ButlerFeedbackAction,
  ButlerGoal,
  ButlerInsight,
  ButlerMode,
  ButlerPersistentState,
  ButlerTask,
  InsightKind,
  NarrativeThread,
  NewButlerFeedback,
  NewButlerGoal,
  NewButlerInsight,
  NewButlerTask,
  GoalStatus,
} from '../types.js';

export interface StateStore {
  load(): ButlerPersistentState | null;
  save(state: ButlerPersistentState): void;
  updateMode(mode: ButlerMode): void;
}

export interface TaskStore {
  addTask(task: NewButlerTask): string;
  leaseTasks(limit: number, maxPriority?: number): ButlerTask[];
  completeTask(id: string, result: unknown): void;
  failTask(id: string, error: string): void;
  getPendingCount(): number;
  getByIdempotencyKey(key: string): ButlerTask | null;
}

export interface InsightStore {
  insert(insight: NewButlerInsight): string;
  findById(id: string): ButlerInsight | null;
  findByKind(kind: InsightKind, limit?: number): ButlerInsight[];
  findFresh(limit?: number): ButlerInsight[];
  markSurfaced(id: string): void;
  deleteExpired(): number;
}

export interface FeedbackStore {
  insert(feedback: NewButlerFeedback): ButlerFeedback;
  findByInsightId(insightId: string): ButlerFeedback[];
  getLatestAction(insightId: string): ButlerFeedbackAction | null;
  isSnoozed(insightId: string): boolean;
  isDismissed(insightId: string): boolean;
  isBlocked(insightId: string): boolean;
  getAcceptanceStats(): { accepted: number; rejected: number; total: number };
  pruneExpired(): number;
}

export interface GoalStore {
  insert(goal: NewButlerGoal): ButlerGoal;
  findById(id: string): ButlerGoal | null;
  findActive(scope?: Record<string, unknown>): ButlerGoal[];
  findByStatus(status: GoalStatus): ButlerGoal[];
  update(
    id: string,
    patch: Partial<Pick<ButlerGoal, 'title' | 'description' | 'priority' | 'deadline' | 'progressNotes'>>,
  ): ButlerGoal | null;
  setStatus(id: string, status: GoalStatus): ButlerGoal | null;
  addProgressNote(id: string, note: string): ButlerGoal | null;
  deleteById(id: string): boolean;
}

export interface NarrativeStore {
  insert(thread: Omit<NarrativeThread, 'id'>): string;
  findById(id: string): NarrativeThread | null;
  findActive(scope?: Record<string, unknown>): NarrativeThread[];
  update(id: string, patch: Partial<NarrativeThread>): void;
  close(id: string): void;
}

export interface InvocationStore {
  insert(invocation: {
    taskType: string;
    traceId?: string;
    provider?: string;
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    latencyMs?: number;
    cacheHit: boolean;
    success: boolean;
    createdAt: string;
  }): string;
  getDailyUsage(date?: string): { totalTokens: number; count: number };
  getSessionUsage(sessionId: string): { totalTokens: number; count: number };
}

export interface ButlerStoragePort {
  state: StateStore;
  tasks: TaskStore;
  insights: InsightStore;
  feedback: FeedbackStore;
  goals: GoalStore;
  narrative: NarrativeStore;
  invocations: InvocationStore;
}
