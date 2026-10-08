import type { RequestHandler } from "express";
import { getRedisStatus, redisClient } from "../config/redis.js";
import { errorText } from "../config/redact.js";
import { enqueueManualJobDiscovery, type ManualDiscoveryRequest } from "../modules/jobs/services/manualDiscovery.js";
import { JobQueue } from "../queue/jobQueue.js";
import { createRedisCommands } from "../queue/redisCommands.js";
import { JOB_DISCOVERY } from "../queue/types.js";

const LOCK_TTL_SECONDS = 30;

type DiscoveryRuntime = {
  redisConnected: () => boolean;
  run: (now: Date) => Promise<ManualDiscoveryRequest>;
  read: (jobId: string) => Promise<{ id: string; type: string; status: string } | null>;
};

const jobIdOf = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] ?? "" : value ?? "";

const requireAdmin = (request: Parameters<RequestHandler>[0], response: Parameters<RequestHandler>[1]): boolean => {
  if (request.session?.role === "admin") return true;
  response.status(403).json({ success: false, message: "Admin access is required" });
  return false;
};

export const createDiscoveryHandlers = (runtime: DiscoveryRuntime) => {
  const run: RequestHandler = async (request, response) => {
    if (!requireAdmin(request, response)) return;
    if (!runtime.redisConnected()) {
      response.status(503).json({
        success: false,
        message: "Discovery queue is unavailable",
        data: { status: "failed" },
      });
      return;
    }
    try {
      const result = await runtime.run(new Date());
      response.status(202).json({ success: true, data: result });
    } catch (error) {
      console.error("Manual discovery enqueue failed:", errorText(error));
      response.status(503).json({
        success: false,
        message: "Discovery could not be queued",
        data: { status: "failed" },
      });
    }
  };

  const status: RequestHandler = async (request, response) => {
    if (!requireAdmin(request, response)) return;
    if (!runtime.redisConnected()) {
      response.status(503).json({
        success: false,
        message: "Discovery queue is unavailable",
        data: { status: "failed" },
      });
      return;
    }
    try {
      const job = await runtime.read(jobIdOf(request.params.jobId));
      if (!job || job.type !== JOB_DISCOVERY) {
        response.status(404).json({ success: false, message: "Discovery run not found" });
        return;
      }
      response.json({ success: true, data: { status: job.status, jobId: job.id } });
    } catch (error) {
      console.error("Manual discovery status failed:", errorText(error));
      response.status(503).json({
        success: false,
        message: "Discovery status is unavailable",
        data: { status: "failed" },
      });
    }
  };

  return { run, status };
};

const productionRuntime = (): DiscoveryRuntime => ({
  redisConnected: () => getRedisStatus() === "connected",
  run: async (now) => {
    const commands = createRedisCommands(redisClient);
    const queue = new JobQueue(commands);
    return enqueueManualJobDiscovery({
      now,
      reserve: (key) => commands.setNx(key, "1", LOCK_TTL_SECONDS),
      release: (key) => commands.del(key),
      activeDiscovery: () => queue.activeId(JOB_DISCOVERY),
      enqueue: (payload) => queue.enqueue(JOB_DISCOVERY, payload),
    });
  },
  read: async (jobId) => {
    const queue = new JobQueue(createRedisCommands(redisClient));
    return queue.get(jobId);
  },
});

export const discoveryHandlers = createDiscoveryHandlers(productionRuntime());
