import { Worker } from 'node:worker_threads';

export interface WorkerTask {
  id: string;
  type: string;
  payload: unknown;
}

export type WorkerThreadResult<T> = { id: string; result: T } | { id: string; error: string };

export interface WorkerThreadPoolOptions {
  maxWorkers?: number;
  taskTimeoutMs?: number;
  maxQueueSize?: number;
}

interface QueuedTask<T> {
  task: WorkerTask;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

interface WorkerSlot {
  worker: Worker;
  activeTaskId?: string;
  timeout?: ReturnType<typeof setTimeout>;
}

type WorkerFactory = (workerScript: string) => Worker;

const DEFAULT_MAX_WORKERS = 2;
const DEFAULT_TASK_TIMEOUT_MS = 10000;
const DEFAULT_MAX_QUEUE_SIZE = 20;
const DEFAULT_TERMINATE_ERROR = 'worker pool terminated';

export class WorkerThreadPool {
  private static workerFactory: WorkerFactory = (workerScript) => new Worker(workerScript);

  private readonly workerScript: string;
  private readonly maxWorkers: number;
  private readonly taskTimeoutMs: number;
  private readonly maxQueueSize: number;
  private readonly workers = new Set<WorkerSlot>();
  private readonly taskResolvers = new Map<string, QueuedTask<unknown>>();
  private readonly workerByTaskId = new Map<string, WorkerSlot>();
  private readonly queue: Array<QueuedTask<unknown>> = [];
  private readonly drainWaiters = new Set<() => void>();
  private terminated = false;

  constructor(workerScript: string, options: WorkerThreadPoolOptions = {}) {
    this.workerScript = workerScript;
    this.maxWorkers = options.maxWorkers ?? DEFAULT_MAX_WORKERS;
    this.taskTimeoutMs = options.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
    this.maxQueueSize = options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
  }

  static setWorkerFactoryForTests(factory: WorkerFactory): void {
    WorkerThreadPool.workerFactory = factory;
  }

  static resetWorkerFactoryForTests(): void {
    WorkerThreadPool.workerFactory = (workerScript) => new Worker(workerScript);
  }

  dispatch<T>(task: WorkerTask): Promise<T> {
    if (this.terminated) {
      return Promise.reject(new Error(DEFAULT_TERMINATE_ERROR));
    }
    return new Promise<T>((resolve, reject) => {
      const queuedTask: QueuedTask<T> = { task: { ...task }, resolve, reject };
      const idleWorker = this.getIdleWorker() ?? this.createWorkerIfAvailable();
      if (idleWorker) {
        this.assignTask(idleWorker, queuedTask);
        return;
      }
      if (this.queue.length >= this.maxQueueSize) {
        reject(new Error('queue full'));
        return;
      }
      this.queue.push(queuedTask as QueuedTask<unknown>);
    });
  }

  async drain(): Promise<void> {
    if (this.isIdle()) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.drainWaiters.add(resolve);
    });
  }

  async terminate(): Promise<void> {
    if (this.terminated) {
      return;
    }
    this.terminated = true;
    const workers = [...this.workers];
    this.rejectQueuedTasks(DEFAULT_TERMINATE_ERROR);
    for (const slot of workers) {
      this.failTask(slot.activeTaskId, DEFAULT_TERMINATE_ERROR);
      this.clearWorker(slot);
    }
    await Promise.allSettled(workers.map(async (slot) => {
      await slot.worker.terminate();
      this.workers.delete(slot);
    }));
    this.resolveDrainWaiters();
  }

  getWorkerCountForTests(): number {
    return this.workers.size;
  }

  private getIdleWorker(): WorkerSlot | undefined {
    return [...this.workers].find((slot) => slot.activeTaskId === undefined);
  }

  private createWorkerIfAvailable(): WorkerSlot | undefined {
    if (this.workers.size >= this.maxWorkers || this.terminated) {
      return undefined;
    }
    const worker = WorkerThreadPool.workerFactory(this.workerScript);
    const slot: WorkerSlot = { worker };
    worker.on('message', (message) => this.handleMessage(slot, message as WorkerThreadResult<unknown>));
    worker.on('error', (error) => this.handleWorkerFailure(slot, error));
    worker.on('exit', (code) => this.handleWorkerExit(slot, code));
    this.workers.add(slot);
    return slot;
  }

  private assignTask<T>(slot: WorkerSlot, queuedTask: QueuedTask<T>): void {
    slot.activeTaskId = queuedTask.task.id;
    this.taskResolvers.set(queuedTask.task.id, queuedTask as QueuedTask<unknown>);
    this.workerByTaskId.set(queuedTask.task.id, slot);
    slot.timeout = setTimeout(() => {
      void this.handleTaskTimeout(slot, queuedTask.task.id);
    }, this.taskTimeoutMs);
    slot.worker.postMessage({ ...queuedTask.task });
  }

  private handleMessage(slot: WorkerSlot, message: WorkerThreadResult<unknown>): void {
    if (!slot.activeTaskId || slot.activeTaskId !== message.id) {
      return;
    }
    if ('error' in message) {
      this.failTask(message.id, message.error);
    } else {
      this.completeTask(message.id, message.result);
    }
    this.releaseWorker(slot);
  }

  private handleWorkerFailure(slot: WorkerSlot, error: unknown): void {
    this.failTask(slot.activeTaskId, error instanceof Error ? error.message : String(error));
    this.removeWorker(slot);
    this.scheduleNext();
  }

  private handleWorkerExit(slot: WorkerSlot, code: unknown): void {
    if (this.workers.has(slot) && !this.terminated && slot.activeTaskId) {
      this.failTask(slot.activeTaskId, `worker exited with code ${String(code)}`);
    }
    this.removeWorker(slot);
    this.scheduleNext();
  }

  private async handleTaskTimeout(slot: WorkerSlot, taskId: string): Promise<void> {
    if (slot.activeTaskId !== taskId) {
      return;
    }
    this.failTask(taskId, `task timed out after ${this.taskTimeoutMs}ms`);
    this.removeWorker(slot);
    await slot.worker.terminate().catch(() => undefined);
    this.scheduleNext();
  }

  private completeTask(taskId: string, result: unknown): void {
    const queuedTask = this.taskResolvers.get(taskId);
    if (!queuedTask) {
      return;
    }
    this.taskResolvers.delete(taskId);
    this.workerByTaskId.delete(taskId);
    queuedTask.resolve(result);
  }

  private failTask(taskId: string | undefined, error: string): void {
    if (!taskId) {
      return;
    }
    const queuedTask = this.taskResolvers.get(taskId);
    if (!queuedTask) {
      return;
    }
    this.taskResolvers.delete(taskId);
    this.workerByTaskId.delete(taskId);
    queuedTask.reject(new Error(error));
  }

  private releaseWorker(slot: WorkerSlot): void {
    this.clearWorker(slot);
    this.scheduleNext();
  }

  private clearWorker(slot: WorkerSlot): void {
    if (slot.timeout) {
      clearTimeout(slot.timeout);
      slot.timeout = undefined;
    }
    slot.activeTaskId = undefined;
  }

  private removeWorker(slot: WorkerSlot): void {
    this.clearWorker(slot);
    this.workers.delete(slot);
  }

  private scheduleNext(): void {
    const next = this.queue.shift();
    if (!next || this.terminated) {
      if (!next) {
        this.resolveDrainWaiters();
      }
      return;
    }
    const slot = this.getIdleWorker() ?? this.createWorkerIfAvailable();
    if (!slot) {
      this.queue.unshift(next);
      return;
    }
    this.assignTask(slot, next);
  }

  private rejectQueuedTasks(error: string): void {
    while (this.queue.length > 0) {
      const queuedTask = this.queue.shift();
      queuedTask?.reject(new Error(error));
    }
  }

  private isIdle(): boolean {
    return this.queue.length === 0 && this.taskResolvers.size === 0;
  }

  private resolveDrainWaiters(): void {
    if (!this.isIdle()) {
      return;
    }
    for (const resolve of this.drainWaiters) {
      resolve();
    }
    this.drainWaiters.clear();
  }
}
