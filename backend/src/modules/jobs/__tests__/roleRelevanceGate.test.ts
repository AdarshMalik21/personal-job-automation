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
  skills: ["JavaScript", "TypeScript", "React.js", "NodeJS", "Express.js", "Mongo DB", "Git"],
  technologies: ["Redis", "AWS"],
  projects: [],
  certifications: [],
  preferredRoles: [
    "MERN Developer",
    "Full Stack Developer",
    "React Developer",
    "Node.js Developer",
    "Software Engineer-I",
  ],
  preferredLocations: ["Delhi", "Delhi NCR", "Noida", "Gurugram", "Remote India"],
  remotePreference: "remote",
  verifiedInformation: {},
  relatedTechnology: [],
  unknownInformation: [],
};

const engineeringDescription =
  "Develop web applications, write production code, build services, and design and implement APIs with React, Node.js, TypeScript, and MongoDB.";

const businessDescription =
  "Own the product roadmap, manage client relationships, and work with engineering teams using React, Node.js, MongoDB, and APIs. Sales quotas and revenue targets apply.";

const makeJob = (title: string, description = engineeringDescription, overrides: Partial<RawJobInput> = {}) =>
  normalizeJob({
    source: "company",
    title,
    company: "Example Technologies",
    location: "Noida",
    remoteStatus: "hybrid",
    experienceRequirement: "1-3 years",
    requiredSkills: ["React", "Node.js", "MongoDB", "Express.js"],
    preferredSkills: ["Redis"],
    description,
    ...overrides,
  });

const mustSkip = [
  "Relationship Manager",
  "Product Manager",
  "Associate Product Manager",
  "Product Designer",
  "Customer Success Manager",
  "Account Executive",
  "Business Development Executive",
  "Sales Manager",
  "Recruiter",
  "Talent Acquisition Specialist",
  "HR Manager",
  "Marketing Manager",
  "Finance Analyst",
  "Business Analyst",
  "Operations Manager",
  "Project Manager",
  "Graphic Designer",
  "UX Designer",
];

const mustRemain = [
  ["Full Stack Developer", "TARGET"],
  ["Full Stack Engineer", "TARGET"],
  ["MERN Developer", "TARGET"],
  ["React Developer", "TARGET"],
  ["React Engineer", "TARGET"],
  ["Node.js Developer", "TARGET"],
  ["Backend Engineer", "TARGET"],
  ["Frontend Engineer", "RELATED"],
  ["Software Engineer", "TARGET"],
  ["Software Engineer I", "TARGET"],
  ["SDE-1", "TARGET"],
  ["Next.js Developer", "TARGET"],
  ["JavaScript Engineer", "TARGET"],
  ["TypeScript Engineer", "TARGET"],
] as const;

const ambiguous = [
  "Product Engineer",
  "Application Engineer",
  "Platform Engineer",
  "Support Engineer",
  "Solutions Engineer",
  "Technical Consultant",
];

describe("role relevance gate", () => {
  for (const title of mustSkip) {
    it(`hard-skips ${title} before technical keywords can raise the score`, () => {
      const result = matchCandidateToJob(candidate, makeJob(title, engineeringDescription));
      assert.equal(result.decision, "SKIP");
      assert.equal(result.eligible, false);
      assert.equal(result.matchScore, 0);
      assert.equal(result.roleAnalysis.classification, "EXCLUDED");
      assert.equal(result.hardFilterFailures.length > 0, true);
      assert.equal(result.scoreBreakdown.requiredSkillCoverage, 0);
    });
  }

  for (const [title, classification] of mustRemain) {
    it(`keeps ${title} eligible`, () => {
      const result = matchCandidateToJob(candidate, makeJob(title));
      assert.equal(result.roleAnalysis.classification, classification);
      assert.equal(result.roleAnalysis.status, "compatible");
      assert.equal(result.eligible, true);
      assert.notEqual(result.decision, "SKIP");
      assert.equal(result.hardFilterFailures.length, 0);
    });
  }

  for (const title of ambiguous) {
    it(`accepts ${title} only when the description assigns engineering work`, () => {
      const engineering = matchCandidateToJob(candidate, makeJob(title, engineeringDescription));
      assert.equal(engineering.roleAnalysis.classification, "AMBIGUOUS");
      assert.equal(engineering.roleAnalysis.status, "compatible");
      assert.notEqual(engineering.decision, "SKIP");

      const business = matchCandidateToJob(candidate, makeJob(title, businessDescription));
      assert.equal(business.roleAnalysis.classification, "AMBIGUOUS");
      assert.equal(business.decision, "SKIP");
      assert.equal(business.matchScore, 0);
      assert.equal(business.eligible, false);
      assert.match(business.roleAnalysis.exclusionReason ?? "", /non-engineering|does not describe/);
    });
  }

  it("does not let a customer support title through on an engineering description", () => {
    const result = matchCandidateToJob(
      candidate,
      makeJob("Customer Support Engineer", engineeringDescription),
    );
    assert.equal(result.roleAnalysis.classification, "EXCLUDED");
    assert.equal(result.roleAnalysis.exclusionCategory, "Customer/Support");
    assert.equal(result.decision, "SKIP");
  });

  it("does not treat technical program manager as a generic program manager", () => {
    const result = matchCandidateToJob(
      candidate,
      makeJob("Technical Program Manager", engineeringDescription),
    );
    assert.equal(result.roleAnalysis.classification, "AMBIGUOUS");
    assert.notEqual(result.decision, "SKIP");
  });

  it("skips unrecognized non-engineering titles instead of scoring them", () => {
    for (const title of ["Implementation Manager", "Production Designer", "Deal Desk", "Analytics Engineer"]) {
      const result = matchCandidateToJob(candidate, makeJob(title, engineeringDescription));
      assert.equal(result.decision, "SKIP", title);
      assert.equal(result.matchScore, 0, title);
      assert.equal(result.roleAnalysis.classification, "EXCLUDED", title);
    }
  });

  it("uses the description for a design engineer title", () => {
    const engineering = matchCandidateToJob(candidate, makeJob("Design Engineer", engineeringDescription));
    assert.equal(engineering.roleAnalysis.classification, "AMBIGUOUS");
    assert.notEqual(engineering.decision, "SKIP");
    const visual = matchCandidateToJob(
      candidate,
      makeJob("Design Engineer", "Lead visual design and user research for the marketing site. Collaborate with engineers who use React."),
    );
    assert.equal(visual.decision, "SKIP");
    assert.equal(visual.matchScore, 0);
  });

  it("keeps an excluded role at score zero when the description is full of stack keywords", () => {
    const result = matchCandidateToJob(
      candidate,
      makeJob(
        "Relationship Manager",
        "Partner with engineering teams using React, Node.js, MongoDB, JavaScript, APIs, AWS, and Docker.",
      ),
    );
    assert.equal(result.decision, "SKIP");
    assert.equal(result.matchScore, 0);
    assert.equal(result.roleAnalysis.exclusionCategory, "Business/Sales");
  });
});
