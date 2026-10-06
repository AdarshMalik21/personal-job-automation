import { randomUUID } from "node:crypto";
import { MAX_QUEUE_ATTEMPTS, type QueueCommands, type QueueJob, type QueueJobStatus } from "./types.js";

const PENDING = "queue:pending";
const PROCESSING = "queue:processing";
const DELAYED = "queue:delayed";
const FAILED = "queue:failed";
const jobKey = (id: string) => `queue:job:${id}`;

const retryDelayMs = (attempts: number): number => 1000 * 2 ** Math.max(0, attempts - 1);

export class JobQueue {
  constructor(
    private readonly commands: QueueCommands,
    private readonly now: () => Date = () => new Date(),
    private readonly maxAttempts = MAX_QUEUE_ATTEMPTS,
  ) {}

  async enqueue(type: string, payload: Record<string, string> = {}): Promise<QueueJob> {
    const job: QueueJob = {
      id: randomUUID(),
      type,
      payload,
      createdAt: this.now().toISOString(),
      attempts: 0,
      status: "queued",
    };
    await this.save(job);
    await this.commands.push(PENDING, job.id);
    console.info(`Job enqueued id=${job.id} type=${job.type}`);
    return job;
  }

  async claim(): Promise<QueueJob | null> {
    await this.promoteDue();
    const id = await this.commands.moveTailToHead(PENDING, PROCESSING);
    if (!id) return null;
    const job = await this.read(id);
    job.attempts += 1;
    job.status = "processing";
    await this.save(job);
    return job;
  }

  async complete(id: string): Promise<void> {
    const job = await this.read(id);
    job.status = "completed";
    await this.save(job);
    await this.commands.remove(PROCESSING, id);
  }

  async fail(id: string, reason: string): Promise<"retry" | "failed"> {
    const job = await this.read(id);
    job.lastError = reason;
    await this.commands.remove(PROCESSING, id);
    if (job.attempts >= this.maxAttempts) {
      job.status = "failed";
      await this.save(job);
      await this.commands.push(FAILED, id);
      return "failed";
    }
    job.status = "retry";
    await this.save(job);
    await this.commands.schedule(DELAYED, this.now().getTime() + retryDelayMs(job.attempts), id);
    return "retry";
  }

  async recoverProcessing(): Promise<void> {
    const processing = await this.commands.list(PROCESSING);
    for (const id of processing) {
      await this.commands.remove(PROCESSING, id);
      const job = await this.read(id);
      if (job.attempts >= this.maxAttempts) {
        job.status = "failed";
        await this.save(job);
        await this.commands.push(FAILED, id);
        continue;
      }
      job.status = "retry";
      await this.save(job);
      await this.commands.push(PENDING, id);
    }
  }

  async get(id: string): Promise<QueueJob | null> {
    const raw = await this.commands.get(jobKey(id));
    return raw ? parseJob(raw) : null;
  }

  private async promoteDue(): Promise<void> {
    const due = await this.commands.due(DELAYED, this.now().getTime());
    for (const id of due) {
      if (await this.commands.unschedule(DELAYED, id)) await this.commands.push(PENDING, id);
    }
  }

  private async read(id: string): Promise<QueueJob> {
    const raw = await this.commands.get(jobKey(id));
    if (!raw) throw new Error(`Queued job ${id} is missing`);
    return parseJob(raw);
  }

  private async save(job: QueueJob): Promise<void> {
    await this.commands.set(jobKey(job.id), JSON.stringify(job));
  }
}

const parseJob = (raw: string): QueueJob => {
  const parsed = JSON.parse(raw) as QueueJob;
  const status = parsed.status;
  if (!isStatus(status)) throw new Error("Queued job has an invalid status");
  return parsed;
};

const isStatus = (status: string): status is QueueJobStatus =>
  status === "queued" || status === "processing" || status === "retry" || status === "completed" || status === "failed";
