import { errorText } from "../config/redact.js";
import { JobQueue } from "../queue/jobQueue.js";
import { JOB_DISCOVERY, type QueueJob } from "../queue/types.js";
import { tickDiscoverySchedule } from "../scheduler/discoverySchedule.js";
import { runJobDiscovery } from "../modules/jobs/services/jobDiscovery.js";

export type WorkerHandlers = Record<string, (job: QueueJob) => Promise<void>>;

export const runScheduledJobDiscovery = (
  discover: (dependencies: { validateApplicationUrls: boolean }) => Promise<unknown> = runJobDiscovery,
) => discover({ validateApplicationUrls: true });

export const discoveryHandlers = (
  discover: () => Promise<unknown> = runScheduledJobDiscovery,
): WorkerHandlers => ({
  [JOB_DISCOVERY]: async () => {
    await discover();
  },
});

export const processNextJob = async (
  queue: JobQueue,
  handlers: WorkerHandlers,
): Promise<"idle" | "completed" | "retry" | "failed"> => {
  const job = await queue.claim();
  if (!job) return "idle";
  console.info(`Job started id=${job.id} type=${job.type}`);
  try {
    const handler = handlers[job.type];
    if (!handler) throw new Error(`Unknown job type: ${job.type}`);
    await handler(job);
    await queue.complete(job.id);
    console.info(`Job completed id=${job.id} type=${job.type}`);
    return "completed";
  } catch (error) {
    const reason = errorText(error);
    const outcome = await queue.fail(job.id, reason);
    console.info(`Job ${outcome} id=${job.id} type=${job.type} attempts=${job.attempts}`);
    return outcome;
  }
};

export const runWorkerLoop = async (input: {
  queue: JobQueue;
  handlers: WorkerHandlers;
  reserve: (key: string) => Promise<boolean>;
  release: (key: string) => Promise<void>;
  isRunning: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}): Promise<void> => {
  console.info("Scheduler started timezone=Asia/Kolkata hour=08:00 weekdays=Monday-Friday");
  const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = input.now ?? (() => new Date());
  const announced = new Set<string>();
  while (input.isRunning()) {
    await tickDiscoverySchedule({
      now: now(),
      reserve: input.reserve,
      release: input.release,
      enqueue: (payload) => input.queue.enqueue(JOB_DISCOVERY, payload),
      announced,
    });
    if (!input.isRunning()) break;
    const outcome = await processNextJob(input.queue, input.handlers);
    if (!input.isRunning() || outcome !== "idle") continue;
    await sleep(1000);
  }
};
