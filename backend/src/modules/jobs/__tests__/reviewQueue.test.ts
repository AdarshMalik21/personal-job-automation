import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildJobFilter, parseJobListQuery } from "../../../services/jobQuery.js";
import { rankDailyJobs } from "../ranking/dailyRanking.js";
import { needsReviewAttention } from "../reviewQueue.js";

describe("review queue", () => {
  it("keeps a REVIEW decision separate from the user's review status", () => {
    assert.equal(needsReviewAttention({ decision: "REVIEW", reviewStatus: "unreviewed" }), true);
    assert.equal(needsReviewAttention({ decision: "REVIEW" }), true);
    assert.equal(needsReviewAttention({ decision: "REVIEW", reviewStatus: "reviewed" }), false);
    assert.equal(needsReviewAttention({ decision: "REVIEW", reviewStatus: "skipped" }), false);
    assert.equal(needsReviewAttention({ decision: "APPLY", reviewStatus: "unreviewed" }), false);
    assert.equal(needsReviewAttention({ decision: "SKIP", reviewStatus: "unreviewed" }), false);
  });

  it("filters the active review queue without changing match decisions", () => {
    const filter = buildJobFilter(parseJobListQuery({ queue: "review", limit: "50" }));
    assert.deepEqual(filter, {
      "match.decision": "REVIEW",
      reviewStatus: { $nin: ["reviewed", "skipped"] },
    });
    assert.throws(() => parseJobListQuery({ queue: "inbox" }), /queue is invalid/);
  });

  it("marks a job reviewed without rewriting the match decision", () => {
    const source = readFileSync(new URL("../../../controllers/jobsController.ts", import.meta.url), "utf8");
    const update = source.slice(source.indexOf("const updateReviewStatus"), source.indexOf("export const markReviewed"));
    const writes = update.match(/\$set: \{[^}]+\}/g) ?? [];
    assert.deepEqual(writes, ["$set: { reviewStatus: status, reviewedAt: new Date() }"]);
  });

  it("keeps daily ranking limited to APPLY and REVIEW decisions", () => {
    const ranked = rankDailyJobs([
      { id: "skip", title: "Skip", company: "Acme", matchScore: 99, decision: "SKIP", reasons: [], missingRequirements: [], freshness: "fresh", roleRelevance: 20, requiredSkillCoverage: 1, locationStatus: "compatible", applicationStatus: "not_applied", preparationAvailable: false },
      { id: "review", title: "Review", company: "Acme", matchScore: 70, decision: "REVIEW", reasons: [], missingRequirements: [], freshness: "fresh", roleRelevance: 20, requiredSkillCoverage: 1, locationStatus: "compatible", applicationStatus: "not_applied", preparationAvailable: false },
    ]);
    assert.deepEqual(ranked.map((job) => job.id), ["review"]);
  });

  it("still requires explicit approval before application submission", () => {
    const source = readFileSync(new URL("../../../controllers/applicationReviewController.ts", import.meta.url), "utf8");
    assert.match(source, /request\.body\?\.approved !== true/);
    assert.match(source, /Explicit approval is required/);
  });
});
