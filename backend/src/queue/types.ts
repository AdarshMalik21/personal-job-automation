export const JOB_DISCOVERY = "JOB_DISCOVERY";
export const DAILY_REPORT = "DAILY_REPORT";
export const MAX_QUEUE_ATTEMPTS = 3;

export type QueueJobStatus = "queued" | "processing" | "retry" | "completed" | "failed";

export type QueueJob = {
  id: string;
  type: string;
  payload: Record<string, string>;
  createdAt: string;
  attempts: number;
  status: QueueJobStatus;
  lastError?: string;
};

export type QueueCommands = {
  set(key: string, value: string): Promise<void>;
  setNx(key: string, value: string, ttlSeconds?: number): Promise<boolean>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<void>;
  push(key: string, value: string): Promise<void>;
  moveTailToHead(source: string, destination: string): Promise<string | null>;
  remove(key: string, value: string): Promise<void>;
  list(key: string): Promise<string[]>;
  schedule(key: string, score: number, member: string): Promise<void>;
  due(key: string, now: number): Promise<string[]>;
  unschedule(key: string, member: string): Promise<boolean>;
};
