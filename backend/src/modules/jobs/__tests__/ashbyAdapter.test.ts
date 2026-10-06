import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FetchLike } from "../adapters/JobSourceAdapter.js";
import { AshbyAdapter } from "../adapters/ashby/AshbyAdapter.js";

const response = (body: unknown, ok = true, status = 200): Response =>
  ({ ok, status, json: async () => body }) as Response;

describe("AshbyAdapter", () => {
  it("maps multiple jobs and keeps explicit Ashby metadata", async () => {
    const fetcher: FetchLike = async () =>
      response({
        jobs: [
          {
            id: "ashby-1",
            title: "Platform Engineer",
            location: "Bengaluru",
            workplaceType: "Hybrid",
            employmentType: "Full-time",
            descriptionPlain: "Own platform reliability.",
            jobUrl: "https://jobs.ashbyhq.com/acme/ashby-1",
            applyUrl: "https://jobs.ashbyhq.com/acme/ashby-1/application",
            publishedAt: "2026-09-20T00:00:00Z",
            updatedAt: "2026-10-01T00:00:00Z",
          },
          { id: "ashby-2", title: "Designer" },
          { id: "bad", title: "" },
        ],
      });
    const jobs = await new AshbyAdapter({
      boardName: "acme",
      companyName: "Acme",
      fetcher,
    }).fetchJobs();
    assert.equal(jobs.length, 2);
    assert.equal(jobs[0]?.externalJobId, "ashby-1");
    assert.equal(jobs[0]?.officialApplicationUrl, "https://jobs.ashbyhq.com/acme/ashby-1/application");
    assert.equal(jobs[0]?.location, "Bengaluru");
    assert.equal(jobs[0]?.remoteStatus, "Hybrid");
    assert.equal(jobs[0]?.employmentType, "Full-time");
    assert.equal(jobs[0]?.company, "Acme");
    assert.equal(jobs[1]?.description, undefined);
    assert.equal(jobs[1]?.officialApplicationUrl, undefined);
  });

  it("fails for malformed responses, HTTP errors, and fetch failures", async () => {
    const adapter = (fetcher: FetchLike) =>
      new AshbyAdapter({ boardName: "acme", companyName: "Acme", fetcher });
    await assert.rejects(() => adapter(async () => response([])).fetchJobs(), /malformed/);
    await assert.rejects(() => adapter(async () => response({}, false, 500)).fetchJobs(), /HTTP 500/);
    await assert.rejects(
      () => adapter(async () => { throw new Error("offline"); }).fetchJobs(),
      /offline/,
    );
  });

  it("reports request timeouts", async () => {
    await assert.rejects(
      () =>
        new AshbyAdapter({
          boardName: "acme",
          companyName: "Acme",
          fetcher: (_url, init) =>
            new Promise((_resolve, reject) =>
              init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))),
            ),
        }).fetchJobs({ timeoutMs: 1 }),
      /timed out after 1ms/,
    );
  });
});
