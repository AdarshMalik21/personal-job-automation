import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { CandidateProfile, Job } from "@personal-job-automation/shared/types";
import type { FetchLike } from "../adapters/JobSourceAdapter.js";
import { PermanentDiscoveryError, runJobDiscovery } from "../services/jobDiscovery.js";
import type { JobRepository } from "../services/jobPersistence.js";
import { createJobSourceAdapters, type JobSourceConfig } from "../sources/jobSourceConfig.js";

const response = (body: unknown, ok = true, status = 200): Response =>
  ({ ok, status, json: async () => body }) as Response;

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
  preferredLocations: ["Gurugram", "Delhi", "Noida"],
  remotePreference: "any",
  verifiedInformation: {},
  relatedTechnology: [],
  unknownInformation: [],
};

const greenhouseJob = {
  id: 11,
  title: "Full Stack Developer",
  location: { name: "Gurugram" },
  absolute_url: "https://boards.greenhouse.io/acme/jobs/11",
  first_published: "2026-10-01T00:00:00.000Z",
  content: "Build React and Node services.",
};

describe("configured job discovery", () => {
  it("runs every configured source through ingestion, matching, and persistence", async () => {
    const fetcher: FetchLike = async (url) => {
      if (url.includes("greenhouse.io")) return response({ jobs: [greenhouseJob] });
      if (url.includes("lever.co")) return response([]);
      if (url.includes("ashbyhq.com")) return response({ jobs: [] });
      if (url.includes("broken.test")) return response({ jobs: [] });
      return response({ positions: [] });
    };
    const sources: JobSourceConfig[] = [
      { id: "greenhouse", enabled: true, type: "greenhouse", boardToken: "acme", companyName: "Acme" },
      { id: "lever", enabled: true, type: "lever", site: "acme", companyName: "Acme" },
      { id: "ashby", enabled: true, type: "ashby", boardName: "acme", companyName: "Acme" },
      { id: "skipped", enabled: false, type: "greenhouse", boardToken: "ignored", companyName: "Ignored" },
      {
        id: "company",
        enabled: true,
        type: "company",
        companyName: "Acme",
        endpoint: "https://acme.test/careers.json",
        parser: (_value, config) => [
          {
            source: "company",
            externalJobId: "company-11",
            title: "Full Stack Developer",
            company: config.companyName,
            location: "Gurugram",
            officialApplicationUrl: "https://boards.greenhouse.io/acme/jobs/11",
            postedDate: "2026-10-01T00:00:00.000Z",
          },
          { source: "company", externalJobId: "bad", title: " ", company: config.companyName },
        ],
      },
      {
        id: "malformed",
        enabled: true,
        type: "company",
        companyName: "Broken",
        endpoint: "https://broken.test/careers.json",
        parser: () => [],
      },
    ];
    const saved: Job[] = [];
    const repository: JobRepository = { upsert: async (job) => { saved.push(job); } };
    let urlChecks = 0;
    const lines: string[] = [];
    const original = console.info;
    console.info = (...args: unknown[]) => {
      lines.push(args.map((value) => String(value)).join(" "));
    };
    try {
      const result = await runJobDiscovery({
        adapters: createJobSourceAdapters(sources, { fetcher }),
        repository,
        candidate,
        validateApplicationUrls: true,
        urlFetcher: async () => {
          urlChecks += 1;
          return { status: 200 } as Response;
        },
      });
      assert.equal(result.status, "succeeded");
      assert.equal(result.candidateLoaded, true);
      assert.equal(result.unmatched, 0);
      assert.equal(result.matched, result.persisted);
      assert.equal(result.persisted, 1);
      assert.equal(result.stats.totalInvalid, 1);
      assert.equal(result.stats.totalDuplicates, 1);
      assert.equal(result.stats.totalFresh, 1);
      assert.equal(result.sources.filter((source) => source.status === "success").length, 5);
      assert.equal(result.sources.filter((source) => source.status === "failed").length, 0);
      assert.equal(result.sources.find((source) => source.source === "ashby")?.fetched, 0);
      assert.equal(result.sources.find((source) => source.source === "ashby")?.status, "success");
      assert.equal(saved.length, 1);
      assert.equal(saved[0]?.title, "Full Stack Developer");
      assert.equal(saved[0]?.normalizedCompany, "acme");
      assert.ok(saved[0]?.canonicalIdentity.crossSourceKey);
      assert.equal(typeof saved[0]?.match?.decision, "string");
      assert.equal(urlChecks, 1);
      assert.equal(lines.some((line) => line.includes("Job discovery started sources=5")), true);
      assert.equal(lines.some((line) => line.includes("attempted=5") && line.includes("succeeded=5") && line.includes("failed=0")), true);
      assert.equal(lines.some((line) => line.includes("persisted=1")), true);
    } finally {
      console.info = original;
    }
  });

  it("leaves application URL checks off unless discovery asks for them", async () => {
    let urlChecks = 0;
    const repository: JobRepository = { upsert: async () => undefined };
    await runJobDiscovery({
      adapters: createJobSourceAdapters([
        { id: "greenhouse", enabled: true, type: "greenhouse", boardToken: "acme", companyName: "Acme" },
      ], {
        fetcher: async () => response({ jobs: [greenhouseJob] }),
      }),
      repository,
      candidate,
      validateApplicationUrls: false,
      urlFetcher: async () => {
        urlChecks += 1;
        return { status: 200 } as Response;
      },
    });
    assert.equal(urlChecks, 0);
  });

  it("fails before persistence when any configured source fails", async () => {
    let saved = 0;
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map((value) => String(value)).join(" "));
    };
    try {
      await assert.rejects(
        () => runJobDiscovery({
          adapters: createJobSourceAdapters([
            { id: "greenhouse", enabled: true, type: "greenhouse", boardToken: "acme", companyName: "Acme" },
            { id: "lever", enabled: true, type: "lever", site: "acme", companyName: "Acme" },
          ], {
            fetcher: async (url) => {
              if (String(url).includes("lever.co")) throw new Error("request timed out after 10000ms");
              return response({ jobs: [greenhouseJob] });
            },
          }),
          repository: { upsert: async () => { saved += 1; } },
          candidate,
        }),
        (error: unknown) => {
          assert.equal(error instanceof PermanentDiscoveryError, false);
          assert.equal(error instanceof Error, true);
          assert.match((error as Error).message, /failed for a configured source/);
          return true;
        },
      );
      assert.equal(saved, 0);
      assert.equal(warnings.some((line) => line.includes("attempted=2") && line.includes("succeeded=1") && line.includes("failed=1")), true);
    } finally {
      console.warn = original;
    }
  });

  it("fails before persistence when every configured source fails", async () => {
    let saved = 0;
    await assert.rejects(
      () => runJobDiscovery({
        adapters: createJobSourceAdapters([
          { id: "greenhouse", enabled: true, type: "greenhouse", boardToken: "acme", companyName: "Acme" },
          { id: "lever", enabled: true, type: "lever", site: "acme", companyName: "Acme" },
        ], {
          fetcher: async () => {
            throw new Error("source unavailable");
          },
        }),
        repository: { upsert: async () => { saved += 1; } },
        candidate,
      }),
      (error: unknown) => {
        assert.equal(error instanceof PermanentDiscoveryError, false);
        assert.match((error as Error).message, /failed for every configured source/);
        return true;
      },
    );
    await assert.rejects(
      () => runJobDiscovery({
        adapters: [],
        repository: { upsert: async () => { saved += 1; } },
        candidate,
      }),
      (error: unknown) => {
        assert.equal(error instanceof PermanentDiscoveryError, false);
        assert.match((error as Error).message, /no configured sources/);
        return true;
      },
    );
    assert.equal(saved, 0);
  });

  it("fails before persistence when no usable candidate is available", async () => {
    let saved = 0;
    let fetched = 0;
    await assert.rejects(
      () => runJobDiscovery({
        adapters: createJobSourceAdapters([
          { id: "greenhouse", enabled: true, type: "greenhouse", boardToken: "acme", companyName: "Acme" },
        ], {
          fetcher: async () => {
            fetched += 1;
            return response({ jobs: [greenhouseJob] });
          },
        }),
        repository: { upsert: async () => { saved += 1; } },
        candidate: null,
      }),
      /usable active candidate/,
    );
    await assert.rejects(
      () => runJobDiscovery({
        adapters: [],
        repository: { upsert: async () => { saved += 1; } },
        candidate: { ...candidate, isActive: false },
      }),
      /usable active candidate/,
    );
    await assert.rejects(
      () => runJobDiscovery({
        adapters: [],
        repository: { upsert: async () => { saved += 1; } },
        candidate: { ...candidate, skills: [], technologies: [], preferredLocations: [], yearsOfExperience: Number.NaN },
      }),
      /years of experience/,
    );
    assert.equal(saved, 0);
    assert.equal(fetched, 0);
  });

  it("does not write application or submission records", () => {
    const source = readFileSync(new URL("../services/jobDiscovery.ts", import.meta.url), "utf8");
    assert.equal(source.includes("ApplicationModel"), false);
    assert.equal(source.includes("submitHeldApplication"), false);
    assert.equal(source.includes("applicationSubmission"), false);
  });
});
