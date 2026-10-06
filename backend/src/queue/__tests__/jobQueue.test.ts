import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { JobQueue } from "../jobQueue.js";
import { MemoryQueueCommands } from "../memoryQueue.js";
import { JOB_DISCOVERY } from "../types.js";

const queueAt = (start = 0) => {
  let current = start;
  const commands = new MemoryQueueCommands();
  const queue = new JobQueue(commands, () => new Date(current));
  return {
    commands,
    queue,
    advance(ms: number) {
      current += ms;
    },
  };
};

describe("Redis job queue", () => {
  it("enqueues and claims a job once", async () => {
    const { queue } = queueAt();
    const queued = await queue.enqueue(JOB_DISCOVERY, { scheduledFor: "2026-10-07" });
    const claimed = await queue.claim();
    assert.equal(claimed?.id, queued.id);
    assert.equal(claimed?.type, JOB_DISCOVERY);
    assert.equal(claimed?.payload.scheduledFor, "2026-10-07");
    assert.equal(claimed?.attempts, 1);
    assert.equal(claimed?.status, "processing");
    assert.equal(await queue.claim(), null);
    await queue.complete(queued.id);
    assert.equal((await queue.get(queued.id))?.status, "completed");
  });

  it("retries with backoff and fails after three attempts", async () => {
    const clock = queueAt();
    const queued = await clock.queue.enqueue(JOB_DISCOVERY);
    const first = await clock.queue.claim();
    assert.equal(await clock.queue.fail(first!.id, "source down"), "retry");
    assert.equal((await clock.queue.get(queued.id))?.status, "retry");
    assert.equal(await clock.queue.claim(), null);
    clock.advance(1000);
    const second = await clock.queue.claim();
    assert.equal(second?.attempts, 2);
    assert.equal(await clock.queue.fail(second!.id, "source down"), "retry");
    clock.advance(2000);
    const third = await clock.queue.claim();
    assert.equal(third?.attempts, 3);
    assert.equal(await clock.queue.fail(third!.id, "source down"), "failed");
    clock.advance(10_000);
    assert.equal(await clock.queue.claim(), null);
    assert.equal((await clock.queue.get(queued.id))?.status, "failed");
  });

  it("returns an interrupted processing job to the queue", async () => {
    const { queue } = queueAt();
    const queued = await queue.enqueue(JOB_DISCOVERY);
    await queue.claim();
    await queue.recoverProcessing();
    const again = await queue.claim();
    assert.equal(again?.id, queued.id);
    assert.equal(again?.status, "processing");
    assert.equal(again?.attempts, 2);
  });
});
