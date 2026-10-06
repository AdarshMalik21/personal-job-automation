import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Types } from "mongoose";
import { ApplicationModel } from "../../../models/Application.js";
import { ApplicationPreparationModel } from "../../../models/ApplicationPreparation.js";
import { CandidateProfileModel } from "../../../models/CandidateProfile.js";
import { JobModel } from "../../../models/Job.js";
import {
  cancelReviewedApplication,
  getReview,
  submissionBlockers,
  submitReviewedApplication,
  updateReviewField,
} from "../../../controllers/applicationReviewController.js";
import { stopBrowserRun } from "../../../controllers/applicationBrowserController.js";
import { activeRuns, browserSessions } from "../browserSession.js";
import { submissionRuntime, submitHeldApplication } from "../applicationSubmission.js";
import type { ReviewedApplicationField } from "../browserRunTypes.js";

const jobId = new Types.ObjectId();
const candidateId = new Types.ObjectId();
const preparationId = new Types.ObjectId();
const chain = <T>(value: T) => ({
  lean: async () => value,
  sort: () => ({ lean: async () => value }),
});

const field = (overrides: Partial<ReviewedApplicationField> = {}): ReviewedApplicationField => ({
  elementId: "application-field-0",
  type: "text",
  id: "first_name",
  label: "First Name",
  required: true,
  options: [],
  source: "candidate profile",
  reviewStatus: "filled",
  currentValue: "Asha",
  ...overrides,
});

const state: {
  preparation: Record<string, unknown>;
  application: Record<string, unknown> | null;
  profileWrites: number;
} = { preparation: {}, application: null, profileWrites: 0 };

const originals = {
  job: JobModel.findById,
  candidate: CandidateProfileModel.findOne,
  candidateUpdate: CandidateProfileModel.findOneAndUpdate,
  candidateUpdateOne: CandidateProfileModel.updateOne,
  candidateById: CandidateProfileModel.findByIdAndUpdate,
  preparation: ApplicationPreparationModel.findOne,
  preparationUpdate: ApplicationPreparationModel.findByIdAndUpdate,
  application: ApplicationModel.findOne,
  applicationUpdate: ApplicationModel.findOneAndUpdate,
  submit: submissionRuntime.submit,
};

const install = (fields: ReviewedApplicationField[], browserStatus = "PAUSED_FOR_REVIEW") => {
  state.profileWrites = 0;
  state.application = null;
  state.preparation = {
    _id: preparationId,
    jobId,
    candidateProfileId: candidateId,
    status: "ready_for_review",
    tailoredResume: { skills: ["Node.js"], summary: "Builds MERN services." },
    coverLetter: { status: "not_required", reason: "Not required" },
    generatedAnswers: [{ question: "Years of experience", status: "known", answer: "4", source: "candidate.yearsOfExperience" }],
    missingInformation: [],
    browserRun: {
      status: browserStatus,
      runId: "run-1",
      url: "https://www.mongodb.com/careers/jobs/7993984",
      pagesProcessed: 1,
      fieldsDetected: fields.length,
      fieldsFilled: ["application-field-0"],
      fields,
      finalControl: "Submit application",
      reason: "Final submission control detected; it was not clicked",
    },
  };
  const job = {
    _id: jobId,
    title: "Software Engineer 3",
    company: "MongoDB",
    location: "Gurugram",
    source: "greenhouse",
    officialApplicationUrl: "https://www.mongodb.com/careers/job/?gh_jid=7993984",
    description: "Build database products.",
    requiredSkills: ["Node.js"],
    postedDate: new Date(),
    status: "discovered",
    match: { score: 85, decision: "APPLY", reasons: ["MERN overlap"] },
  };
  const candidate = { _id: candidateId, isActive: true, skills: ["Node.js"], personal: { firstName: "Asha" } };
  (JobModel as unknown as { findById: unknown }).findById = () => chain(job);
  (CandidateProfileModel as unknown as { findOne: unknown }).findOne = () => chain(candidate);
  (CandidateProfileModel as unknown as { findOneAndUpdate: unknown }).findOneAndUpdate = async () => {
    state.profileWrites += 1;
  };
  (CandidateProfileModel as unknown as { updateOne: unknown }).updateOne = async () => {
    state.profileWrites += 1;
  };
  (CandidateProfileModel as unknown as { findByIdAndUpdate: unknown }).findByIdAndUpdate = async () => {
    state.profileWrites += 1;
  };
  (ApplicationPreparationModel as unknown as { findOne: unknown }).findOne = () => chain(state.preparation);
  (ApplicationPreparationModel as unknown as { findByIdAndUpdate: unknown }).findByIdAndUpdate = async (_id: unknown, update: { $set: Record<string, unknown> }) => {
    if (update.$set.browserRun) state.preparation.browserRun = update.$set.browserRun;
    if (update.$set["browserRun.fields"]) {
      state.preparation.browserRun = { ...(state.preparation.browserRun as object), fields: update.$set["browserRun.fields"] };
    }
    return state.preparation;
  };
  (ApplicationModel as unknown as { findOne: unknown }).findOne = () => chain(state.application);
  (ApplicationModel as unknown as { findOneAndUpdate: unknown }).findOneAndUpdate = async (_query: unknown, update: { $set?: Record<string, unknown>; $push?: { history?: unknown } }) => {
    const historyEvent = update.$push?.history;
    const previousHistory = (state.application?.history as unknown[] | undefined) ?? [];
    state.application = {
      ...(state.application ?? {}),
      ...update.$set,
      ...(historyEvent ? { history: [...previousHistory, historyEvent] } : {}),
    };
    return state.application;
  };
};

const response = () => {
  let statusCode = 200;
  let body: Record<string, unknown> | undefined;
  return {
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    status(status: number) {
      statusCode = status;
      return this;
    },
    json(value: Record<string, unknown>) {
      body = value;
      return this;
    },
  };
};

const request = (body?: Record<string, unknown>) => ({ params: { jobId: String(jobId) }, body }) as never;

afterEach(() => {
  JobModel.findById = originals.job;
  CandidateProfileModel.findOne = originals.candidate;
  CandidateProfileModel.findOneAndUpdate = originals.candidateUpdate;
  CandidateProfileModel.updateOne = originals.candidateUpdateOne;
  CandidateProfileModel.findByIdAndUpdate = originals.candidateById;
  ApplicationPreparationModel.findOne = originals.preparation;
  ApplicationPreparationModel.findByIdAndUpdate = originals.preparationUpdate;
  ApplicationModel.findOne = originals.application;
  ApplicationModel.findOneAndUpdate = originals.applicationUpdate;
  submissionRuntime.submit = originals.submit;
  browserSessions.clearForTests();
  activeRuns.delete(String(jobId));
});

describe("application review", () => {
  it("rejects an unauthenticated review route", async () => {
    process.env.JWT_SECRET ??= "test-secret";
    process.env.ADMIN_EMAIL ??= "admin@example.com";
    process.env.ADMIN_PASSWORD ??= "password";
    const { applicationRoutes } = await import("../../../routes/applicationRoutes.js");
    const layer = (applicationRoutes as unknown as { stack: Array<{ name?: string; handle?: { name?: string } }> }).stack[0];
    assert.equal(layer?.name ?? layer?.handle?.name, "requireAuth");
    assert.equal(
      (applicationRoutes as unknown as { stack: Array<{ route?: { path?: string; methods?: Record<string, boolean> } }> }).stack.some(
        (entry) => entry.route?.path === "/:jobId/review" && entry.route.methods?.get,
      ),
      true,
    );
  });

  it("returns job, preparation, and browser review data", async () => {
    install([field(), field({
      elementId: "application-field-17",
      id: "sponsorship",
      label: "Will you now or in the future require employment sponsorship?",
      required: true,
      source: "browser-detected",
      reviewStatus: "requires_review",
    })]);
    const result = response();
    await getReview(request(), result as never, () => undefined);
    const review = (result.body?.data as { review: Record<string, unknown> }).review;
    const job = review.job as { company: string; matchScore: number; matchDecision: string };
    const preparation = review.preparation as { status: string; coverLetter: { status: string } };
    const browserRun = review.browserRun as { status: string; finalControl: string; fields: unknown[] };
    assert.equal(result.statusCode, 200);
    assert.equal(job.company, "MongoDB");
    assert.equal(job.matchScore, 85);
    assert.equal(job.matchDecision, "APPLY");
    assert.equal(preparation.status, "ready_for_review");
    assert.equal(preparation.coverLetter.status, "not_required");
    assert.equal(browserRun.finalControl, "Submit application");
    assert.equal(browserRun.fields.length, 2);
    assert.equal(browserRun.status, "BROWSER_SESSION_EXPIRED");
    assert.equal(review.canSubmit, false);
    assert.equal(JSON.stringify(result.body).includes("mongodb+srv"), false);
    assert.equal(JSON.stringify(result.body).toLowerCase().includes("password"), false);
  });

  it("stores an edited field for this application without changing the candidate profile", async () => {
    install([field({ reviewStatus: "requires_review", label: "Preferred Name", id: "preferred_name", elementId: "preferred" })]);
    let written = "";
    browserSessions.hold({
      jobId: String(jobId),
      browser: { close: async () => undefined } as never,
      context: { close: async () => undefined } as never,
      page: {
        getByLabel: () => ({
          fill: async (value: string) => {
            written = value;
          },
          inputValue: async () => written,
        }),
      } as never,
      createdAt: Date.now(),
      submitting: false,
      isStopped: () => false,
      stop: () => undefined,
    });
    const result = response();
    await updateReviewField(request({ elementId: "preferred", value: "Asha P." }), result as never, () => undefined);
    const saved = ((state.preparation.browserRun as { fields: ReviewedApplicationField[] }).fields)[0];
    assert.equal(result.statusCode, 200);
    assert.equal(saved?.currentValue, "Asha P.");
    assert.equal(saved?.source, "user");
    assert.equal(saved?.reviewStatus, "filled");
    assert.equal(written, "Asha P.");
    assert.equal(state.application?.formFields && (state.application.formFields as { preferred: string }).preferred, "Asha P.");
    assert.equal(state.profileWrites, 0);
  });

  it("writes an edited field into the embedded application frame", async () => {
    install([field({ reviewStatus: "requires_review", label: "Preferred Name", id: "question_67505186", elementId: "preferred" })]);
    let written = "";
    const frame = {
      url: () => "https://job-boards.greenhouse.io/embed/job_app?for=mongodb&token=7993984",
      name: () => "",
      locator: () => ({ count: async () => 1 }),
      getByLabel: () => ({
        fill: async (value: string) => {
          written = value;
        },
        inputValue: async () => written,
      }),
    };
    browserSessions.hold({
      jobId: String(jobId),
      browser: { close: async () => undefined } as never,
      context: { close: async () => undefined } as never,
      page: {
        frames: () => [frame],
        mainFrame: () => ({ url: () => "https://www.mongodb.com/careers/jobs/7993984" }),
        getByLabel: () => {
          throw new Error("top page must not receive the edited value");
        },
      } as never,
      createdAt: Date.now(),
      submitting: false,
      isStopped: () => false,
      stop: () => undefined,
    });
    const result = response();
    await updateReviewField(request({ elementId: "preferred", value: "Test Candidate" }), result as never, () => undefined);
    assert.equal(result.statusCode, 200);
    assert.equal(written, "Test Candidate");
  });

  it("leaves the stored field unchanged when the browser rejects the value", async () => {
    install([field({ reviewStatus: "requires_review", label: "Preferred Name", id: "preferred_name", elementId: "preferred", currentValue: "Asha" })]);
    let attempted = false;
    browserSessions.hold({
      jobId: String(jobId),
      browser: { close: async () => undefined } as never,
      context: { close: async () => undefined } as never,
      page: {
        getByLabel: () => ({
          fill: async () => {
            attempted = true;
          },
          inputValue: async () => "Asha",
        }),
      } as never,
      createdAt: Date.now(),
      submitting: false,
      isStopped: () => false,
      stop: () => undefined,
    });
    const result = response();
    await updateReviewField(request({ elementId: "preferred", value: "ABC" }), result as never, () => undefined);
    const saved = ((state.preparation.browserRun as { fields: ReviewedApplicationField[] }).fields)[0];
    assert.equal(result.statusCode, 409);
    assert.equal(result.body?.message, "The browser did not accept this value");
    assert.equal(attempted, true);
    assert.equal(saved?.currentValue, "Asha");
    assert.equal(saved?.source, "candidate profile");
    assert.equal(state.application, null);
  });

  it("leaves the stored field unchanged when browser synchronization throws", async () => {
    install([field({ reviewStatus: "requires_review", label: "Preferred Name", id: "preferred_name", elementId: "preferred", currentValue: "Asha" })]);
    browserSessions.hold({
      jobId: String(jobId),
      browser: { close: async () => undefined } as never,
      context: { close: async () => undefined } as never,
      page: {
        getByLabel: () => ({
          fill: async () => {
            throw new Error("browser rejected the value");
          },
        }),
      } as never,
      createdAt: Date.now(),
      submitting: false,
      isStopped: () => false,
      stop: () => undefined,
    });
    const result = response();
    await updateReviewField(request({ elementId: "preferred", value: "ABC" }), result as never, () => undefined);
    const saved = ((state.preparation.browserRun as { fields: ReviewedApplicationField[] }).fields)[0];
    assert.equal(result.statusCode, 409);
    assert.equal(result.body?.message, "The browser did not accept this value");
    assert.equal(saved?.currentValue, "Asha");
    assert.equal(state.application, null);
  });

  it("reports an expired browser session without storing the edit", async () => {
    install([field({ elementId: "preferred", label: "Preferred Name", currentValue: "Asha" })]);
    const result = response();
    await updateReviewField(request({ elementId: "preferred", value: "Asha P." }), result as never, () => undefined);
    assert.equal(result.statusCode, 409);
    assert.equal(result.body?.message, "BROWSER_SESSION_EXPIRED");
    assert.equal(state.profileWrites, 0);
    const saved = ((state.preparation.browserRun as { fields: ReviewedApplicationField[] }).fields)[0];
    assert.equal(saved?.currentValue, "Asha");
    assert.equal(state.application, null);
  });

  it("rejects submission without explicit approval", async () => {
    install([field()]);
    let called = 0;
    submissionRuntime.submit = async () => {
      called += 1;
      throw new Error("submit must not run");
    };
    const result = response();
    await submitReviewedApplication(request({}), result as never, () => undefined);
    assert.equal(result.statusCode, 400);
    assert.equal(result.body?.message, "Explicit approval is required");
    assert.equal(called, 0);
  });

  it("rejects submission when a required field is unresolved", async () => {
    install([field({ reviewStatus: "requires_review", label: "Gender Identity (Select one)" })]);
    browserSessions.hold({
      jobId: String(jobId),
      browser: { close: async () => undefined } as never,
      context: { close: async () => undefined } as never,
      page: {} as never,
      createdAt: Date.now(),
      submitting: false,
      isStopped: () => false,
      stop: () => undefined,
    });
    let called = 0;
    submissionRuntime.submit = async () => {
      called += 1;
      return { status: "SUBMITTED", clicked: true, confirmationDetected: true };
    };
    const result = response();
    await submitReviewedApplication(request({ approved: true }), result as never, () => undefined);
    assert.equal(result.statusCode, 409);
    assert.equal(called, 0);
  });

  it("rejects submission when the browser session is unavailable", async () => {
    install([field()]);
    let called = 0;
    submissionRuntime.submit = async () => {
      called += 1;
      return { status: "SUBMITTED", clicked: true, confirmationDetected: true };
    };
    const result = response();
    await submitReviewedApplication(request({ approved: true }), result as never, () => undefined);
    assert.equal(result.statusCode, 409);
    assert.match(String(result.body?.message), /unavailable|BROWSER_SESSION_EXPIRED/);
    assert.equal(called, 0);
  });

  it("rejects submission after cancellation and when already submitted", async () => {
    install([field()], "CANCELLED");
    let called = 0;
    submissionRuntime.submit = async () => {
      called += 1;
      return { status: "SUBMITTED", clicked: true, confirmationDetected: true };
    };
    const cancelled = response();
    await submitReviewedApplication(request({ approved: true }), cancelled as never, () => undefined);
    assert.equal(cancelled.statusCode, 409);
    assert.match(String(cancelled.body?.message), /cancelled/i);
    state.application = { status: "submitted" };
    state.preparation.browserRun = { ...(state.preparation.browserRun as object), status: "PAUSED_FOR_REVIEW" };
    const duplicate = response();
    await submitReviewedApplication(request({ approved: true }), duplicate as never, () => undefined);
    assert.equal(duplicate.statusCode, 409);
    assert.equal(duplicate.body?.message, "Already submitted");
    assert.equal(called, 0);
  });

  it("clicks the final control only after explicit approval and records confirmed success", async () => {
    install([field()]);
    const gate = { stopped: false };
    browserSessions.hold({
      jobId: String(jobId),
      browser: { close: async () => undefined } as never,
      context: { close: async () => undefined } as never,
      page: { url: () => "https://jobs.example.test/apply" } as never,
      createdAt: Date.now(),
      submitting: false,
      isStopped: () => gate.stopped,
      stop: () => {
        gate.stopped = true;
      },
    });
    let called = 0;
    submissionRuntime.submit = async () => {
      called += 1;
      return {
        status: "SUBMITTED",
        clicked: true,
        confirmationDetected: true,
        url: "https://jobs.example.test/thanks",
        reason: "Submission confirmation detected",
      };
    };
    const result = response();
    await submitReviewedApplication(request({ approved: true }), result as never, () => undefined);
    assert.equal(called, 1);
    assert.equal(result.body?.success, true);
    assert.equal(state.application?.status, "submitted");
    const history = state.application?.history as Array<{ type: string; newStatus: string }>;
    assert.equal(history[0]?.type, "Application submitted");
    assert.equal(history[0]?.newStatus, "submitted");
  });

  it("does not report an unconfirmed click as success and does not retry it", async () => {
    install([field()]);
    browserSessions.hold({
      jobId: String(jobId),
      browser: { close: async () => undefined } as never,
      context: { close: async () => undefined } as never,
      page: {} as never,
      createdAt: Date.now(),
      submitting: false,
      isStopped: () => false,
      stop: () => undefined,
    });
    let called = 0;
    submissionRuntime.submit = async () => {
      called += 1;
      return {
        status: "SUBMISSION_UNKNOWN",
        clicked: true,
        confirmationDetected: false,
        reason: "Final control was clicked, but submission was not confirmed",
      };
    };
    const first = response();
    await submitReviewedApplication(request({ approved: true }), first as never, () => undefined);
    assert.equal(first.body?.success, false);
    assert.equal(state.application?.status, "submission_unknown");
    const unknownHistory = state.application?.history as Array<{ type: string; newStatus: string }>;
    assert.equal(unknownHistory[0]?.newStatus, "submission_unknown");
    assert.notEqual(unknownHistory[0]?.type, "Application submitted");
    const second = response();
    await submitReviewedApplication(request({ approved: true }), second as never, () => undefined);
    assert.equal(second.statusCode, 409);
    assert.equal(called, 1);
  });

  it("records a failed submission without clicking again", async () => {
    install([field()]);
    browserSessions.hold({
      jobId: String(jobId),
      browser: { close: async () => undefined } as never,
      context: { close: async () => undefined } as never,
      page: {} as never,
      createdAt: Date.now(),
      submitting: false,
      isStopped: () => false,
      stop: () => undefined,
    });
    submissionRuntime.submit = async () => ({
      status: "SUBMISSION_FAILED",
      clicked: true,
      confirmationDetected: false,
      reason: "Final submission click failed",
    });
    const result = response();
    await submitReviewedApplication(request({ approved: true }), result as never, () => undefined);
    assert.equal(state.application?.status, "submission_failed");
    assert.equal((state.application?.submission as { clicked: boolean }).clicked, true);
    const failedHistory = state.application?.history as Array<{ type: string; newStatus: string }>;
    assert.equal(failedHistory[0]?.newStatus, "submission_failed");
    assert.notEqual(failedHistory[0]?.type, "Application submitted");
  });

  it("rejects a second submission while one is in progress", async () => {
    install([field()]);
    const session = {
      jobId: String(jobId),
      browser: { close: async () => undefined } as never,
      context: { close: async () => undefined } as never,
      page: {} as never,
      createdAt: Date.now(),
      submitting: true,
      isStopped: () => false,
      stop: () => undefined,
    };
    browserSessions.hold(session);
    let called = 0;
    submissionRuntime.submit = async () => {
      called += 1;
      return { status: "SUBMITTED", clicked: true, confirmationDetected: true };
    };
    const result = response();
    await submitReviewedApplication(request({ approved: true }), result as never, () => undefined);
    assert.equal(result.statusCode, 409);
    assert.match(String(result.body?.message), /in progress/);
    assert.equal(called, 0);
  });

  it("stops an active browser without submitting", async () => {
    install([field()]);
    let closed = false;
    let stopped = false;
    browserSessions.hold({
      jobId: String(jobId),
      browser: { close: async () => { closed = true; } } as never,
      context: { close: async () => undefined } as never,
      page: {} as never,
      createdAt: Date.now(),
      submitting: false,
      isStopped: () => stopped,
      stop: () => {
        stopped = true;
      },
    });
    activeRuns.set(String(jobId), {
      stop: async () => {
        stopped = true;
        await browserSessions.release(String(jobId));
        activeRuns.delete(String(jobId));
      },
    });
    let called = 0;
    submissionRuntime.submit = async () => {
      called += 1;
      return { status: "SUBMITTED", clicked: true, confirmationDetected: true };
    };
    const stoppedResponse = response();
    await stopBrowserRun(request(), stoppedResponse as never, () => undefined);
    assert.equal(stoppedResponse.statusCode, 202);
    assert.equal(stopped, true);
    assert.equal(closed, true);
    const submitResponse = response();
    await submitReviewedApplication(request({ approved: true }), submitResponse as never, () => undefined);
    assert.equal(submitResponse.statusCode, 409);
    assert.equal(called, 0);
  });

  it("cancels without clicking submit", async () => {
    install([field()]);
    let clicked = 0;
    browserSessions.hold({
      jobId: String(jobId),
      browser: { close: async () => undefined } as never,
      context: { close: async () => undefined } as never,
      page: { getByRole: () => ({ click: async () => { clicked += 1; }, count: async () => 1 }) } as never,
      createdAt: Date.now(),
      submitting: false,
      isStopped: () => false,
      stop: () => undefined,
    });
    const result = response();
    await cancelReviewedApplication(request(), result as never, () => undefined);
    assert.equal(result.body?.data && (result.body.data as { status: string }).status, "CANCELLED");
    assert.equal((state.preparation.browserRun as { status: string }).status, "CANCELLED");
    assert.equal(state.application?.status, "cancelled");
    assert.equal(clicked, 0);
  });

  it("does not bypass a captcha or invent a sensitive answer", async () => {
    let clicked = 0;
    const page = {
      url: () => "https://jobs.example.test/apply",
      locator: (selector: string) => ({
        innerText: async () => (selector === "body" ? "captcha security challenge" : ""),
        evaluateAll: async () => [],
        count: async () => 0,
      }),
      getByRole: () => ({
        count: async () => 1,
        click: async () => {
          clicked += 1;
        },
      }),
    };
    const attempt = await submitHeldApplication(page as never, {
      isStopped: () => false,
      fields: [],
    });
    assert.equal(attempt.status, "CAPTCHA_REQUIRED");
    assert.equal(attempt.clicked, false);
    assert.equal(clicked, 0);
    assert.equal(submissionBlockers({
      sessionAvailable: true,
      browserStatus: "PAUSED_FOR_REVIEW",
      fields: [field({
        label: "Gender Identity (Select one)",
        reviewStatus: "requires_review",
        source: "browser-detected",
      })],
    }).some((blocker) => blocker.includes("Gender Identity")), true);
  });
});
