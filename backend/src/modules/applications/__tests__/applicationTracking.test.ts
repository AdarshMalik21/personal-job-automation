import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Types } from "mongoose";
import { ApplicationModel } from "../../../models/Application.js";
import { CandidateProfileModel } from "../../../models/CandidateProfile.js";
import { JobModel } from "../../../models/Job.js";
import {
  getApplicationFollowUp,
  prepareApplicationFollowUp,
  updateApplicationStatus,
} from "../../../controllers/applicationTrackingController.js";
import { submissionRuntime } from "../applicationSubmission.js";
import {
  FOLLOW_UP_AFTER_DAYS,
  applicationAnalytics,
  buildFollowUpDraft,
  followUpDecision,
  planFollowUps,
  type TrackedApplication,
} from "../applicationTracking.js";
import { evaluateFollowUps } from "../followUpService.js";

const jobId = new Types.ObjectId();
const candidateId = new Types.ObjectId();
const applicationId = new Types.ObjectId();
const day = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-06T12:00:00.000Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * day);

const chain = <T>(value: T) => ({
  lean: async () => value,
  sort: () => ({ lean: async () => value }),
});

const state: { application: Record<string, unknown> | null; updates: Array<Record<string, unknown>> } = {
  application: null,
  updates: [],
};

const originals = {
  job: JobModel.findById,
  candidate: CandidateProfileModel.findOne,
  application: ApplicationModel.findOne,
  applicationById: ApplicationModel.findByIdAndUpdate,
  applicationFind: ApplicationModel.find,
  applicationUpdate: ApplicationModel.updateOne,
  submit: submissionRuntime.submit,
};

const install = (application: Record<string, unknown> | null, candidate: Record<string, unknown> = {
  _id: candidateId,
  isActive: true,
  personal: { firstName: "Asha", lastName: "Rao" },
  contact: { email: "asha@example.com" },
}) => {
  state.application = application;
  state.updates = [];
  (JobModel as unknown as { findById: unknown }).findById = () => chain({
    _id: jobId,
    title: "Software Engineer 3",
    company: "MongoDB",
  });
  (CandidateProfileModel as unknown as { findOne: unknown }).findOne = () => chain(candidate);
  (ApplicationModel as unknown as { findOne: unknown }).findOne = () => chain(state.application);
  (ApplicationModel as unknown as { findByIdAndUpdate: unknown }).findByIdAndUpdate = (_id: unknown, update: { $set?: Record<string, unknown>; $push?: { history?: unknown | { $each?: unknown[] } } }) => {
    state.updates.push(update as Record<string, unknown>);
    const pushed = update.$push?.history;
    const events = pushed && typeof pushed === "object" && "$each" in (pushed as object)
      ? (pushed as { $each: unknown[] }).$each
      : pushed ? [pushed] : [];
    const history = [...((state.application?.history as unknown[]) ?? []), ...events];
    state.application = { ...(state.application ?? {}), ...update.$set, history };
    return { lean: async () => state.application };
  };
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

const request = (body?: Record<string, unknown>) => ({ params: { jobId: String(jobId) }, body }) as never;

afterEach(() => {
  JobModel.findById = originals.job;
  CandidateProfileModel.findOne = originals.candidate;
  ApplicationModel.findOne = originals.application;
  ApplicationModel.findByIdAndUpdate = originals.applicationById;
  ApplicationModel.find = originals.applicationFind;
  ApplicationModel.updateOne = originals.applicationUpdate;
  submissionRuntime.submit = originals.submit;
});

describe("application tracking", () => {
  it("requires authentication for tracking routes", async () => {
    process.env.JWT_SECRET ??= "test-secret";
    process.env.ADMIN_EMAIL ??= "admin@example.com";
    process.env.ADMIN_PASSWORD ??= "password";
    const { applicationRoutes } = await import("../../../routes/applicationRoutes.js");
    const stack = (applicationRoutes as unknown as { stack: Array<{ name?: string; handle?: { name?: string }; route?: { path?: string; methods?: Record<string, boolean> } }> }).stack;
    assert.equal(stack[0]?.name ?? stack[0]?.handle?.name, "requireAuth");
    assert.equal(stack.some((entry) => entry.route?.path === "/:jobId/status" && entry.route.methods?.patch), true);
    assert.equal(stack.some((entry) => entry.route?.path === "/:jobId/tracking" && entry.route.methods?.get), true);
    assert.equal(stack.some((entry) => entry.route?.path === "/:jobId/follow-up" && entry.route.methods?.post), true);
  });

  it("records a valid status change without touching submission", async () => {
    install({
      _id: applicationId,
      status: "submitted",
      submission: { clicked: true, confirmationDetected: true },
      history: [],
    });
    let submitted = 0;
    submissionRuntime.submit = async () => {
      submitted += 1;
      throw new Error("status update must not submit");
    };
    const result = response();
    await updateApplicationStatus(request({ status: "interview", note: "Recruiter scheduled technical interview" }), result as never, (error) => { throw error; });
    const application = (result.body?.data as { application: { status: string; history: Array<{ type: string; previousStatus: string; newStatus: string; note: string; source: string }> } }).application;
    assert.equal(result.statusCode, 200);
    assert.equal(application.status, "interview");
    assert.equal(application.history[0]?.type, "Interview received");
    assert.equal(application.history[0]?.previousStatus, "submitted");
    assert.equal(application.history[0]?.newStatus, "interview");
    assert.equal(application.history[0]?.note, "Recruiter scheduled technical interview");
    assert.equal(application.history[0]?.source, "user");
    assert.equal((state.application?.submission as { clicked: boolean }).clicked, true);
    assert.equal(state.updates[0]?.$set && "submission" in (state.updates[0].$set as object), false);
    assert.equal(submitted, 0);
  });

  it("rejects an invalid tracking status", async () => {
    install({ _id: applicationId, status: "submitted", history: [] });
    const result = response();
    await updateApplicationStatus(request({ status: "submitted" }), result as never, () => undefined);
    assert.equal(result.statusCode, 400);
    assert.equal(result.body?.message, "Status is not allowed");
    assert.equal(state.application?.status, "submitted");
  });

  it("marks a submitted application eligible after exactly five days", () => {
    const application = { _id: applicationId, status: "submitted", appliedDate: daysAgo(FOLLOW_UP_AFTER_DAYS), history: [] };
    assert.equal(followUpDecision(application, now).eligible, true);
    assert.equal(followUpDecision({ ...application, appliedDate: new Date(daysAgo(FOLLOW_UP_AFTER_DAYS).getTime() + 60_000) }, now).eligible, false);
    assert.match(followUpDecision({ ...application, appliedDate: daysAgo(4) }, now).reason, /less than 5 days/);
  });

  it("keeps terminal and unconfirmed applications ineligible for follow-up", () => {
    for (const status of ["rejected", "interview", "offer", "withdrawn", "submission_failed", "submission_unknown", "cancelled"]) {
      const decision = followUpDecision({ status, appliedDate: daysAgo(30) }, now);
      assert.equal(decision.eligible, false, status);
    }
  });

  it("does not record a second follow-up requirement", async () => {
    const submitted = { _id: applicationId, status: "submitted", appliedDate: daysAgo(6), history: [] };
    const first = planFollowUps([submitted], now);
    assert.equal(first.length, 1);
    assert.equal(first[0]?.event.type, "Follow-up required");
    const again = planFollowUps([{
      ...submitted,
      status: "follow_up_required",
      followUp: { eligible: true },
      history: [first[0]!.event],
    }], now);
    assert.equal(again.length, 0);
    const duplicateHistory = planFollowUps([{ ...submitted, history: [first[0]!.event] }], now);
    assert.equal(duplicateHistory.length, 0);

    let stored: TrackedApplication[] = [submitted];
    (ApplicationModel as unknown as { find: unknown }).find = () => chain(stored);
    (ApplicationModel as unknown as { updateOne: unknown }).updateOne = async () => {
      stored = stored.map((application) => ({
        ...application,
        status: "follow_up_required",
        followUp: { eligible: true },
        history: [first[0]!.event],
      }));
    };
    const firstRun = await evaluateFollowUps(now);
    const secondRun = await evaluateFollowUps(now);
    assert.equal(firstRun.updated, 1);
    assert.equal(secondRun.updated, 0);
  });

  it("stores a follow-up draft from the candidate profile and does not send it", async () => {
    install({
      _id: applicationId,
      status: "submitted",
      appliedDate: new Date("2026-09-01T00:00:00.000Z"),
      history: [],
    });
    const result = response();
    await prepareApplicationFollowUp(request({}), result as never, (error) => { throw error; });
    const payload = result.body?.data as { followUp: { draft: { body: string; subject: string }; status: string }; sent: boolean };
    const followUp = payload.followUp;
    assert.equal(result.statusCode, 200);
    assert.match(followUp.draft.subject, /Software Engineer 3/);
    assert.match(followUp.draft.body, /MongoDB/);
    assert.match(followUp.draft.body, /2026-09-01/);
    assert.match(followUp.draft.body, /Asha Rao/);
    assert.equal(payload.sent, false);
    assert.equal(state.application?.status, "follow_up_required");
    const history = state.application?.history as Array<{ type: string }>;
    assert.equal(history.filter((event) => event.type === "Follow-up prepared").length, 1);
    const repeat = response();
    await prepareApplicationFollowUp(request({}), repeat as never, () => undefined);
    const repeated = (state.application?.history as Array<{ type: string }>).filter((event) => event.type === "Follow-up prepared");
    assert.equal(repeated.length, 1);
  });

  it("marks a draft as needing information when the candidate profile is incomplete", async () => {
    install({
      _id: applicationId,
      status: "follow_up_required",
      appliedDate: daysAgo(8),
      history: [],
      followUp: { eligible: true, status: "required" },
    }, { _id: candidateId, isActive: true, personal: {}, contact: {} });
    const draft = buildFollowUpDraft({ jobTitle: "Software Engineer 3", company: "MongoDB", appliedDate: daysAgo(8) });
    assert.deepEqual(draft.missingInformation, ["Candidate name", "Candidate email"]);
    assert.equal(draft.body.includes("Asha"), false);
    const result = response();
    await prepareApplicationFollowUp(request({}), result as never, (error) => { throw error; });
    const followUp = (result.body?.data as { followUp: { status: string; draft: { missingInformation: string[] } } }).followUp;
    assert.equal(followUp.status, "needs_information");
    assert.deepEqual(followUp.draft.missingInformation, ["Candidate name", "Candidate email"]);
  });

  it("explains why a recent submission cannot be followed up", async () => {
    install({ _id: applicationId, status: "submitted", appliedDate: daysAgo(1), history: [] });
    const result = response();
    await getApplicationFollowUp(request(), result as never, () => undefined);
    const followUp = (result.body?.data as { followUp: { eligible: boolean; reason: string } }).followUp;
    assert.equal(followUp.eligible, false);
    assert.match(followUp.reason, /less than 5 days/);
    const prepare = response();
    await prepareApplicationFollowUp(request({}), prepare as never, () => undefined);
    assert.equal(prepare.statusCode, 409);
    assert.equal(state.updates.length, 0);
  });

  it("calculates application counts and zero-safe conversion rates", () => {
    const analytics = applicationAnalytics(["submitted", "submitted", "interview", "offer", "rejected", "withdrawn", "follow_up_required", "prepared"]);
    assert.equal(analytics.totalApplications, 8);
    assert.equal(analytics.submitted, 2);
    assert.equal(analytics.interviews, 1);
    assert.equal(analytics.offers, 1);
    assert.equal(analytics.rejected, 1);
    assert.equal(analytics.withdrawn, 1);
    assert.equal(analytics.followUpsRequired, 1);
    assert.equal(analytics.successfullySubmitted, 7);
    assert.equal(analytics.interviewRate, 1 / 7);
    assert.equal(analytics.offerRate, 1 / 7);
    assert.equal(analytics.rejectionRate, 1 / 7);
    assert.equal(applicationAnalytics([]).interviewRate, 0);
    assert.equal(applicationAnalytics(["prepared"]).offerRate, 0);
  });
});
