import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Job } from "@personal-job-automation/shared/types";
import type { JobSourceAdapter } from "../adapters/JobSourceAdapter.js";
import {
  deriveOpenStatus,
  validateApplicationUrl,
} from "../services/applicationStatus.js";
import { deduplicateJobs } from "../services/deduplicateJobs.js";
import { evaluateFreshness } from "../services/freshness.js";
import { JobSourceOrchestrator } from "../services/jobIngestionOrchestrator.js";
import { normalizeJob } from "../services/jobNormalizer.js";
import { persistJobs, type JobRepository } from "../services/jobPersistence.js";
import type { RawJobInput } from "../types/rawJob.js";

const now = new Date("2026-10-05T00:00:00Z");

const rawJob = (overrides: Partial<RawJobInput> = {}): RawJobInput => ({
  source: "company",
  externalJobId: "job-1",
  title: "Software Engineer",
  company: "Acme Technologies",
  location: "Delhi",
  description: "Build useful products.",
  officialApplicationUrl: "https://jobs.example.test/acme/1",
  postedDate: "2026-10-01T00:00:00Z",
  ...overrides,
});

const adapter = (
  source: RawJobInput["source"],
  jobs: RawJobInput[],
): JobSourceAdapter => ({
  source,
  fetchJobs: async () => jobs,
});

const failingAdapter = (source: RawJobInput["source"]): JobSourceAdapter => ({
  source,
  fetchJobs: async () => {
    throw new Error("source unavailable");
  },
});

const canonical = (input: RawJobInput): Job => normalizeJob(input);

describe("freshness", () => {
  it("distinguishes fresh, stale, boundary, and unknown dates", () => {
    assert.equal(
      evaluateFreshness(
        { postedDate: "2026-10-01T00:00:00Z" },
        { now, freshWithinDays: 30 },
      ).status,
      "fresh",
    );
    assert.equal(
      evaluateFreshness(
        { postedDate: "2026-08-01T00:00:00Z" },
        { now, freshWithinDays: 30 },
      ).status,
      "stale",
    );
    assert.equal(
      evaluateFreshness(
        { postedDate: "2026-09-05T00:00:00Z" },
        { now, freshWithinDays: 30 },
      ).status,
      "fresh",
    );
    assert.equal(
      evaluateFreshness({ postedDate: "invalid" }, { now }).status,
      "unknown",
    );
    assert.equal(evaluateFreshness({}, { now }).status, "unknown");
    assert.equal(
      evaluateFreshness(
        { postedDate: "2026-01-01", updatedDate: "2026-10-01" },
        { now },
      ).status,
      "fresh",
    );
  });
});

describe("deduplicateJobs", () => {
  it("deduplicates canonical matches and prefers the richer representation", () => {
    const result = deduplicateJobs([
      canonical(
        rawJob({
          source: "company",
          externalJobId: "one",
          description: "short",
        }),
      ),
      canonical(
        rawJob({
          source: "greenhouse",
          externalJobId: "two",
          description: "A much more complete description for this same role.",
        }),
      ),
    ]);
    assert.equal(result.jobs.length, 1);
    assert.equal(result.duplicatesRemoved, 1);
    assert.equal(result.jobs[0]?.job.source, "greenhouse");
    assert.equal(result.jobs[0]?.alternateSources[0]?.source, "company");
  });

  it("uses shared official URLs and strong IDs but keeps uncertain jobs separate", () => {
    const sameUrl = deduplicateJobs([
      canonical(
        rawJob({
          externalJobId: "one",
          officialApplicationUrl: "https://jobs.test/same",
        }),
      ),
      canonical(
        rawJob({
          source: "greenhouse",
          externalJobId: "two",
          officialApplicationUrl: "https://jobs.test/same",
        }),
      ),
    ]);
    assert.equal(sameUrl.jobs.length, 1);

    const sameTitleDifferentCompany = deduplicateJobs([
      canonical(
        rawJob({
          company: "Acme",
          externalJobId: "acme-1",
          officialApplicationUrl: "https://jobs.test/acme",
        }),
      ),
      canonical(
        rawJob({
          company: "Other Company",
          externalJobId: "other-1",
          officialApplicationUrl: "https://jobs.test/other",
        }),
      ),
    ]);
    assert.equal(sameTitleDifferentCompany.jobs.length, 2);

    const uncertainFirst = rawJob({ externalJobId: "one" });
    const uncertainSecond = rawJob({ externalJobId: "two" });
    delete uncertainFirst.location;
    delete uncertainFirst.officialApplicationUrl;
    delete uncertainSecond.location;
    delete uncertainSecond.officialApplicationUrl;
    const uncertain = deduplicateJobs([
      canonical(uncertainFirst),
      canonical(uncertainSecond),
    ]);
    assert.equal(uncertain.jobs.length, 2);
  });
});

describe("application URL validation", () => {
  it("distinguishes reachable, dead, invalid, and network-error URLs", async () => {
    const fetcher = async (_url: string, init?: RequestInit) => {
      assert.equal(init?.method, "HEAD");
      return { status: 200 } as Response;
    };
    assert.equal(
      (await validateApplicationUrl("https://jobs.test/open", { fetcher }))
        .status,
      "reachable",
    );
    assert.equal(
      (
        await validateApplicationUrl("https://jobs.test/missing", {
          fetcher: async () => ({ status: 404 }) as Response,
        })
      ).status,
      "unreachable",
    );
    assert.equal(
      (
        await validateApplicationUrl("https://jobs.test/gone", {
          fetcher: async () => ({ status: 410 }) as Response,
        })
      ).status,
      "unreachable",
    );
    const invalid = await validateApplicationUrl("not-a-url", { fetcher });
    assert.equal(invalid.status, "invalid");
    const network = await validateApplicationUrl("https://jobs.test/error", {
      fetcher: async () => {
        throw new Error("network down");
      },
    });
    assert.equal(network.status, "unknown");
    assert.equal(deriveOpenStatus(invalid), "closed");
    assert.equal(deriveOpenStatus(network), "unknown");
  });
});

describe("JobSourceOrchestrator", () => {
  it("combines successful sources and records source failures", async () => {
    const result = await new JobSourceOrchestrator([
      adapter("company", [rawJob()]),
      failingAdapter("greenhouse"),
      adapter("lever", [
        rawJob({
          source: "lever",
          externalJobId: "two",
          company: "Different Co",
        }),
      ]),
    ]).ingest({ now, validateApplicationUrls: false });

    assert.equal(result.stats.totalFetched, 2);
    assert.equal(result.stats.totalValid, 2);
    assert.equal(result.stats.totalDuplicates, 0);
    assert.deepEqual(
      result.sources.map((source) => [source.source, source.status]),
      [
        ["company", "success"],
        ["greenhouse", "failed"],
        ["lever", "success"],
      ],
    );
  });

  it("handles invalid records, empty sources, and URL caching", async () => {
    let urlChecks = 0;
    const result = await new JobSourceOrchestrator([
      adapter("company", [rawJob(), { ...rawJob(), title: " " }]),
      adapter("lever", []),
    ]).ingest({
      now,
      validateApplicationUrls: true,
      urlFetcher: async () => {
        urlChecks += 1;
        return { status: 200 } as Response;
      },
    });

    assert.equal(result.stats.totalFetched, 2);
    assert.equal(result.stats.totalInvalid, 1);
    assert.equal(result.stats.totalNormalized, 1);
    assert.equal(result.stats.totalFresh, 1);
    assert.equal(result.stats.totalUnknownStatus, 1);
    assert.equal(urlChecks, 1);
  });

  it("returns an empty clean collection when every source fails", async () => {
    const result = await new JobSourceOrchestrator([
      failingAdapter("company"),
      failingAdapter("greenhouse"),
    ]).ingest();

    assert.equal(result.jobs.length, 0);
    assert.equal(result.stats.totalFetched, 0);
    assert.equal(
      result.sources.every((source) => source.status === "failed"),
      true,
    );
  });
});

describe("job persistence boundary", () => {
  it("delegates repeat ingestion to an upsert repository without creating a second flow", async () => {
    const calls: Job[] = [];
    const repository: JobRepository = {
      upsert: async (job) => {
        calls.push(job);
      },
    };
    const job = canonical(rawJob());
    await persistJobs([job], repository);
    await persistJobs(
      [{ ...job, description: "Refreshed description" }],
      repository,
    );

    assert.equal(calls.length, 2);
    assert.equal(
      calls[0]?.canonicalIdentity.key,
      calls[1]?.canonicalIdentity.key,
    );
    assert.equal(calls[1]?.description, "Refreshed description");
  });
});
