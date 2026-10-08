import { kolkataParts } from "../../../scheduler/discoverySchedule.js";

export const MANUAL_DISCOVERY_LOCK = "job-discovery:manual:lock";

export type ManualDiscoveryRequest = {
  status: "queued" | "already_running";
  jobId?: string;
};

export const enqueueManualJobDiscovery = async (input: {
  now: Date;
  reserve: (key: string) => Promise<boolean>;
  release: (key: string) => Promise<void>;
  activeDiscovery: () => Promise<string | undefined>;
  enqueue: (payload: { scheduledFor: string; trigger: string }) => Promise<{ id: string }>;
}): Promise<ManualDiscoveryRequest> => {
  const locked = await input.reserve(MANUAL_DISCOVERY_LOCK);
  if (!locked) {
    const jobId = await input.activeDiscovery();
    return jobId ? { status: "already_running", jobId } : { status: "already_running" };
  }
  try {
    const jobId = await input.activeDiscovery();
    if (jobId) return { status: "already_running", jobId };
    const job = await input.enqueue({
      scheduledFor: kolkataParts(input.now).dateKey,
      trigger: "manual",
    });
    return { status: "queued", jobId: job.id };
  } finally {
    await input.release(MANUAL_DISCOVERY_LOCK);
  }
};
