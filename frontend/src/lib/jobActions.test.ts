import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DashboardJob } from "./api.js";
import {
  blockingInconsistencies,
  excludedJobs,
  experienceLabel,
  isRecommended,
  needsReview,
  recommendedJobs,
  reviewJobs,
} from "./jobActions.js";

const job = (overrides: Partial<DashboardJob> & { match?: Partial<DashboardJob["match"]> } = {}): DashboardJob => ({
  id: "job-1",
  title: "Full Stack Developer",
  normalizedTitle: "full stack developer",
  company: "Razorpay",
  normalizedCompany: "razorpay",
  location: "Delhi NCR",
  remoteStatus: "hybrid",
  requiredSkills: ["react"],
  preferredSkills: [],
  relatedSkills: [],
  source: "greenhouse",
  officialApplicationUrl: "https://jobs.example.test/1",
  status: "discovered",
  canonicalIdentity: {
    key: "job-1",
    crossSourceKey: "job-1",
    confidence: "strong",
    components: { normalizedCompany: "razorpay", normalizedTitle: "full stack developer" },
  },
  applicationStatus: "not_applied",
  openStatus: "open",
  freshness: { status: "fresh", reason: "Recent" },
  ...overrides,
  match: {
    decision: "APPLY",
    matchScore: 87,
    hardFilterFailures: [],
    roleAnalysis: { status: "compatible" },
    experienceAnalysis: {
      status: "compatible",
      requirement: { minimum: 1, maximum: 3, preference: "required" },
    },
    locationAnalysis: { status: "compatible" },
    skillAnalysis: { exact: ["react", "node.js", "mongodb"] },
    ...overrides.match,
  },
});

describe("actionable job selection", () => {
  it("keeps an APPLY job in Recommended", () => {
    const apply = job();
    assert.equal(isRecommended(apply), true);
    assert.equal(recommendedJobs([apply]).length, 1);
    assert.equal(needsReview(apply), false);
  });

  it("keeps a genuine REVIEW job in Needs Review", () => {
    const review = job({
      match: {
        decision: "REVIEW",
        locationAnalysis: { status: "unknown" },
        experienceAnalysis: { status: "unknown" },
      },
    });
    assert.equal(needsReview(review), true);
    assert.equal(isRecommended(review), false);
    assert.equal(reviewJobs([review]).length, 1);
  });

  it("keeps SKIP jobs out of Recommended and Review", () => {
    const skipped = job({ match: { decision: "SKIP", hardFilterFailures: ["Role does not match"] } });
    assert.equal(isRecommended(skipped), false);
    assert.equal(needsReview(skipped), false);
    assert.equal(excludedJobs([skipped]).length, 1);
  });

  it("hides a required 5 year job from a 1 year candidate", () => {
    const senior = job({
      title: "Senior Software Engineer",
      match: {
        decision: "SKIP",
        experienceAnalysis: {
          status: "mismatch",
          candidateYears: 1,
          requirement: { minimum: 5, preference: "required" },
        },
        hardFilterFailures: ["Role requires at least 5 years"],
      },
    });
    const mislabeled = job({
      id: "bad-review",
      title: "Staff Engineer",
      company: "Example",
      match: {
        decision: "REVIEW",
        experienceAnalysis: {
          status: "mismatch",
          candidateYears: 1,
          requirement: { minimum: 5, preference: "required" },
        },
        hardFilterFailures: ["Role requires at least 5 years"],
      },
    });
    assert.equal(isRecommended(senior), false);
    assert.equal(needsReview(senior), false);
    assert.equal(needsReview(mislabeled), false);
    assert.equal(isRecommended(mislabeled), false);
    assert.deepEqual(blockingInconsistencies([mislabeled]), [
      { title: "Staff Engineer", company: "Example", decision: "REVIEW" },
    ]);
  });

  it("hides a closed job", () => {
    const closed = job({ openStatus: "closed" });
    assert.equal(isRecommended(closed), false);
    assert.equal(needsReview(job({ openStatus: "closed", match: { decision: "REVIEW" } })), false);
  });

  it("hides a recommended job without an application URL", () => {
    const missing = job({ officialApplicationUrl: undefined });
    assert.equal(isRecommended(missing), false);
  });

  it("returns an empty recommended list for the empty state", () => {
    assert.deepEqual(recommendedJobs([job({ match: { decision: "SKIP" } })]), []);
  });

  it("does not recommend a preferred experience level above the candidate", () => {
    const senior = job({
      match: {
        decision: "APPLY",
        experienceAnalysis: {
          status: "compatible",
          candidateYears: 1,
          requirement: { minimum: 5, preference: "preferred" },
        },
      },
    });
    assert.equal(isRecommended(senior), false);
    assert.equal(needsReview(job({
      match: {
        decision: "REVIEW",
        locationAnalysis: { status: "unknown" },
        experienceAnalysis: {
          status: "compatible",
          candidateYears: 1,
          requirement: { minimum: 5, preference: "preferred" },
        },
      },
    })), true);
  });

  it("formats experience without internal fields", () => {
    assert.equal(experienceLabel(job()), "Experience: 1–3 years");
    assert.equal(experienceLabel(job({
      match: { experienceAnalysis: { status: "compatible", requirement: { minimum: 1, preference: "required" } } },
    })), "Experience: 1+ year");
    assert.equal(experienceLabel(job({
      match: { experienceAnalysis: { status: "unknown" } },
    })), "Experience: Not clearly specified");
  });
});
