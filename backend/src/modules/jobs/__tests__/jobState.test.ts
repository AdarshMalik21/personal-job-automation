import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serializeJob } from "../../../controllers/jobsController.js";
import {
  isAlreadyAppliedStatus,
  PROCESSED_APPLICATION_STATUSES,
} from "../../../services/jobApplicationStatus.js";

describe("dashboard job state", () => {
  it("preserves application status when review state changes", () => {
    const reviewed = serializeJob({ reviewStatus: "reviewed", match: {} }, "submitted");
    const skipped = serializeJob({ reviewStatus: "skipped", match: {} }, "interview");
    assert.equal(reviewed.applicationStatus, "submitted");
    assert.equal(reviewed.reviewStatus, "reviewed");
    assert.equal(skipped.applicationStatus, "interview");
    assert.equal(skipped.reviewStatus, "skipped");
  });

  it("counts processed applications but excludes pre-submission and failed states", () => {
    for (const status of PROCESSED_APPLICATION_STATUSES) {
      assert.equal(isAlreadyAppliedStatus(status), true);
    }
    for (const status of ["prepared", "ready_for_review", "failed"]) {
      assert.equal(isAlreadyAppliedStatus(status), false);
    }
  });
});