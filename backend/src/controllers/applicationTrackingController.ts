import type { RequestHandler } from "express";
import { isValidObjectId } from "mongoose";
import { ApplicationModel } from "../models/Application.js";
import { CandidateProfileModel } from "../models/CandidateProfile.js";
import { JobModel } from "../models/Job.js";
import {
  applicationAnalytics,
  buildFollowUpDraft,
  followUpDecision,
  isUserTrackingStatus,
  statusChangeEvent,
  trackingSummary,
  type FollowUpRecord,
  type HistoryEvent,
  type TrackedApplication,
} from "../modules/applications/applicationTracking.js";
import { evaluateFollowUps } from "../modules/applications/followUpService.js";

const notFound = (response: Parameters<RequestHandler>[1], message: string) => {
  response.status(404).json({ success: false, message });
};

const requestJobId = (request: Parameters<RequestHandler>[0]): string | undefined => {
  const value = request.params.jobId;
  return typeof value === "string" ? value : undefined;
};

const loadContext = async (jobId: string) => {
  const candidate = await CandidateProfileModel.findOne({ isActive: true }).sort({ updatedAt: -1 }).lean();
  if (!candidate) return { candidate: undefined, job: undefined, application: undefined };
  const [job, application] = await Promise.all([
    JobModel.findById(jobId).lean(),
    ApplicationModel.findOne({ jobId, candidateProfileId: candidate._id }).lean(),
  ]);
  return { candidate, job, application };
};

const tracked = (application: Record<string, unknown> | undefined): TrackedApplication =>
  (application ?? {}) as TrackedApplication;

const trackingResponse = (
  application: NonNullable<Awaited<ReturnType<typeof loadContext>>["application"]>,
) => {
  const record = tracked(application as unknown as Record<string, unknown>);
  const summary = trackingSummary(record);
  return {
    ...summary,
    status: application.status,
    history: application.history ?? [],
    submission: application.submission ?? {},
    followUp: application.followUp ?? { eligible: false, status: "none" },
    applicationUrl: application.applicationUrl,
  };
};

export const getApplicationTracking: RequestHandler = async (request, response, next) => {
  try {
    const jobId = requestJobId(request);
    if (!jobId || !isValidObjectId(jobId)) {
      notFound(response, "Job not found");
      return;
    }
    const context = await loadContext(jobId);
    if (!context.job) {
      notFound(response, "Job not found");
      return;
    }
    if (!context.application) {
      notFound(response, "Application not found");
      return;
    }
    response.json({ success: true, data: { application: trackingResponse(context.application) } });
  } catch (error) {
    next(error);
  }
};

export const updateApplicationStatus: RequestHandler = async (request, response, next) => {
  try {
    const jobId = requestJobId(request);
    const status = typeof request.body?.status === "string" ? request.body.status : "";
    const note = typeof request.body?.note === "string" ? request.body.note.trim() : "";
    if (!jobId || !isValidObjectId(jobId)) {
      notFound(response, "Job not found");
      return;
    }
    if (!isUserTrackingStatus(status)) {
      response.status(400).json({ success: false, message: "Status is not allowed" });
      return;
    }
    const context = await loadContext(jobId);
    if (!context.application) {
      notFound(response, "Application not found");
      return;
    }
    if (context.application.status === status) {
      response.status(409).json({ success: false, message: "Application is already in this status" });
      return;
    }
    const at = new Date();
    const event = statusChangeEvent({
      previousStatus: context.application.status,
      status,
      at,
      source: "user",
      ...(note ? { note } : {}),
    });
    const updated = await ApplicationModel.findByIdAndUpdate(
      context.application._id,
      { $set: { status }, $push: { history: event } },
      { new: true },
    ).lean();
    response.json({ success: true, data: { application: trackingResponse(updated ?? context.application) } });
  } catch (error) {
    next(error);
  }
};

export const getApplicationFollowUp: RequestHandler = async (request, response, next) => {
  try {
    const jobId = requestJobId(request);
    if (!jobId || !isValidObjectId(jobId)) {
      notFound(response, "Job not found");
      return;
    }
    const context = await loadContext(jobId);
    if (!context.application) {
      notFound(response, "Application not found");
      return;
    }
    const record = tracked(context.application as unknown as Record<string, unknown>);
    const decision = followUpDecision(record);
    const followUp = (context.application.followUp ?? {}) as FollowUpRecord;
    response.json({
      success: true,
      data: {
        followUp: {
          eligible: decision.eligible || Boolean(followUp.eligible),
          reason: followUp.reason ?? decision.reason,
          eligibleAt: followUp.eligibleAt,
          draft: followUp.draft,
          status: followUp.status ?? (decision.eligible ? "required" : "none"),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const prepareApplicationFollowUp: RequestHandler = async (request, response, next) => {
  try {
    const jobId = requestJobId(request);
    if (!jobId || !isValidObjectId(jobId)) {
      notFound(response, "Job not found");
      return;
    }
    const context = await loadContext(jobId);
    if (!context.application || !context.job || !context.candidate) {
      notFound(response, "Application not found");
      return;
    }
    const record = tracked(context.application as unknown as Record<string, unknown>);
    const decision = followUpDecision(record);
    const existing = (context.application.followUp ?? {}) as FollowUpRecord;
    if (!decision.eligible && !existing.eligible) {
      response.status(409).json({ success: false, message: decision.reason });
      return;
    }
    const personal = (context.candidate.personal ?? {}) as { firstName?: string; lastName?: string };
    const contact = (context.candidate.contact ?? {}) as { email?: string };
    const generated = buildFollowUpDraft({
      jobTitle: context.job.title,
      company: context.job.company,
      ...(context.application.appliedDate ? { appliedDate: context.application.appliedDate } : {}),
      ...(personal.firstName ? { firstName: personal.firstName } : {}),
      ...(personal.lastName ? { lastName: personal.lastName } : {}),
      ...(contact.email ? { email: contact.email } : {}),
    });
    const customDraft = typeof request.body?.draft === "string" ? request.body.draft.trim() : "";
    const draft = {
      subject: generated.subject,
      body: customDraft || generated.body,
      missingInformation: generated.missingInformation,
    };
    const followUpStatus = generated.status;
    const at = new Date();
    const alreadyPrepared = Boolean(existing.preparedAt) || (record.history ?? []).some((event) => event.type === "Follow-up prepared");
    const events: HistoryEvent[] = [];
    if (!alreadyPrepared) {
      if (!(record.history ?? []).some((event) => event.type === "Follow-up required") && context.application.status === "submitted") {
        events.push(statusChangeEvent({
          previousStatus: "submitted",
          status: "follow_up_required",
          note: decision.reason,
          at,
          source: "system",
        }));
      }
      events.push({
        type: "Follow-up prepared",
        timestamp: at,
        previousStatus: context.application.status,
        newStatus: "follow_up_required",
        source: "system",
      });
    }
    const updated = await ApplicationModel.findByIdAndUpdate(
      context.application._id,
      {
        $set: {
          status: context.application.status === "submitted" ? "follow_up_required" : context.application.status,
          followUpDate: existing.eligibleAt ?? at,
          followUpStatus,
          followUp: {
            eligible: true,
            eligibleAt: existing.eligibleAt ?? at,
            status: followUpStatus,
            reason: existing.reason ?? decision.reason,
            draft,
            preparedAt: existing.preparedAt ?? at,
          },
        },
        ...(events.length ? { $push: { history: { $each: events } } } : {}),
      },
      { new: true },
    ).lean();
    response.json({
      success: true,
      data: {
        followUp: (updated?.followUp ?? {}) as FollowUpRecord,
        sent: false,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getApplicationAnalytics: RequestHandler = async (_request, response, next) => {
  try {
    const statuses = await ApplicationModel.find().select("status").lean();
    response.json({ success: true, data: { analytics: applicationAnalytics(statuses.map((item) => item.status)) } });
  } catch (error) {
    next(error);
  }
};

export const evaluateApplicationFollowUps: RequestHandler = async (_request, response, next) => {
  try {
    const result = await evaluateFollowUps();
    response.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
