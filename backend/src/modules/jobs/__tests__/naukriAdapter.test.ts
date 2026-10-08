import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { CandidateProfile } from "@personal-job-automation/shared/types";
import type { FetchLike } from "../adapters/JobSourceAdapter.js";
import { NaukriAdapter } from "../adapters/naukri/NaukriAdapter.js";
import { NaukriClient } from "../adapters/naukri/NaukriClient.js";
import { resolveApplicationDestination } from "../adapters/naukri/applicationUrl.js";
import { readNaukriConfig } from "../adapters/naukri/naukriConfig.js";
import { mapNaukriJob } from "../adapters/naukri/NaukriMapper.js";
import { NaukriSourceError, type NaukriJobRecord } from "../adapters/naukri/NaukriTypes.js";
import { matchCandidateToJob } from "../matching/candidateMatcher.js";
import { DISCOVERY_HOUR, DISCOVERY_TIMEZONE } from "../../../scheduler/discoverySchedule.js";
import { deduplicateJobs } from "../services/deduplicateJobs.js";
import { JobSourceOrchestrator } from "../services/jobIngestionOrchestrator.js";
import { normalizeJob } from "../services/jobNormalizer.js";
import { createJobSourceAdapters } from "../sources/jobSourceConfig.js";

const jsonResponse = (body: unknown, status = 200): Response => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: { get: () => null },
}) as unknown as Response;

const redirect = (location: string, status = 302): Response => ({
  ok: false,
  status,
  headers: { get: (name: string) => name.toLowerCase() === "location" ? location : null },
  text: async () => "",
  json: async () => ({}),
}) as unknown as Response;

const record = (overrides: Partial<NaukriJobRecord> = {}): NaukriJobRecord => ({
  jobId: "071026049829",
  title: "Full Stack Developer",
  companyName: "Acme Technologies",
  jdURL: "/job-listings-full-stack-developer-acme-noida-071026049829",
  experienceText: "1-3 Yrs",
  tagsAndSkills: "React, Node.js, MongoDB",
  jobDescription: "Build React and Node services.",
  createdDate: "1791400000000",
  placeholders: [{ type: "location", label: "Noida" }],
  companyApplyJob: false,
  ...overrides,
});

const searchInput = {
  keyword: "MERN Developer",
  location: "Delhi NCR",
  pageNo: 1,
  pageSize: 20,
  experienceYears: 1,
  jobAgeDays: 15,
  timeoutMs: 1000,
  maxRetries: 2,
};

describe("Naukri client", () => {
  it("sends a fresh nkparam and reads a successful search page", async () => {
    const tokens: string[] = [];
    const fetcher: FetchLike = async (url, init) => {
      const token = String((init?.headers as Record<string, string>).nkparam);
      tokens.push(token);
      assert.equal(url.includes("jobapi/v3/search"), true);
      assert.equal(url.includes(token), false);
      assert.equal(new URL(url).searchParams.get("keyword"), "MERN Developer");
      return jsonResponse({ jobDetails: [record()] });
    };
    const client = new NaukriClient(fetcher);
    const jobs = await client.search(searchInput);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.jobId, "071026049829");
    const second = await client.search({ ...searchInput, pageNo: 2 });
    assert.equal(second.length, 1);
    assert.equal(tokens.length, 2);
    assert.notEqual(tokens[0], tokens[1]);
    assert.equal(tokens[0]?.includes("sa9chfJkrXE"), false);
  });

  it("stops requesting pages at the configured maximum", async () => {
    const pages: string[] = [];
    const fetcher: FetchLike = async (url) => {
      const page = new URL(url).searchParams.get("pageNo") ?? "";
      pages.push(page);
      const count = page === "3" ? 0 : 2;
      return jsonResponse({
        jobDetails: Array.from({ length: count }, (_, index) => record({ jobId: `${page}-${index}` })),
      });
    };
    const adapter = new NaukriAdapter({
      fetcher,
      delay: async () => undefined,
      config: {
        ...readNaukriConfig({}),
        queries: ["MERN Developer"],
        locations: ["Noida"],
        maxPages: 5,
        maxJobsPerQuery: 50,
        delayMs: 0,
        maxUrlResolutions: 0,
      },
    });
    const jobs = await adapter.fetchJobs();
    assert.deepEqual(pages, ["1", "2", "3"]);
    assert.equal(jobs.length, 4);
  });

  it("returns an empty page without treating it as a source failure", async () => {
    const jobs = await new NaukriClient(async () => jsonResponse({ jobDetails: [] })).search(searchInput);
    assert.deepEqual(jobs, []);
  });

  it("rejects a malformed response", async () => {
    await assert.rejects(
      () => new NaukriClient(async () => jsonResponse({ noOfJobs: 10 })).search(searchInput),
      (error: unknown) => error instanceof NaukriSourceError && /malformed/.test(error.message),
    );
  });

  it("retries a rejected token once and then fails", async () => {
    for (const status of [403, 406]) {
      let calls = 0;
      const fetcher: FetchLike = async () => {
        calls += 1;
        return calls === 1 ? jsonResponse({}, status) : jsonResponse({ jobDetails: [record()] });
      };
      const jobs = await new NaukriClient(fetcher).search(searchInput);
      assert.equal(jobs.length, 1);
      assert.equal(calls, 2);
      let rejected = 0;
      await assert.rejects(
        () => new NaukriClient(async () => {
          rejected += 1;
          return jsonResponse({}, status);
        }).search(searchInput),
        (error: unknown) => error instanceof NaukriSourceError && error.statusCode === status,
      );
      assert.equal(rejected, 2);
    }
  });

  it("retries transient failures and stops after the retry limit", async () => {
    let timeouts = 0;
    const recovered = await new NaukriClient(async () => {
      timeouts += 1;
      if (timeouts === 1) throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
      return jsonResponse({ jobDetails: [record()] });
    }).search(searchInput);
    assert.equal(recovered.length, 1);
    let serverErrors = 0;
    await assert.rejects(
      () => new NaukriClient(async () => {
        serverErrors += 1;
        return jsonResponse({}, 500);
      }).search({ ...searchInput, maxRetries: 2 }),
      (error: unknown) => error instanceof NaukriSourceError && error.statusCode === 500,
    );
    assert.equal(serverErrors, 3);
    let clientErrors = 0;
    await assert.rejects(
      () => new NaukriClient(async () => {
        clientErrors += 1;
        return jsonResponse({}, 400);
      }).search(searchInput),
      (error: unknown) => error instanceof NaukriSourceError,
    );
    assert.equal(clientErrors, 1);
  });

  it("propagates a Naukri failure instead of reporting an empty success", async () => {
    const adapter = new NaukriAdapter({
      delay: async () => undefined,
      fetcher: async () => jsonResponse({}, 406),
      config: { ...readNaukriConfig({}), queries: ["MERN Developer"], locations: ["Delhi NCR"], delayMs: 0 },
    });
    const result = await new JobSourceOrchestrator([adapter]).ingest();
    assert.equal(result.sources[0]?.status, "failed");
    assert.equal(result.sources[0]?.fetched, 0);
    assert.equal(result.jobs.length, 0);
    assert.match(result.sources[0]?.error ?? "", /406/);
  });
});

describe("Naukri mapping and application URLs", () => {
  it("maps a Naukri job into the canonical raw input", () => {
    const mapped = mapNaukriJob(record());
    assert.equal(mapped?.source, "naukri");
    assert.equal(mapped?.externalJobId, "071026049829");
    assert.equal(mapped?.title, "Full Stack Developer");
    assert.equal(mapped?.company, "Acme Technologies");
    assert.equal(mapped?.location, "Noida");
    assert.equal(mapped?.experienceRequirement, "1-3 Yrs");
    assert.deepEqual(mapped?.requiredSkills, ["React", "Node.js", "MongoDB"]);
    assert.equal(mapped?.description, "Build React and Node services.");
    assert.equal(mapped?.sourceUrl, "https://www.naukri.com/job-listings-full-stack-developer-acme-noida-071026049829");
    assert.equal(mapped?.postedDate, new Date(1791400000000).toISOString());
    const normalized = mapped ? normalizeJob(mapped) : undefined;
    assert.equal(normalized?.source, "naukri");
    assert.ok(normalized?.canonicalIdentity.crossSourceKey);
  });

  it("classifies redirect destinations", async () => {
    const cases = [
      { location: "https://boards.greenhouse.io/acme/jobs/11", type: "GREENHOUSE" },
      { location: "https://jobs.lever.co/acme/123", type: "LEVER" },
      { location: "https://jobs.ashbyhq.com/acme/123", type: "ASHBY" },
      { location: "https://acme.myworkdayjobs.com/careers/job/1", type: "WORKDAY" },
      { location: "https://careers.acme.com/jobs/1", type: "COMPANY_CAREER_PAGE" },
    ];
    for (const item of cases) {
      const resolved = await resolveApplicationDestination("https://www.naukri.com/job-listings-1", {
        timeoutMs: 1000,
        fetcher: async (url) => url.includes("naukri.com") ? redirect(item.location) : jsonResponse("ok"),
      });
      assert.equal(resolved.type, item.type);
      assert.equal(resolved.finalUrl, item.location);
    }
    const internal = await resolveApplicationDestination("https://www.naukri.com/job-listings-1", {
      timeoutMs: 1000,
      fetcher: async () => ({ ...jsonResponse("<html>apply</html>"), status: 200, ok: true }) as Response,
    });
    assert.equal(internal.type, "NAUKRI_INTERNAL");
    assert.equal(internal.finalUrl, undefined);
    const embedded = await resolveApplicationDestination("https://www.naukri.com/job-listings-1", {
      timeoutMs: 1000,
      fetcher: async () => ({ ...jsonResponse("<a href=\"https://boards.greenhouse.io/acme/jobs/9\">Apply</a>"), status: 200, ok: true }) as Response,
    });
    assert.equal(embedded.type, "GREENHOUSE");
    const unknown = await resolveApplicationDestination("https://www.naukri.com/job-listings-1", {
      timeoutMs: 1000,
      fetcher: async () => redirect("https://www.naukri.com/job-listings-1"),
    });
    assert.equal(unknown.type, "UNKNOWN_EXTERNAL");
    assert.equal(unknown.reason, "redirect loop");
    const timedOut = await resolveApplicationDestination("https://www.naukri.com/job-listings-1", {
      timeoutMs: 1000,
      fetcher: async () => { throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); },
    });
    assert.equal(timedOut.reason, "timeout");
    const forbidden = await resolveApplicationDestination("https://www.naukri.com/job-listings-1", {
      timeoutMs: 1000,
      fetcher: async () => jsonResponse("no", 403),
    });
    assert.equal(forbidden.type, "UNKNOWN_EXTERNAL");
    assert.equal(forbidden.reason, "HTTP 403");
    const withoutListing = record();
    delete withoutListing.jdURL;
    const mapped = mapNaukriJob(withoutListing);
    assert.equal(mapped?.officialApplicationUrl, undefined);
    assert.equal(mapped?.sourceUrl, undefined);
  });

  it("keeps one canonical job and prefers the official application URL", () => {
    const naukri = normalizeJob({
      ...mapNaukriJob(record({ jobDescription: "A very long Naukri description that should not outrank the official posting." }))!,
      officialApplicationUrl: "https://www.naukri.com/job-listings-full-stack-developer-acme-noida-071026049829",
    });
    const greenhouse = normalizeJob({
      source: "greenhouse",
      externalJobId: "11",
      title: "Full Stack Developer",
      company: "Acme Technologies",
      location: "Noida",
      description: "Short",
      officialApplicationUrl: "https://boards.greenhouse.io/acme/jobs/11",
    });
    const company = normalizeJob({
      source: "company",
      externalJobId: "careers-11",
      title: "Full Stack Developer",
      company: "Acme Technologies",
      location: "Noida",
      description: "Short",
      officialApplicationUrl: "https://careers.acme.com/jobs/11",
    });
    const withGreenhouse = deduplicateJobs([naukri, greenhouse]);
    assert.equal(withGreenhouse.jobs.length, 1);
    assert.equal(withGreenhouse.jobs[0]?.job.officialApplicationUrl, "https://boards.greenhouse.io/acme/jobs/11");
    assert.equal(withGreenhouse.jobs[0]?.alternateSources[0]?.source, "naukri");
    const withCompany = deduplicateJobs([naukri, company]);
    assert.equal(withCompany.jobs.length, 1);
    assert.equal(withCompany.jobs[0]?.job.source, "company");
    assert.equal(withCompany.jobs[0]?.job.officialApplicationUrl, "https://careers.acme.com/jobs/11");
  });
});

describe("Naukri matching and schedule", () => {
  const candidate: CandidateProfile = {
    isActive: true,
    personal: {},
    contact: {},
    yearsOfExperience: 1,
    experience: [],
    education: [],
    skills: ["JavaScript", "TypeScript", "React.js", "NodeJS", "Express.js", "Mongo DB"],
    technologies: ["Redis"],
    projects: [],
    certifications: [],
    preferredRoles: ["Full Stack Developer", "MERN Developer"],
    preferredLocations: ["Delhi NCR", "Noida"],
    remotePreference: "remote",
    verifiedInformation: {},
    relatedTechnology: [],
    unknownInformation: [],
  };

  it("uses the existing matcher for Naukri jobs", () => {
    const aligned = normalizeJob(mapNaukriJob(record({
      tagsAndSkills: "React, Node.js, MongoDB, Express.js",
      experienceText: "1-3 Yrs",
      jobDescription: "Build modern applications.",
    }))!);
    const alignedDecision = matchCandidateToJob(candidate, aligned);
    const sameFields = matchCandidateToJob(candidate, normalizeJob({
      source: "greenhouse",
      title: aligned.title,
      company: aligned.company,
      requiredSkills: aligned.requiredSkills,
      ...(aligned.location ? { location: aligned.location } : {}),
      ...(aligned.experienceRequirement ? { experienceRequirement: aligned.experienceRequirement } : {}),
      ...(aligned.description ? { description: aligned.description } : {}),
    }));
    assert.equal(alignedDecision.decision, sameFields.decision);
    assert.notEqual(alignedDecision.decision, "SKIP");
    const senior = matchCandidateToJob(candidate, normalizeJob(mapNaukriJob(record({
      title: "Senior Software Development Engineer",
      experienceText: "5+ years",
      jobDescription: "5+ years of experience required.",
    }))!));
    assert.equal(senior.decision, "SKIP");
  });

  it("adds Naukri to the existing discovery sources without a second schedule", () => {
    assert.equal(DISCOVERY_HOUR, 8);
    assert.equal(DISCOVERY_TIMEZONE, "Asia/Kolkata");
    assert.equal(createJobSourceAdapters().some((adapter) => adapter.source === "naukri"), true);
    const schedule = readFileSync(new URL("../../../scheduler/discoverySchedule.ts", import.meta.url), "utf8");
    assert.equal(schedule.includes("naukri"), false);
    assert.equal(schedule.includes("DISCOVERY_HOUR = 8"), true);
  });
});
