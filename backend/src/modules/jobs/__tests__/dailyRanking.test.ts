import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DAILY_SELECTION_LIMIT, rankDailyJobs, type RankableJob } from "../ranking/dailyRanking.js";

const job = (overrides: Partial<RankableJob> & Pick<RankableJob, "id" | "decision" | "matchScore">): RankableJob => ({
  title: overrides.title ?? overrides.id,
  company: "Acme",
  reasons: ["Role matches"],
  missingRequirements: [],
  freshness: "fresh",
  roleRelevance: 20,
  requiredSkillCoverage: 30,
  locationStatus: "compatible",
  applicationStatus: "not_applied",
  preparationAvailable: false,
  officialApplicationUrl: `https://jobs.example.test/${overrides.id}`,
  ...overrides,
});

describe("daily job ranking", () => {
  it("ranks APPLY above REVIEW and higher scores above lower scores", () => {
    const ranked = rankDailyJobs([
      job({ id: "review-high", decision: "REVIEW", matchScore: 90 }),
      job({ id: "apply-low", decision: "APPLY", matchScore: 76 }),
      job({ id: "apply-high", decision: "APPLY", matchScore: 91 }),
    ]);
    assert.deepEqual(ranked.map((item) => item.id), ["apply-high", "apply-low", "review-high"]);
  });

  it("keeps a hard-filter failure out of the daily selection", () => {
    const ranked = rankDailyJobs([
      job({ id: "excluded", decision: "APPLY", matchScore: 99, hardFilterFailure: true }),
      job({ id: "review", decision: "REVIEW", matchScore: 60 }),
    ]);
    assert.deepEqual(ranked.map((item) => item.id), ["review"]);
  });

  it("keeps hard SKIP jobs out of the daily selection", () => {
    const ranked = rankDailyJobs([
      job({ id: "skip", decision: "SKIP", matchScore: 99 }),
      job({ id: "review", decision: "REVIEW", matchScore: 60 }),
    ]);
    assert.deepEqual(ranked.map((item) => item.id), ["review"]);
  });

  it("deprioritizes jobs that were already submitted", () => {
    const ranked = rankDailyJobs([
      job({ id: "submitted", decision: "APPLY", matchScore: 88, applicationStatus: "submitted" }),
      job({ id: "open", decision: "APPLY", matchScore: 88, applicationStatus: "not_applied" }),
    ]);
    assert.deepEqual(ranked.map((item) => item.id), ["open", "submitted"]);
  });

  it("does not let a newer weaker job outrank a stronger match", () => {
    const ranked = rankDailyJobs([
      job({ id: "stale-strong", decision: "APPLY", matchScore: 90, freshness: "stale" }),
      job({ id: "fresh-weak", decision: "APPLY", matchScore: 70, freshness: "fresh" }),
      job({ id: "fresh-equal", decision: "APPLY", matchScore: 90, freshness: "fresh" }),
    ]);
    assert.deepEqual(ranked.map((item) => item.id), ["fresh-equal", "stale-strong", "fresh-weak"]);
  });

  it("returns at most 10 jobs and the same order for the same input", () => {
    const jobs = Array.from({ length: 12 }, (_, index) => job({
      id: `job-${String(index).padStart(2, "0")}`,
      decision: "APPLY",
      matchScore: 70 + index,
    }));
    const first = rankDailyJobs(jobs);
    const second = rankDailyJobs([...jobs].reverse());
    assert.equal(first.length, DAILY_SELECTION_LIMIT);
    assert.deepEqual(first.map((item) => item.id), second.map((item) => item.id));
    assert.equal(first[0]?.id, "job-11");
    assert.equal(first.at(-1)?.matchScore, 72);
  });

  it("returns an empty selection when nothing qualifies", () => {
    assert.deepEqual(rankDailyJobs([job({ id: "skip", decision: "SKIP", matchScore: 80 })]), []);
    assert.deepEqual(rankDailyJobs([]), []);
  });

  it("does not submit applications", () => {
    const ranking = readFileSync(new URL("../ranking/dailyRanking.ts", import.meta.url), "utf8");
    const report = readFileSync(new URL("../ranking/dailyReport.ts", import.meta.url), "utf8");
    const provider = readFileSync(new URL("../../notifications/notificationProvider.ts", import.meta.url), "utf8");
    for (const source of [ranking, report, provider]) {
      assert.equal(source.includes("submitHeldApplication"), false);
      assert.equal(source.includes("submitReviewedApplication"), false);
      assert.equal(source.includes("applicationSubmission"), false);
    }
  });
});
