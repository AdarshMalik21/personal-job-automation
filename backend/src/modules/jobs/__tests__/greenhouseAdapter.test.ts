import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FetchLike } from "../adapters/JobSourceAdapter.js";
import { GreenhouseAdapter } from "../adapters/greenhouse/GreenhouseAdapter.js";
import {
  greenhouseBoardResponse,
  greenhouseJobsResponse,
} from "./fixtures/greenhouseResponse.js";
import { normalizeJob } from "../services/jobNormalizer.js";

const response = (body: unknown, ok = true, status = 200): Response =>
  ({ ok, status, json: async () => body }) as Response;

const createFetcher =
  (overrides: Record<string, Response> = {}): FetchLike =>
  async (url) =>
    overrides[url] ??
    response(
      url.includes("/jobs?") ? greenhouseJobsResponse : greenhouseBoardResponse,
    );

describe("GreenhouseAdapter", () => {
  it("maps Greenhouse jobs to RawJobInput", async () => {
    const adapter = new GreenhouseAdapter({
      boardToken: "example",
      fetcher: createFetcher(),
    });

    const jobs = await adapter.fetchJobs();
    const job = jobs[0];

    assert.equal(jobs.length, 1);
    assert.equal(job?.source, "greenhouse");
    assert.equal(job?.externalJobId, "12345");
    assert.equal(job?.title, "Senior Full Stack Developer");
    assert.equal(job?.company, "Example Technologies");
    assert.equal(job?.location, "Noida, Uttar Pradesh, India");
    assert.equal(
      job?.officialApplicationUrl,
      "https://boards.greenhouse.io/example/jobs/12345",
    );
    assert.equal(job?.sourceUrl, job?.officialApplicationUrl);
    assert.match(job?.description ?? "", /Build reliable/);
    assert.equal(job?.postedDate, "2026-09-15T10:00:00Z");
    assert.equal(job?.updatedDate, "2026-10-01T10:00:00Z");
    assert.equal(job?.remoteStatus, undefined);
    assert.equal(job?.requiredSkills, undefined);
  });

  it("supports configured company names and preserves missing optional fields", async () => {
    const adapter = new GreenhouseAdapter({
      boardToken: "example",
      companyName: "Configured Company",
      fetcher: createFetcher({
        "https://boards-api.greenhouse.io/v1/boards/example/jobs?content=true":
          response({
            jobs: [{ id: 99, title: "Engineer" }],
          }),
      }),
    });

    const [job] = await adapter.fetchJobs();
    assert.equal(job?.company, "Configured Company");
    assert.equal(job?.location, undefined);
    assert.equal(job?.description, undefined);
    assert.equal(job?.officialApplicationUrl, undefined);
    assert.equal(job?.postedDate, undefined);
  });

  it("fails clearly for HTTP errors and malformed responses", async () => {
    const httpFailure = new GreenhouseAdapter({
      boardToken: "example",
      fetcher: createFetcher({
        "https://boards-api.greenhouse.io/v1/boards/example": response(
          {},
          false,
          503,
        ),
      }),
    });
    await assert.rejects(() => httpFailure.fetchJobs(), /HTTP 503/);

    const malformed = new GreenhouseAdapter({
      boardToken: "example",
      fetcher: createFetcher({
        "https://boards-api.greenhouse.io/v1/boards/example/jobs?content=true":
          response({ jobs: [{ id: "bad" }] }),
      }),
    });
    await assert.rejects(() => malformed.fetchJobs(), /invalid job/);
  });

  it("passes adapter output through validation and normalization", async () => {
    const adapter = new GreenhouseAdapter({
      boardToken: "example",
      fetcher: createFetcher(),
    });
    const [rawJob] = await adapter.fetchJobs();
    const canonicalJob = normalizeJob(rawJob!);

    assert.equal(canonicalJob.source, "greenhouse");
    assert.equal(canonicalJob.normalizedTitle, "senior full stack developer");
    assert.equal(canonicalJob.normalizedLocation, "noida uttar pradesh india");
    assert.equal(canonicalJob.canonicalIdentity.confidence, "strong");
  });
});
