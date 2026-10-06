import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFreshnessFilter,
  buildJobFilter,
  parseJobListQuery,
} from "../../../services/jobQuery.js";

describe("job API query parsing", () => {
  it("bounds pagination and builds validated filters", () => {
    const query = parseJobListQuery({
      page: "0",
      limit: "500",
      decision: "APPLY",
      search: "React+Node",
      minScore: "75",
      location: "Delhi NCR",
      sortBy: "score",
    });

    assert.equal(query.page, 1);
    assert.equal(query.limit, 50);
    assert.equal(query.decision, "APPLY");
    assert.equal(query.minScore, 75);
    assert.ok(buildJobFilter(query));
  });

  it("rejects invalid filters and sort fields", () => {
    assert.throws(
      () => parseJobListQuery({ decision: "MAYBE" }),
      /decision is invalid/,
    );
    assert.throws(
      () => parseJobListQuery({ reviewStatus: "pending" }),
      /reviewStatus is invalid/,
    );
    assert.throws(
      () => parseJobListQuery({ sortBy: "random" }),
      /sortBy is invalid/,
    );
    assert.throws(
      () => parseJobListQuery({ minScore: "not-a-number" }),
      /minScore must be a number/,
    );
    assert.throws(
      () => parseJobListQuery({ freshness: "recent" }),
      /freshness is invalid/,
    );
  });

  it("builds fresh, stale, and unknown freshness filters", () => {
    for (const freshness of ["fresh", "stale", "unknown"] as const) {
      assert.ok(
        buildFreshnessFilter(freshness, new Date("2026-10-05T00:00:00Z")),
      );
      assert.equal(parseJobListQuery({ freshness }).freshness, freshness);
    }
  });

  it("escapes location regex metacharacters", () => {
    const filter = buildJobFilter(parseJobListQuery({ location: "Noida.*" }));
    const clauses = filter.$or as Array<{ location?: RegExp }>;
    assert.equal(clauses[0]?.location?.source, "Noida\\.\\*");
  });
});
