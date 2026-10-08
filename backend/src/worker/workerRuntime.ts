import { errorText } from "../config/redact.js";
import { dailyReportKey } from "../modules/jobs/ranking/dailyReport.js";
import { PermanentDiscoveryError, runJobDiscovery } from "../modules/jobs/services/jobDiscovery.js";
import { JobQueue } from "../queue/jobQueue.js";
import { DAILY_REPORT, JOB_DISCOVERY, type QueueJob } from "../queue/types.js";
import { kolkataParts, tickDiscoverySchedule } from "../scheduler/discoverySchedule.js";

export type WorkerHandlers = Record<string, (job: QueueJob) => Promise<void>>;

export type DailyReportHooks = {
  reserve: (key: string) => Promise<boolean>;
  release: (key: string) => Promise<void>;
  enqueue: (payload: { scheduledFor: string }) => Promise<{ id: string }>;
  publish?: (dateKey: string) => Promise<unknown>;
};

export const runScheduledJobDiscovery = (
  discover: (dependencies: { validateApplicationUrls: boolean }) => Promise<unknown> = runJobDiscovery,
) => discover({ validateApplicationUrls: true });

export const scheduleDailyReport = async (
  dateKey: string,
  report: Pick<DailyReportHooks, "reserve" | "release" | "enqueue">,
): Promise<"scheduled" | "duplicate" | "enqueue_failed"> => {
  const key = dailyReportKey(dateKey);
  const reserved = await report.reserve(key);
  if (!reserved) {
    console.info(`Duplicate daily report skipped key=${key}`);
    return "duplicate";
  }
  try {
    const job = await report.enqueue({ scheduledFor: dateKey });
    console.info(`Daily report scheduled key=${key} id=${job.id}`);
    return "scheduled";
  } catch (error) {
    await report.release(key);
    console.error(`Daily report enqueue failed key=${key} error=${errorText(error)}`);
    return "enqueue_failed";
  }
};

export const discoveryHandlers = (
  discover: () => Promise<unknown> = runScheduledJobDiscovery,
  report?: DailyReportHooks,
): WorkerHandlers => ({
  [JOB_DISCOVERY]: async (job) => {
    await discover();
    if (!report) return;
    const dateKey = job.payload.scheduledFor || kolkataParts(new Date()).dateKey;
    await scheduleDailyReport(dateKey, report);
  },
  [DAILY_REPORT]: async (job) => {
    if (!report?.publish) return;
    const dateKey = job.payload.scheduledFor || kolkataParts(new Date()).dateKey;
    await report.publish(dateKey);
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
    const permanent = error instanceof PermanentDiscoveryError || (typeof error === "object" && error !== null && "permanent" in error && error.permanent === true);
    const outcome = permanent ? await queue.failPermanently(job.id, reason) : await queue.fail(job.id, reason);
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
