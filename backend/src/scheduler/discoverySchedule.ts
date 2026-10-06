export const DISCOVERY_TIMEZONE = "Asia/Kolkata";
export const DISCOVERY_HOUR = 8;
const KOLKATA_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export type KolkataParts = {
  dateKey: string;
  weekday: number;
  hours: number;
  minutes: number;
};

export const kolkataParts = (now: Date): KolkataParts => {
  const shifted = new Date(now.getTime() + KOLKATA_OFFSET_MS);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return {
    dateKey: `${shifted.getUTCFullYear()}-${month}-${day}`,
    weekday: shifted.getUTCDay(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
  };
};

export const isDiscoveryWeekday = (weekday: number): boolean => weekday >= 1 && weekday <= 5;

export const discoveryIdempotencyKey = (dateKey: string): string =>
  `job-discovery:${dateKey}:${DISCOVERY_TIMEZONE}`;

export type ScheduleDecision = "weekend" | "waiting" | "duplicate" | "scheduled";

export const tickDiscoverySchedule = async (input: {
  now: Date;
  reserve: (key: string) => Promise<boolean>;
  release: (key: string) => Promise<void>;
  enqueue: (payload: { scheduledFor: string }) => Promise<{ id: string }>;
  announced?: Set<string>;
}): Promise<ScheduleDecision> => {
  const parts = kolkataParts(input.now);
  if (!isDiscoveryWeekday(parts.weekday)) {
    const marker = `weekend:${parts.dateKey}`;
    if (!input.announced?.has(marker)) {
      console.info(`Weekend skipped date=${parts.dateKey} timezone=${DISCOVERY_TIMEZONE}`);
      input.announced?.add(marker);
    }
    return "weekend";
  }
  if (parts.hours < DISCOVERY_HOUR) return "waiting";
  const key = discoveryIdempotencyKey(parts.dateKey);
  const reserved = await input.reserve(key);
  if (!reserved) {
    const marker = `duplicate:${key}`;
    if (!input.announced?.has(marker)) {
      console.info(`Duplicate daily discovery skipped key=${key}`);
      input.announced?.add(marker);
    }
    return "duplicate";
  }
  try {
    const job = await input.enqueue({ scheduledFor: parts.dateKey });
    console.info(`Daily discovery scheduled key=${key} id=${job.id}`);
    return "scheduled";
  } catch (error) {
    await input.release(key);
    throw error;
  }
};
