import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyApplicationUrl } from "../services/applicationDestination.js";

describe("application destination classification", () => {
  it("recognizes Naukri, known ATS hosts, and refuses to guess other sites", () => {
    const cases: Array<[string | undefined, string]> = [
      ["https://www.naukri.com/job-listings-123", "NAUKRI_INTERNAL"],
      ["https://foo.naukri.com/job-listings-123", "NAUKRI_INTERNAL"],
      ["https://boards.greenhouse.io/acme/jobs/123", "GREENHOUSE"],
      ["https://jobs.lever.co/acme/123", "LEVER"],
      ["https://jobs.ashbyhq.com/acme/123", "ASHBY"],
      ["https://acme.myworkdayjobs.com/careers/job/123", "WORKDAY"],
      ["https://random-third-party-site.com/jobs/123", "UNKNOWN_EXTERNAL"],
      ["https://another-job-board.example.com/job/123", "UNKNOWN_EXTERNAL"],
      ["https://careers.acme.com/jobs/123", "UNKNOWN_EXTERNAL"],
      ["not a url", "UNKNOWN_EXTERNAL"],
      ["javascript:alert(1)", "UNKNOWN_EXTERNAL"],
      [undefined, "UNKNOWN_EXTERNAL"],
    ];
    for (const [url, expected] of cases) {
      assert.equal(classifyApplicationUrl(url), expected, url);
    }
  });
});
