import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RawJobInput } from "../types/rawJob.js";
import { normalizeJob } from "../services/jobNormalizer.js";
import { validateRawJobInput } from "../validators/rawJobValidator.js";
import { normalizeCompany } from "../utils/normalizeCompany.js";
import { normalizeLocation } from "../utils/normalizeLocation.js";
import { normalizeRemoteStatus } from "../utils/normalizeRemoteStatus.js";
import { normalizeSkill } from "../utils/normalizeSkills.js";
import { normalizeTitle } from "../utils/normalizeTitle.js";

const baseJob: RawJobInput = {
  source: "company",
  title: "Full Stack Developer",
  company: "ABC Technologies",
  location: "Gurgaon",
  requiredSkills: ["React.js"],
};

describe("job normalization", () => {
  it("normalizes harmless title formatting differences", () => {
    assert.equal(normalizeTitle("Full Stack Developer"), normalizeTitle("full-stack developer"));
    assert.equal(normalizeTitle(" Full   Stack   Developer "), "full stack developer");
  });

  it("normalizes company suffixes without changing the display value", () => {
    assert.equal(normalizeCompany("ABC Technologies Pvt. Ltd."), "abc technologies");
    assert.equal(normalizeCompany("ABC Technologies Private Limited"), "abc technologies");
    assert.equal(normalizeJob({ ...baseJob, company: "ABC Technologies Pvt. Ltd." }).company, "ABC Technologies Pvt. Ltd.");
  });

  it("normalizes remote statuses and preserves unknown values conservatively", () => {
    assert.equal(normalizeRemoteStatus("Remote"), "remote");
    assert.equal(normalizeRemoteStatus("Work from Home"), "remote");
    assert.equal(normalizeRemoteStatus("Hybrid"), "hybrid");
    assert.equal(normalizeRemoteStatus("On-site"), "onsite");
    assert.equal(normalizeRemoteStatus("distributed-ish"), "unknown");
  });

  it("normalizes equivalent locations and known skill aliases", () => {
    assert.equal(normalizeLocation("Gurgaon"), normalizeLocation("Gurugram"));
    assert.equal(normalizeSkill("React.js"), normalizeSkill("ReactJS"));
    assert.equal(normalizeSkill("NodeJS"), "node.js");
    assert.equal(normalizeSkill("Koa.js"), "koa.js");
  });

  it("creates stable identity information without merging records", () => {
    const first = normalizeJob({ ...baseJob, title: "Full-stack Developer" });
    const second = normalizeJob({ ...baseJob, title: " full stack developer " });
    const different = normalizeJob({ ...baseJob, title: "Backend Developer" });

    assert.equal(first.canonicalIdentity.key, second.canonicalIdentity.key);
    assert.notEqual(first.canonicalIdentity.key, different.canonicalIdentity.key);
    assert.equal(first.canonicalIdentity.confidence, "probable");
  });

  it("uses strong identity evidence when a stable source id exists", () => {
    const job = normalizeJob({ ...baseJob, externalJobId: "123" });
    assert.equal(job.canonicalIdentity.confidence, "strong");
    assert.ok(job.canonicalIdentity.strongKey);
  });

  it("drops malformed dates instead of throwing", () => {
    const job = normalizeJob({ ...baseJob, postedDate: "not-a-date" });
    assert.equal(job.postedDate, undefined);
  });
});

describe("raw job validation", () => {
  it("rejects unsupported sources and missing required fields", () => {
    assert.throws(() => validateRawJobInput({ ...baseJob, source: "unknown" }), /unsupported/);
    assert.throws(() => validateRawJobInput({ ...baseJob, title: " " }), /title is required/);
    assert.throws(() => validateRawJobInput({ ...baseJob, requiredSkills: ["React", 4] }), /requiredSkills/);
  });
});