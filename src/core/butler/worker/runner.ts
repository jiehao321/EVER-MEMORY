import { parentPort } from 'node:worker_threads';

interface WorkerTask {
  id: string;
  type: string;
  payload: unknown;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function handleTask(task: WorkerTask): { id: string; result: unknown } | { id: string; error: string } {
  if (task.type === 'cognitive_task') {
    return {
      id: task.id,
      result: {
        processed: true,
        payload: task.payload,
      },
    };
  }
  return { id: task.id, error: `unknown task type: ${task.type}` };
}

const port = parentPort;

port?.on('message', (message: WorkerTask) => {
  try {
    port.postMessage(handleTask({ ...message }));
  } catch (error) {
    port.postMessage({
      id: message.id,
      error: toErrorMessage(error),
    });
  }
});

port?.on('close', () => {
  process.exit(0);
});
