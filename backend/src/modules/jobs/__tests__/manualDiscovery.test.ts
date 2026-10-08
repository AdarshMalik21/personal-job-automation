import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JobQueue } from "../../../queue/jobQueue.js";
import { MemoryQueueCommands } from "../../../queue/memoryQueue.js";
import { JOB_DISCOVERY } from "../../../queue/types.js";
import { discoveryIdempotencyKey, kolkataParts, tickDiscoverySchedule } from "../../../scheduler/discoverySchedule.js";
import { discoveryHandlers, processNextJob, runScheduledJobDiscovery } from "../../../worker/workerRuntime.js";
import { MANUAL_DISCOVERY_LOCK, enqueueManualJobDiscovery } from "../services/manualDiscovery.js";

process.env.JWT_SECRET ??= "test-secret";
process.env.ADMIN_EMAIL ??= "admin@example.com";
process.env.ADMIN_PASSWORD ??= "password";

const wednesday = new Date("2026-10-07T03:00:00.000Z");

const manual = (commands: MemoryQueueCommands, queue: JobQueue, enqueue = (payload: { scheduledFor: string; trigger: string }) => queue.enqueue(JOB_DISCOVERY, payload)) =>
  enqueueManualJobDiscovery({
    now: wednesday,
    reserve: (key) => commands.setNx(key, "1", 30),
    release: (key) => commands.del(key),
    activeDiscovery: () => queue.activeId(JOB_DISCOVERY),
    enqueue,
  });

describe("manual job discovery", () => {
  it("queues one discovery job through the existing worker pipeline", async () => {
    const commands = new MemoryQueueCommands();
    const queue = new JobQueue(commands);
    const queued = await manual(commands, queue);
    assert.equal(queued.status, "queued");
    assert.equal(typeof queued.jobId, "string");
    const received: boolean[] = [];
    const outcome = await processNextJob(queue, discoveryHandlers(() => runScheduledJobDiscovery(async (dependencies) => {
      received.push(dependencies.validateApplicationUrls);
    })));
    assert.equal(outcome, "completed");
    assert.deepEqual(received, [true]);
    assert.equal(await commands.get(MANUAL_DISCOVERY_LOCK), null);
    assert.equal(await commands.get(discoveryIdempotencyKey(kolkataParts(wednesday).dateKey)), null);
  });

  it("does not enqueue a second job while one is still active", async () => {
    const commands = new MemoryQueueCommands();
    const queue = new JobQueue(commands);
    const first = await manual(commands, queue);
    const second = await manual(commands, queue);
    assert.equal(first.status, "queued");
    assert.deepEqual(second, { status: "already_running", jobId: first.jobId });
    assert.equal((await commands.list("queue:pending")).length, 1);
  });

  it("reports an in-progress request without enqueueing another job", async () => {
    let enqueued = 0;
    const result = await enqueueManualJobDiscovery({
      now: wednesday,
      reserve: async () => false,
      release: async () => undefined,
      activeDiscovery: async () => undefined,
      enqueue: async () => {
        enqueued += 1;
        return { id: "should-not-run" };
      },
    });
    assert.deepEqual(result, { status: "already_running" });
    assert.equal(enqueued, 0);
  });

  it("releases the manual lock when enqueue fails", async () => {
    const commands = new MemoryQueueCommands();
    const queue = new JobQueue(commands);
    await assert.rejects(() => manual(commands, queue, async () => {
      throw new Error("queue unavailable");
    }));
    assert.equal(await commands.get(MANUAL_DISCOVERY_LOCK), null);
    const recovered = await manual(commands, queue);
    assert.equal(recovered.status, "queued");
  });

  it("still allows a manual run after the weekday scheduler has already reserved its key", async () => {
    const commands = new MemoryQueueCommands();
    const queue = new JobQueue(commands);
    const dateKey = kolkataParts(wednesday).dateKey;
    await commands.set(discoveryIdempotencyKey(dateKey), "1");
    const scheduled = await tickDiscoverySchedule({
      now: wednesday,
      reserve: (key) => commands.setNx(key, "1"),
      release: (key) => commands.del(key),
      enqueue: (payload) => queue.enqueue(JOB_DISCOVERY, payload),
    });
    const triggered = await manual(commands, queue);
    assert.equal(scheduled, "duplicate");
    assert.equal(triggered.status, "queued");
    assert.equal(await commands.get(discoveryIdempotencyKey(dateKey)), "1");
    assert.equal((await commands.list("queue:pending")).length, 1);
    const job = await queue.get((await commands.list("queue:pending"))[0] ?? "");
    assert.equal(job?.payload.trigger, "manual");
    assert.equal(job?.payload.scheduledFor, dateKey);
  });
});

describe("manual discovery endpoint", () => {
  it("rejects an unauthenticated request before the handler", async () => {
    const { jobRoutes } = await import("../../../routes/jobRoutes.js");
    const stack = (jobRoutes as unknown as {
      stack: Array<{ name?: string; handle?: { name?: string }; route?: { path?: string; methods?: Record<string, boolean> } }>;
    }).stack;
    assert.equal(stack[0]?.name ?? stack[0]?.handle?.name, "requireAuth");
    assert.equal(stack.some((entry) => entry.route?.path === "/discovery/run" && entry.route.methods?.post), true);
    const { requireAuth } = await import("../../../middleware/auth.js");
    let statusCode = 0;
    requireAuth({ headers: {} } as never, {
      status(status: number) {
        statusCode = status;
        return this;
      },
      json() {
        return undefined;
      },
    } as never, () => {
      throw new Error("next should not be called");
    });
    assert.equal(statusCode, 401);
  });

  it("rejects a signed-in user who is not an admin", async () => {
    const { createDiscoveryHandlers } = await import("../../../controllers/jobDiscoveryController.js");
    const handlers = createDiscoveryHandlers({
      redisConnected: () => true,
      run: async () => ({ status: "queued", jobId: "job-1" }),
      read: async () => null,
    });
    let statusCode = 0;
    let body: unknown;
    await handlers.run({ session: { email: "person@example.com", role: "member" } } as never, {
      status(status: number) {
        statusCode = status;
        return this;
      },
      json(value: unknown) {
        body = value;
      },
    } as never, () => undefined);
    assert.equal(statusCode, 403);
    assert.deepEqual(body, { success: false, message: "Admin access is required" });
  });

  it("returns 202 when an admin queues discovery and when a run is already active", async () => {
    const { createDiscoveryHandlers } = await import("../../../controllers/jobDiscoveryController.js");
    const responses: Array<{ status: string; jobId?: string }> = [
      { status: "queued", jobId: "job-1" },
      { status: "already_running", jobId: "job-1" },
    ];
    const handlers = createDiscoveryHandlers({
      redisConnected: () => true,
      run: async () => {
        const next = responses.shift();
        if (!next?.jobId) throw new Error("missing response");
        return next.status === "queued"
          ? { status: "queued" as const, jobId: next.jobId }
          : { status: "already_running" as const, jobId: next.jobId };
      },
      read: async () => null,
    });
    const send = async () => {
      let statusCode = 0;
      let body: unknown;
      await handlers.run({ session: { email: "admin@example.com", role: "admin" } } as never, {
        status(status: number) {
          statusCode = status;
          return this;
        },
        json(value: unknown) {
          body = value;
        },
      } as never, () => undefined);
      return { statusCode, body };
    };
    const queued = await send();
    const active = await send();
    assert.equal(queued.statusCode, 202);
    assert.deepEqual(queued.body, { success: true, data: { status: "queued", jobId: "job-1" } });
    assert.equal(active.statusCode, 202);
    assert.deepEqual(active.body, { success: true, data: { status: "already_running", jobId: "job-1" } });
  });

  it("returns a failed status when the queue is unavailable", async () => {
    const { createDiscoveryHandlers } = await import("../../../controllers/jobDiscoveryController.js");
    const handlers = createDiscoveryHandlers({
      redisConnected: () => false,
      run: async () => {
        throw new Error("redis://secret should not be called");
      },
      read: async () => null,
    });
    let statusCode = 0;
    let body: unknown;
    await handlers.run({ session: { email: "admin@example.com", role: "admin" } } as never, {
      status(status: number) {
        statusCode = status;
        return this;
      },
      json(value: unknown) {
        body = value;
      },
    } as never, () => undefined);
    assert.equal(statusCode, 503);
    assert.deepEqual(body, {
      success: false,
      message: "Discovery queue is unavailable",
      data: { status: "failed" },
    });
  });
});
