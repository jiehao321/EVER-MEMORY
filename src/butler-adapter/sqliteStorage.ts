import type {
  ButlerStoragePort,
  FeedbackStore,
  GoalStore,
  InsightStore,
  InvocationStore,
  NarrativeStore,
  StateStore,
  TaskStore,
} from '../core/butler/ports/storage.js';
import type { ButlerFeedbackRepository } from '../storage/butlerFeedbackRepo.js';
import type { ButlerGoalRepository } from '../storage/butlerGoalRepo.js';
import type { ButlerInsightRepository } from '../storage/butlerInsightRepo.js';
import type { ButlerStateRepository } from '../storage/butlerStateRepo.js';
import type { ButlerTaskRepository } from '../storage/butlerTaskRepo.js';
import type { LlmInvocationRepository } from '../storage/llmInvocationRepo.js';
import type { NarrativeRepository } from '../storage/narrativeRepo.js';

interface SqliteButlerStorageOptions {
  stateRepo: ButlerStateRepository;
  taskRepo: ButlerTaskRepository;
  insightRepo: ButlerInsightRepository;
  feedbackRepo: ButlerFeedbackRepository;
  goalRepo: ButlerGoalRepository;
  narrativeRepo: NarrativeRepository;
  invocationRepo: LlmInvocationRepository;
}

function createStateStore(stateRepo: ButlerStateRepository): StateStore {
  return {
    load: () => stateRepo.load(),
    save: (state) => stateRepo.save(state),
    updateMode: (mode) => stateRepo.updateMode(mode),
  };
}

function createTaskStore(taskRepo: ButlerTaskRepository): TaskStore {
  return {
    addTask: (task) => taskRepo.addTask(task),
    leaseTasks: (limit, maxPriority) => taskRepo.leaseTasks(limit, maxPriority),
    completeTask: (id, result) => taskRepo.completeTask(id, result),
    failTask: (id, error) => taskRepo.failTask(id, error),
    getPendingCount: () => taskRepo.getPendingCount(),
    getByIdempotencyKey: (key) => taskRepo.getByIdempotencyKey(key),
  };
}

function createInsightStore(insightRepo: ButlerInsightRepository): InsightStore {
  return {
    insert: (insight) => insightRepo.insert(insight),
    findById: (id) => insightRepo.findById(id),
    findByKind: (kind, limit) => insightRepo.findByKind(kind, limit),
    findFresh: (limit) => insightRepo.findFresh(limit),
    markSurfaced: (id) => insightRepo.markSurfaced(id),
    deleteExpired: () => insightRepo.deleteExpired(),
  };
}

function createFeedbackStore(feedbackRepo: ButlerFeedbackRepository): FeedbackStore {
  return {
    insert: (feedback) => feedbackRepo.insert(feedback),
    findByInsightId: (insightId) => feedbackRepo.findByInsightId(insightId),
    getLatestAction: (insightId) => feedbackRepo.getLatestAction(insightId),
    isSnoozed: (insightId) => feedbackRepo.isSnoozed(insightId),
    isDismissed: (insightId) => feedbackRepo.isDismissed(insightId),
    isBlocked: (insightId) => feedbackRepo.isBlocked(insightId),
    getAcceptanceStats: () => feedbackRepo.getAcceptanceStats(),
    pruneExpired: () => feedbackRepo.pruneExpired(),
  };
}

function createGoalStore(goalRepo: ButlerGoalRepository): GoalStore {
  return {
    insert: (goal) => goalRepo.insert(goal),
    findById: (id) => goalRepo.findById(id),
    findActive: (scope) => goalRepo.findActive(scope),
    findByStatus: (status) => goalRepo.findByStatus(status),
    update: (id, patch) => goalRepo.update(id, patch),
    setStatus: (id, status) => goalRepo.setStatus(id, status),
    addProgressNote: (id, note) => goalRepo.addProgressNote(id, note),
    deleteById: (id) => goalRepo.deleteById(id),
  };
}

function createNarrativeStore(narrativeRepo: NarrativeRepository): NarrativeStore {
  return {
    insert: (thread) => narrativeRepo.insert(thread),
    findById: (id) => narrativeRepo.findById(id),
    findActive: (scope) => narrativeRepo.findActive(scope),
    update: (id, patch) => narrativeRepo.update(id, patch),
    close: (id) => narrativeRepo.close(id),
  };
}

function createInvocationStore(invocationRepo: LlmInvocationRepository): InvocationStore {
  return {
    insert: (invocation) => invocationRepo.insert(invocation),
    getDailyUsage: (date) => invocationRepo.getDailyUsage(date),
    getSessionUsage: (sessionId) => invocationRepo.getSessionUsage(sessionId),
  };
}

export class SqliteButlerStorage implements ButlerStoragePort {
  readonly state: StateStore;
  readonly tasks: TaskStore;
  readonly insights: InsightStore;
  readonly feedback: FeedbackStore;
  readonly goals: GoalStore;
  readonly narrative: NarrativeStore;
  readonly invocations: InvocationStore;

  constructor(options: SqliteButlerStorageOptions) {
    this.state = createStateStore(options.stateRepo);
    this.tasks = createTaskStore(options.taskRepo);
    this.insights = createInsightStore(options.insightRepo);
    this.feedback = createFeedbackStore(options.feedbackRepo);
    this.goals = createGoalStore(options.goalRepo);
    this.narrative = createNarrativeStore(options.narrativeRepo);
    this.invocations = createInvocationStore(options.invocationRepo);
  }
}
