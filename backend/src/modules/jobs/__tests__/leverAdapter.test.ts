import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FetchLike } from "../adapters/JobSourceAdapter.js";
import { LeverAdapter } from "../adapters/lever/LeverAdapter.js";

const response = (body: unknown, ok = true, status = 200): Response =>
  ({ ok, status, json: async () => body }) as Response;

const leverJobs = [
  {
    id: "lever-123",
    text: "Backend Engineer",
    descriptionPlain: "Build APIs.",
    categories: { location: "Remote - India", commitment: "Full-time" },
    workplaceType: "remote",
    hostedUrl: "https://jobs.lever.co/acme/lever-123",
    applyUrl: "https://jobs.lever.co/acme/lever-123/apply",
    createdAt: 1_759_000_000_000,
    updatedAt: 1_759_100_000_000,
  },
  { id: "lever-456", text: "QA Engineer" },
  { id: "invalid", text: "" },
];

describe("LeverAdapter", () => {
  it("maps multiple jobs and preserves IDs, URLs, and explicit metadata", async () => {
    const fetcher: FetchLike = async () => response(leverJobs);
    const [first, second] = await new LeverAdapter({
      site: "acme",
      companyName: "Acme",
      fetcher,
    }).fetchJobs();

    assert.equal(first?.externalJobId, "lever-123");
    assert.equal(first?.officialApplicationUrl, "https://jobs.lever.co/acme/lever-123/apply");
    assert.equal(first?.sourceUrl, "https://jobs.lever.co/acme/lever-123");
    assert.equal(first?.location, "Remote - India");
    assert.equal(first?.remoteStatus, "remote");
    assert.equal(first?.employmentType, "Full-time");
    assert.equal(first?.company, "Acme");
    assert.ok(first?.postedDate);
    assert.ok(first?.updatedDate);
    assert.equal(second?.externalJobId, "lever-456");
    assert.equal(second?.location, undefined);
    assert.equal(second?.remoteStatus, undefined);
    assert.equal((await new LeverAdapter({
      site: "acme",
      companyName: "Acme",
      fetcher,
    }).fetchJobs()).length, 2);
  });

  it("fails for malformed envelopes, HTTP errors, and fetch failures", async () => {
    await assert.rejects(
      () =>
        new LeverAdapter({
          site: "acme",
          companyName: "Acme",
          fetcher: async () => response({ jobs: [] }),
        }).fetchJobs(),
      /Lever fetch failed: Lever response is malformed/,
    );
    await assert.rejects(
      () =>
        new LeverAdapter({
          site: "acme",
          companyName: "Acme",
          fetcher: async () => response({}, false, 503),
        }).fetchJobs(),
      /HTTP 503/,
    );
    await assert.rejects(
      () =>
        new LeverAdapter({
          site: "acme",
          companyName: "Acme",
          fetcher: async () => {
            throw new Error("network down");
          },
        }).fetchJobs(),
      /network down/,
    );
  });

  it("reports request timeouts", async () => {
    await assert.rejects(
      () =>
        new LeverAdapter({
          site: "acme",
          companyName: "Acme",
          fetcher: (_url, init) =>
            new Promise((_resolve, reject) =>
              init?.signal?.addEventListener("abort", () =>
                reject(new Error("aborted")),
              ),
            ),
        }).fetchJobs({ timeoutMs: 1 }),
      /timed out after 1ms/,
    );
  });
});
