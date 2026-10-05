import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CandidateProfile } from "@personal-job-automation/shared/types";
import { matchCandidateToJob } from "../matching/candidateMatcher.js";
import { normalizeJob } from "../services/jobNormalizer.js";
import type { RawJobInput } from "../types/rawJob.js";

const candidate: CandidateProfile = {
  isActive: true,
  personal: {},
  contact: {},
  yearsOfExperience: 1,
  experience: [],
  education: [],
  skills: [
    "JavaScript",
    "TypeScript",
    "React.js",
    "NodeJS",
    "Express.js",
    "Mongo DB",
    "Git",
  ],
  technologies: ["Redis", "AWS"],
  projects: [],
  certifications: [],
  preferredRoles: ["Full Stack Developer", "MERN Developer"],
  preferredLocations: ["Delhi NCR", "Noida", "Gurgaon"],
  remotePreference: "remote",
  verifiedInformation: {},
  relatedTechnology: [],
  unknownInformation: [],
};

const makeJob = (overrides: Partial<RawJobInput> = {}) =>
  normalizeJob({
    source: "company",
    title: "Full Stack JavaScript Engineer",
    company: "Example Technologies",
    location: "Noida",
    remoteStatus: "hybrid",
    experienceRequirement: "1-3 years",
    requiredSkills: ["React", "Node.js", "MongoDB", "Express.js"],
    preferredSkills: ["Redis", "Docker"],
    description: "Build modern applications.",
    ...overrides,
  });

describe("candidate matching", () => {
  it("returns a strong deterministic match for an aligned MERN role", () => {
    const result = matchCandidateToJob(candidate, makeJob());

    assert.equal(result.eligible, true);
    assert.notEqual(result.decision, "SKIP");
    assert.ok(result.matchScore >= 75);
    assert.equal(result.confidence, "high");
    assert.deepEqual(result.matchedSkills.sort(), [
      "express.js",
      "mongodb",
      "node.js",
      "react",
      "redis",
    ]);
    assert.deepEqual(result.skillAnalysis.missingPreferred, ["docker"]);
  });

  it("treats aliases as exact and related technologies as non-equivalent", () => {
    const result = matchCandidateToJob(
      candidate,
      makeJob({
        title: "Next.js Developer",
        requiredSkills: ["Next.js", "NestJS"],
        preferredSkills: [],
      }),
    );

    assert.equal(result.skillAnalysis.related.includes("next.js"), true);
    assert.equal(result.skillAnalysis.transferable.includes("nestjs"), true);
    assert.equal(
      result.skillAnalysis.missingRequired.includes("next.js"),
      true,
    );
    assert.equal(result.skillAnalysis.missingRequired.includes("nestjs"), true);
  });

  it("hard-skips unrelated roles and incompatible required experience", () => {
    const unrelated = matchCandidateToJob(
      candidate,
      makeJob({ title: "Data Scientist" }),
    );
    assert.equal(unrelated.decision, "SKIP");
    assert.equal(unrelated.eligible, false);

    const experienceMismatch = matchCandidateToJob(
      candidate,
      makeJob({ experienceRequirement: "5+ years required" }),
    );
    assert.equal(experienceMismatch.decision, "SKIP");
    assert.equal(experienceMismatch.eligible, false);
    assert.match(experienceMismatch.reasons.join(" "), /5 years/);
  });

  it("keeps unknown location and ambiguous experience reviewable", () => {
    const unknownLocationJob = makeJob({
      remoteStatus: "unknown",
      experienceRequirement: "experienced developer",
    });
    delete unknownLocationJob.location;
    delete unknownLocationJob.normalizedLocation;
    const result = matchCandidateToJob(candidate, unknownLocationJob);

    assert.equal(result.locationAnalysis.status, "unknown");
    assert.equal(result.experienceAnalysis.status, "unknown");
    assert.equal(result.decision, "REVIEW");
    assert.equal(result.eligible, true);
  });

  it("rejects foreign-only remote roles without candidate support", () => {
    const result = matchCandidateToJob(
      candidate,
      makeJob({
        location: "Remote - US only",
        remoteStatus: "remote",
      }),
    );

    assert.equal(result.locationAnalysis.status, "incompatible");
    assert.equal(result.decision, "SKIP");
    assert.equal(result.eligible, false);
  });

  it("does not let a high technical score override a hard filter", () => {
    const result = matchCandidateToJob(
      candidate,
      makeJob({ experienceRequirement: "4+ years required" }),
    );

    assert.ok(result.matchScore > 0);
    assert.equal(result.decision, "SKIP");
    assert.equal(result.eligible, false);
  });
});
