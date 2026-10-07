import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { overlayDailyWorkflow } from "../ranking/dailyWorkflow.js";
import { createNotificationProvider } from "../../notifications/notificationProvider.js";

describe("daily workflow presentation", () => {
  it("overlays the current application and preparation state", () => {
    const jobs = overlayDailyWorkflow(
      [
        { jobId: "ready", applicationStatus: "not_applied", title: "React Developer" },
        { jobId: "submitted", applicationStatus: "not_applied", title: "Node.js Developer" },
        { jobId: "open", applicationStatus: "not_applied", title: "Full Stack Developer" },
      ],
      [{ jobId: "submitted", status: "submitted" }],
      [
        { jobId: "ready", status: "needs_information", missingInformation: ["Expected salary", ""] },
        { jobId: "open", status: "not_started", missingInformation: [] },
      ],
    );

    assert.equal(jobs[0]?.preparationStatus, "needs_information");
    assert.deepEqual(jobs[0]?.missingInformation, ["Expected salary"]);
    assert.equal(jobs[1]?.applicationStatus, "submitted");
    assert.equal(jobs[1]?.preparationStatus, "not_started");
    assert.equal(jobs[2]?.preparationStatus, "not_started");
    assert.equal(jobs[2]?.applicationStatus, "not_applied");
  });
});

describe("notification provider selection", () => {
  it("logs the report and does not claim an email was sent", async () => {
    const lines: string[] = [];
    const original = console.info;
    console.info = (message?: unknown) => {
      lines.push(String(message));
    };
    try {
      const provider = createNotificationProvider({ FRONTEND_URL: "http://localhost:3000" });
      await provider.sendDailyJobReport({
        dateKey: "2026-10-07",
        timezone: "Asia/Kolkata",
        jobs: [{
          rank: 1,
          jobId: "job-1",
          title: "Full Stack Developer",
          company: "Example",
          matchScore: 80,
          decision: "REVIEW",
          reasons: [],
          missingRequirements: [],
          freshness: "fresh",
          officialApplicationUrl: "https://jobs.example.test/apply",
          applicationStatus: "not_applied",
          preparationAvailable: false,
          rankingReason: "REVIEW score 80",
        }],
      });
    } finally {
      console.info = original;
    }
    const text = lines.join("\n");
    assert.match(text, /dashboard=http:\/\/localhost:3000\/dashboard/);
    assert.match(text, /url=https:\/\/jobs\.example\.test\/apply/);
    assert.match(text, /review=http:\/\/localhost:3000\/jobs\/job-1\/review/);
    assert.equal(text.toLowerCase().includes("email sent"), false);
    assert.equal(text.toLowerCase().includes("password"), false);
  });

  it("refuses an email provider when no transport is configured", async () => {
    const provider = createNotificationProvider({ NOTIFICATION_PROVIDER: "smtp", SMTP_PASSWORD: "secret" });
    await assert.rejects(
      () => provider.sendDailyJobReport({ dateKey: "2026-10-07", timezone: "Asia/Kolkata", jobs: [] }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /not configured/);
        assert.equal(error.message.includes("secret"), false);
        return true;
      },
    );
  });
});
