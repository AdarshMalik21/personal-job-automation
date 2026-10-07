import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DailyJobReport, NotificationProvider } from "../../notifications/notificationProvider.js";
import { MemoryDailySelectionStore, publishDailyReport } from "../ranking/dailyReport.js";
import type { RankableJob } from "../ranking/dailyRanking.js";

const job = (id: string, score: number, decision: RankableJob["decision"] = "APPLY"): RankableJob => ({
  id,
  title: `Role ${id}`,
  company: "Acme",
  location: "Gurugram",
  remoteStatus: "hybrid",
  officialApplicationUrl: `https://boards.greenhouse.io/acme/jobs/${id}`,
  matchScore: score,
  decision,
  reasons: ["Job title contains a compatible role signal"],
  missingRequirements: ["graphql"],
  freshness: "fresh",
  roleRelevance: 20,
  requiredSkillCoverage: score / 4,
  locationStatus: "compatible",
  applicationStatus: "not_applied",
  preparationAvailable: false,
});

const recordingNotifier = () => {
  const reports: DailyJobReport[] = [];
  const notifier: NotificationProvider = {
    sendDailyJobReport: async (report) => {
      reports.push(report);
    },
  };
  return { notifier, reports };
};

describe("daily job report", () => {
  it("publishes the ranked top 10 with official application URLs", async () => {
    const jobs = [
      ...Array.from({ length: 11 }, (_, index) => job(`apply-${index}`, 70 + index)),
      job("skip", 100, "SKIP"),
      job("review", 95, "REVIEW"),
    ];
    const { notifier, reports } = recordingNotifier();
    const result = await publishDailyReport({
      dateKey: "2026-10-07",
      jobs,
      store: new MemoryDailySelectionStore(),
      notifier,
    });
    assert.equal(result.sent, true);
    assert.equal(result.report.jobs.length, 10);
    assert.equal(result.report.jobs[0]?.jobId, "apply-10");
    assert.equal(result.report.jobs[0]?.matchScore, 80);
    assert.equal(result.report.jobs[0]?.officialApplicationUrl, "https://boards.greenhouse.io/acme/jobs/apply-10");
    assert.equal(result.report.jobs.some((item) => item.jobId === "skip"), false);
    assert.equal(result.report.jobs.some((item) => item.jobId === "review"), false);
    assert.equal(reports.length, 1);
    assert.equal(reports[0]?.jobs[0]?.reasons[0], "Job title contains a compatible role signal");
  });

  it("does not create or send a second report for the same day", async () => {
    const store = new MemoryDailySelectionStore();
    const { notifier, reports } = recordingNotifier();
    const input = { dateKey: "2026-10-07", jobs: [job("apply-1", 90)], store, notifier };
    const first = await publishDailyReport(input);
    const second = await publishDailyReport(input);
    assert.equal(first.sent, true);
    assert.equal(second.duplicate, true);
    assert.equal(second.sent, false);
    assert.equal(reports.length, 1);
    assert.equal(await store.findByDate("2026-10-07") !== null, true);
  });

  it("records a failed notification without marking the report delivered", async () => {
    const store = new MemoryDailySelectionStore();
    const notifier: NotificationProvider = {
      sendDailyJobReport: async () => {
        throw new Error("notification provider unavailable");
      },
    };
    await assert.rejects(
      () => publishDailyReport({ dateKey: "2026-10-07", jobs: [], store, notifier }),
      /notification provider unavailable/,
    );
    const saved = await store.findByDate("2026-10-07");
    assert.equal(saved?.notificationStatus, "failed");
    assert.equal(saved?.jobs.length, 0);
  });
});
