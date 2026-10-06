import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  discoveryIdempotencyKey,
  kolkataParts,
  tickDiscoverySchedule,
} from "../discoverySchedule.js";

const reserveOnce = () => {
  const keys = new Set<string>();
  return {
    keys,
    reserve: async (key: string) => {
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    },
    release: async (key: string) => {
      keys.delete(key);
    },
  };
};

describe("daily discovery schedule", () => {
  it("uses 08:00 Asia/Kolkata on weekdays and skips the weekend", async () => {
    const mondayMorning = new Date("2026-10-05T02:30:00.000Z");
    const mondayParts = kolkataParts(mondayMorning);
    assert.equal(mondayParts.dateKey, "2026-10-05");
    assert.equal(mondayParts.hours, 8);
    assert.equal(mondayParts.weekday, 1);
    assert.equal(discoveryIdempotencyKey(mondayParts.dateKey), "job-discovery:2026-10-05:Asia/Kolkata");

    const beforeOpen = await tickDiscoverySchedule({
      now: new Date("2026-10-05T02:29:00.000Z"),
      ...reserveOnce(),
      enqueue: async () => { throw new Error("too early"); },
    });
    assert.equal(beforeOpen, "waiting");

    const friday = await tickDiscoverySchedule({
      now: new Date("2026-10-09T02:30:00.000Z"),
      ...reserveOnce(),
      enqueue: async () => ({ id: "friday-job" }),
    });
    assert.equal(friday, "scheduled");

    const saturday = await tickDiscoverySchedule({
      now: new Date("2026-10-10T02:30:00.000Z"),
      ...reserveOnce(),
      enqueue: async () => { throw new Error("weekend"); },
    });
    assert.equal(saturday, "weekend");
    const sunday = await tickDiscoverySchedule({
      now: new Date("2026-10-11T04:00:00.000Z"),
      ...reserveOnce(),
      enqueue: async () => { throw new Error("weekend"); },
    });
    assert.equal(sunday, "weekend");
  });

  it("does not enqueue a second discovery job after a restart on the same day", async () => {
    const gate = reserveOnce();
    const enqueued: string[] = [];
    const tick = () => tickDiscoverySchedule({
      now: new Date("2026-10-06T03:15:00.000Z"),
      ...gate,
      enqueue: async (payload) => {
        enqueued.push(payload.scheduledFor);
        return { id: `job-${enqueued.length}` };
      },
    });
    assert.equal(await tick(), "scheduled");
    assert.equal(await tick(), "duplicate");
    assert.equal(await tick(), "duplicate");
    assert.deepEqual(enqueued, ["2026-10-06"]);
    assert.equal(gate.keys.has("job-discovery:2026-10-06:Asia/Kolkata"), true);
  });

  it("releases the idempotency key when enqueue fails", async () => {
    const gate = reserveOnce();
    await assert.rejects(() => tickDiscoverySchedule({
      now: new Date("2026-10-06T03:15:00.000Z"),
      ...gate,
      enqueue: async () => { throw new Error("queue unavailable"); },
    }));
    assert.equal(gate.keys.size, 0);
  });
});
