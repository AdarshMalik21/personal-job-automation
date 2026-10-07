import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CandidateProfile } from "@personal-job-automation/shared/types";
import type { JobSourceAdapter } from "../../modules/jobs/adapters/JobSourceAdapter.js";
import { runJobDiscovery } from "../../modules/jobs/services/jobDiscovery.js";
import type { JobRepository } from "../../modules/jobs/services/jobPersistence.js";
import type { RawJobInput } from "../../modules/jobs/types/rawJob.js";
import { JobQueue } from "../../queue/jobQueue.js";
import { MemoryQueueCommands } from "../../queue/memoryQueue.js";
import { DAILY_REPORT, JOB_DISCOVERY } from "../../queue/types.js";
import { discoveryHandlers, processNextJob, runScheduledJobDiscovery, runWorkerLoop, scheduleDailyReport } from "../workerRuntime.js";

const rawJob = (): RawJobInput => ({
  source: "greenhouse",
  externalJobId: "gh-1",
  title: "Full Stack Developer",
  company: "Acme Technologies",
  location: "Delhi",
  description: "Build React and Node services.",
  officialApplicationUrl: "https://jobs.example.test/acme/1",
  postedDate: "2026-10-01T00:00:00.000Z",
  requiredSkills: ["javascript", "react", "node.js"],
});

const candidate: CandidateProfile = {
  isActive: true,
  personal: { firstName: "Asha" },
  contact: { email: "asha@example.com" },
  yearsOfExperience: 2,
  experience: [],
  education: [],
  skills: ["javascript", "react", "node.js", "mongodb"],
  technologies: ["express.js"],
  projects: [],
  certifications: [],
  preferredRoles: ["Full Stack Developer"],
  preferredLocations: ["Delhi"],
  remotePreference: "any",
  verifiedInformation: {},
  relatedTechnology: [],
  unknownInformation: [],
};

describe("job discovery worker", () => {
  it("dispatches JOB_DISCOVERY through the existing ingestion pipeline", async () => {
    let fetched = 0;
    const adapter: JobSourceAdapter = {
      source: "greenhouse",
      fetchJobs: async () => {
        fetched += 1;
        return [rawJob()];
      },
    };
    const saved: string[] = [];
    const repository: JobRepository = {
      upsert: async (job) => {
        saved.push(`${job.title}:${job.match?.decision ?? "none"}`);
      },
    };
    const commands = new MemoryQueueCommands();
    const queue = new JobQueue(commands);
    await queue.enqueue(JOB_DISCOVERY, { scheduledFor: "2026-10-06" });
    const outcome = await processNextJob(queue, discoveryHandlers(() => runJobDiscovery({
      adapters: [adapter],
      repository,
      candidate,
      validateApplicationUrls: false,
    })));
    assert.equal(outcome, "completed");
    assert.equal(fetched, 1);
    assert.equal(saved.length, 1);
    assert.match(saved[0] ?? "", /^Full Stack Developer:/);
    assert.equal((await queue.get((await commands.list("queue:pending"))[0] ?? "")) , null);
  });

  it("requests application URL validation from the scheduled discovery handler", async () => {
    const received: boolean[] = [];
    const record = async (dependencies: { validateApplicationUrls: boolean }) => {
      received.push(dependencies.validateApplicationUrls);
    };
    await runScheduledJobDiscovery(record);
    const commands = new MemoryQueueCommands();
    const queue = new JobQueue(commands);
    await queue.enqueue(JOB_DISCOVERY, { scheduledFor: "2026-10-06" });
    const outcome = await processNextJob(queue, discoveryHandlers(() => runScheduledJobDiscovery(record)));
    assert.equal(outcome, "completed");
    assert.deepEqual(received, [true, true]);
  });

  it("retries a failed discovery job and can shut down after the current job", async () => {
    const commands = new MemoryQueueCommands();
    let now = Date.parse("2026-10-06T03:00:00.000Z");
    const queue = new JobQueue(commands, () => new Date(now));
    let attempts = 0;
    let running = true;
    let steps = 0;
    const handlers = discoveryHandlers(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary source failure");
      running = false;
    });
    await runWorkerLoop({
      queue,
      handlers,
      reserve: (key) => commands.setNx(key, "1"),
      release: (key) => commands.del(key),
      isRunning: () => running && steps++ < 8,
      now: () => new Date(now),
      sleep: async () => {
        now += 1000;
      },
    });
    assert.equal(attempts, 2);
    const jobs = await Promise.all((await commands.list("queue:processing")).map((id) => queue.get(id)));
    assert.equal(jobs.every((job) => job?.status !== "processing"), true);
  });

  it("enqueues one daily report after discovery and retries a failed notification", async () => {
    const commands = new MemoryQueueCommands();
    const queue = new JobQueue(commands);
    let published = 0;
    const hooks = {
      reserve: (key: string) => commands.setNx(key, "1"),
      release: (key: string) => commands.del(key),
      enqueue: (payload: { scheduledFor: string }) => queue.enqueue(DAILY_REPORT, payload),
      publish: async () => {
        published += 1;
        if (published === 1) throw new Error("notification provider unavailable");
      },
    };
    const handlers = discoveryHandlers(async () => undefined, hooks);
    await queue.enqueue(JOB_DISCOVERY, { scheduledFor: "2026-10-07" });
    assert.equal(await processNextJob(queue, handlers), "completed");
    assert.equal(await scheduleDailyReport("2026-10-07", hooks), "duplicate");
    assert.equal(await processNextJob(queue, handlers), "retry");
    assert.equal(published, 1);
    const released = await scheduleDailyReport("2026-10-08", {
      reserve: async () => true,
      release: async () => undefined,
      enqueue: async () => {
        throw new Error("queue unavailable");
      },
    });
    assert.equal(released, "enqueue_failed");
  });

  it("does not call application submission", async () => {
    const source = await import("node:fs").then((fs) => fs.readFileSync(new URL("../workerRuntime.ts", import.meta.url), "utf8"));
    const discovery = await import("node:fs").then((fs) => fs.readFileSync(new URL("../../modules/jobs/services/jobDiscovery.ts", import.meta.url), "utf8"));
    assert.equal(source.includes("submitHeldApplication"), false);
    assert.equal(discovery.includes("applicationSubmission"), false);
    assert.equal(discovery.includes("submitReviewedApplication"), false);
  });
});
