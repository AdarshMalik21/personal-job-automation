import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { Types } from "mongoose";
import { ApplicationModel } from "../../../models/Application.js";
import { ApplicationPreparationModel } from "../../../models/ApplicationPreparation.js";
import { CandidateProfileModel } from "../../../models/CandidateProfile.js";
import { JobModel } from "../../../models/Job.js";
import { browserRun, useBrowserRunnerForTests } from "../../../controllers/applicationBrowserController.js";
import { getReview, updateReviewField } from "../../../controllers/applicationReviewController.js";
import { BROWSER_INACTIVITY_MS, activeRuns, browserSessions, type HeldBrowserSession } from "../browserSession.js";

const jobId = new Types.ObjectId();
const candidateId = new Types.ObjectId();
const preparationId = new Types.ObjectId();
const chain = <T>(value: T) => ({ lean: async () => value, sort: () => ({ lean: async () => value }) });

const liveParts = (closed: { browser?: boolean; context?: boolean; page?: boolean } = {}) => ({
  browser: { isConnected: () => closed.browser !== true, close: async () => undefined },
  context: { isClosed: () => closed.context === true, close: async () => undefined },
  page: { isClosed: () => closed.page === true, close: async () => undefined },
});

const hold = (job: string, overrides: Partial<HeldBrowserSession> = {}) => {
  const parts = liveParts();
  browserSessions.hold({
    jobId: job,
    browser: parts.browser as never,
    context: parts.context as never,
    page: parts.page as never,
    createdAt: Date.now() - 60 * 60 * 1000,
    lastActivityAt: Date.now(),
    submitting: false,
    isStopped: () => false,
    stop: () => undefined,
    ...overrides,
  });
};

const response = () => {
  let statusCode = 200;
  let body: Record<string, unknown> | undefined;
  return {
    get statusCode() { return statusCode; },
    get body() { return body; },
    status(status: number) { statusCode = status; return this; },
    json(value: Record<string, unknown>) { body = value; return this; },
  };
};

describe("browser session lifecycle", () => {
  afterEach(() => {
    browserSessions.clearForTests();
    useBrowserRunnerForTests();
  });

  it("expires a session after inactivity and keeps an active session after a refresh", () => {
    hold("idle", { lastActivityAt: Date.now() - BROWSER_INACTIVITY_MS - 1_000 });
    assert.equal(browserSessions.get("idle"), undefined);

    hold("active", { lastActivityAt: Date.now() - BROWSER_INACTIVITY_MS + 5_000 });
    const before = browserSessions.get("active")?.lastActivityAt ?? 0;
    browserSessions.touch("active");
    const after = browserSessions.get("active");
    assert.ok(after);
    assert.ok((after?.lastActivityAt ?? 0) >= before);
  });

  it("releases a disconnected browser, a closed context, and a closed page", () => {
    const disconnected = liveParts({ browser: true });
    hold("browser", { browser: disconnected.browser as never, context: disconnected.context as never, page: disconnected.page as never });
    assert.equal(browserSessions.assess("browser").unavailable, "invalid");

    const closedContext = liveParts({ context: true });
    hold("context", { browser: closedContext.browser as never, context: closedContext.context as never, page: closedContext.page as never });
    assert.equal(browserSessions.get("context"), undefined);

    const closedPage = liveParts({ page: true });
    hold("page", { browser: closedPage.browser as never, context: closedPage.context as never, page: closedPage.page as never });
    assert.equal(browserSessions.assess("page").unavailable, "invalid");
  });

  it("releases a session twice without throwing", async () => {
    hold("once");
    await browserSessions.release("once");
    await browserSessions.release("once");
    assert.equal(browserSessions.get("once"), undefined);
    assert.equal(activeRuns.has("once"), false);
  });

  it("does not launch a browser from preparation, discovery, or the scheduler", () => {
    const preparation = readFileSync(new URL("../../../controllers/applicationPreparationController.ts", import.meta.url), "utf8");
    const discovery = readFileSync(new URL("../../jobs/services/jobDiscovery.ts", import.meta.url), "utf8");
    const worker = readFileSync(new URL("../../../worker.ts", import.meta.url), "utf8");
    const browserController = readFileSync(new URL("../../../controllers/applicationBrowserController.ts", import.meta.url), "utf8");
    assert.equal(preparation.includes("runApplication"), false);
    assert.equal(preparation.includes("playwright"), false);
    assert.equal(discovery.includes("playwright"), false);
    assert.equal(discovery.includes("browser-run"), false);
    assert.equal(worker.includes("playwright"), false);
    assert.equal(browserController.includes("clickFinalControl"), false);
  });
});

describe("browser run controller", () => {
  const originals = {
    job: JobModel.findById,
    candidate: CandidateProfileModel.findOne,
    preparation: ApplicationPreparationModel.findOne,
    preparationUpdate: ApplicationPreparationModel.findByIdAndUpdate,
    application: ApplicationModel.findOne,
  };
  const state: { preparation: Record<string, unknown>; calls: number } = { preparation: {}, calls: 0 };

  const install = () => {
    state.calls = 0;
    state.preparation = {
      _id: preparationId,
      jobId,
      candidateProfileId: candidateId,
      status: "ready_for_review",
      tailoredResume: { summary: "Kept" },
      generatedAnswers: [{ question: "Why this role?", answer: "Because" }],
      browserRun: { status: "FAILED", reason: "previous" },
    };
    const job = { _id: jobId, status: "discovered", officialApplicationUrl: "https://jobs.example.test/1", match: {} };
    const candidate = { _id: candidateId, isActive: true };
    (JobModel as unknown as { findById: unknown }).findById = () => chain(job);
    (CandidateProfileModel as unknown as { findOne: unknown }).findOne = () => chain(candidate);
    (ApplicationPreparationModel as unknown as { findOne: unknown }).findOne = () => chain(state.preparation);
    (ApplicationPreparationModel as unknown as { findByIdAndUpdate: unknown }).findByIdAndUpdate = (_id: unknown, update: { $set: { browserRun?: Record<string, unknown> } }) => {
      if (update.$set.browserRun) state.preparation.browserRun = update.$set.browserRun;
      return { lean: async () => state.preparation };
    };
    (ApplicationModel as unknown as { findOne: unknown }).findOne = () => chain(null);
    useBrowserRunnerForTests(async (_input, _factory, hooks) => {
      state.calls += 1;
      const parts = liveParts();
      hooks?.onBrowserCreated?.(parts.browser as never, parts.context as never);
      hooks?.onHeld?.({ browser: parts.browser as never, context: parts.context as never, page: parts.page as never });
      return {
        status: "PAUSED_FOR_REVIEW",
        fieldsDetected: 1,
        fieldsFilled: [],
        fieldsSkipped: [],
        uploads: [],
        reviewItems: [],
        fields: [],
        finalControl: "Submit application",
        reason: "Final submission control detected; it was not clicked",
      };
    });
  };

  afterEach(() => {
    (JobModel as unknown as { findById: unknown }).findById = originals.job;
    (CandidateProfileModel as unknown as { findOne: unknown }).findOne = originals.candidate;
    (ApplicationPreparationModel as unknown as { findOne: unknown }).findOne = originals.preparation;
    (ApplicationPreparationModel as unknown as { findByIdAndUpdate: unknown }).findByIdAndUpdate = originals.preparationUpdate;
    (ApplicationModel as unknown as { findOne: unknown }).findOne = originals.application;
    browserSessions.clearForTests();
    useBrowserRunnerForTests();
  });

  it("starts one browser run, reports the live session, and ignores a duplicate start", async () => {
    install();
    const first = response();
    await browserRun({ params: { jobId: String(jobId) } } as never, first as never, () => undefined);
    assert.equal(state.calls, 1);
    assert.equal((first.body?.data as { browserRun: { sessionAvailable?: boolean; status?: string } }).browserRun.sessionAvailable, true);
    assert.equal((first.body?.data as { browserRun: { status?: string } }).browserRun.status, "PAUSED_FOR_REVIEW");
    const review = response();
    await getReview({ params: { jobId: String(jobId) } } as never, review as never, () => undefined);
    const payload = (review.body?.data as { review: { browserRun: { sessionAvailable: boolean; status: string } } }).review;
    assert.equal(payload.browserRun.sessionAvailable, true);
    assert.equal(payload.browserRun.status, "PAUSED_FOR_REVIEW");
    const second = response();
    await browserRun({ params: { jobId: String(jobId) } } as never, second as never, () => undefined);
    assert.equal(state.calls, 1);
    assert.equal((second.body?.data as { alreadyActive?: boolean }).alreadyActive, true);
  });

  it("restarts after the live session disappears and keeps the preparation", async () => {
    install();
    await browserRun({ params: { jobId: String(jobId) } } as never, response() as never, () => undefined);
    await browserSessions.release(String(jobId));
    state.preparation.browserRun = { ...(state.preparation.browserRun as object), status: "BROWSER_SESSION_EXPIRED" };
    const expired = response();
    await getReview({ params: { jobId: String(jobId) } } as never, expired as never, () => undefined);
    assert.equal((expired.body?.data as { review: { browserRun: { status: string; sessionAvailable: boolean } } }).review.browserRun.status, "BROWSER_SESSION_EXPIRED");
    assert.equal((expired.body?.data as { review: { browserRun: { sessionAvailable: boolean } } }).review.browserRun.sessionAvailable, false);
    const restarted = response();
    await browserRun({ params: { jobId: String(jobId) } } as never, restarted as never, () => undefined);
    assert.equal(state.calls, 2);
    assert.equal((state.preparation.tailoredResume as { summary: string }).summary, "Kept");
    assert.equal((state.preparation.generatedAnswers as unknown[]).length, 1);
  });

  it("stores a safe failure and does not report a live session", async () => {
    install();
    useBrowserRunnerForTests(async () => ({
      status: "FAILED",
      reason: "page.goto: net::ERR_CONNECTION_RESET",
      fieldsDetected: 0,
      fieldsFilled: [],
      fieldsSkipped: [],
      uploads: [],
      reviewItems: [],
      fields: [],
    }));
    const result = response();
    await browserRun({ params: { jobId: String(jobId) } } as never, result as never, () => undefined);
    const stored = state.preparation.browserRun as { status?: string; reason?: string };
    assert.equal(stored.status, "FAILED");
    assert.equal(stored.reason, "The application page could not be opened.");
    assert.equal((result.body?.data as { browserRun: { sessionAvailable?: boolean } }).browserRun.sessionAvailable, false);
    assert.equal((state.preparation.tailoredResume as { summary: string }).summary, "Kept");
  });

  it("treats a persisted running status without a live session as expired", async () => {
    install();
    state.preparation.browserRun = { status: "RUNNING", reason: "Preparing application" };
    const review = response();
    await getReview({ params: { jobId: String(jobId) } } as never, review as never, () => undefined);
    const payload = (review.body?.data as { review: { browserRun: { status: string; sessionAvailable: boolean } } }).review;
    assert.equal(payload.browserRun.status, "BROWSER_SESSION_EXPIRED");
    assert.equal(payload.browserRun.sessionAvailable, false);
    assert.equal(state.calls, 0);
  });

  it("rejects a field edit when the live session is gone", async () => {
    install();
    state.preparation.browserRun = {
      status: "PAUSED_FOR_REVIEW",
      fields: [{ elementId: "name", type: "text", required: true, options: [], source: "user", reviewStatus: "filled", currentValue: "Asha" }],
    };
    const result = response();
    await updateReviewField({ params: { jobId: String(jobId) }, body: { elementId: "name", value: "Ada" } } as never, result as never, () => undefined);
    assert.equal(result.statusCode, 409);
    assert.match(String(result.body?.message), /Restart Browser Run/);
    assert.equal((state.preparation.browserRun as { fields: Array<{ currentValue?: string }> }).fields[0]?.currentValue, "Asha");
  });
});
