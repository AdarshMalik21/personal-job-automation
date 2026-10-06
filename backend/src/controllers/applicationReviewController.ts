import type { RequestHandler } from "express";
import { isValidObjectId } from "mongoose";
import { ApplicationModel } from "../models/Application.js";
import { ApplicationPreparationModel } from "../models/ApplicationPreparation.js";
import { CandidateProfileModel } from "../models/CandidateProfile.js";
import { JobModel } from "../models/Job.js";
import { activeRuns, browserSessions } from "../modules/applications/browserSession.js";
import { submissionRuntime } from "../modules/applications/applicationSubmission.js";
import { selectApplicationFrame } from "../modules/applications/applicationPageInspector.js";
import { writeApplicationField } from "../modules/applications/applicationRunner.js";
import type { ReviewedApplicationField } from "../modules/applications/browserRunTypes.js";
import { evaluateFreshness } from "../modules/jobs/services/freshness.js";

const notFound = (response: Parameters<RequestHandler>[1], message: string) => {
  response.status(404).json({ success: false, message });
};

const requestJobId = (request: Parameters<RequestHandler>[0]): string | undefined => {
  const value = request.params.jobId;
  return typeof value === "string" ? value : undefined;
};

const loadContext = async (jobId: string) => {
  const candidate = await CandidateProfileModel.findOne({ isActive: true })
    .sort({ updatedAt: -1 })
    .lean();
  if (!candidate) return { candidate: undefined, job: undefined, preparation: undefined, application: undefined };
  const [job, preparation, application] = await Promise.all([
    JobModel.findById(jobId).lean(),
    ApplicationPreparationModel.findOne({ jobId, candidateProfileId: candidate._id }).lean(),
    ApplicationModel.findOne({ jobId, candidateProfileId: candidate._id }).lean(),
  ]);
  return { candidate, job, preparation, application };
};

const browserRunOf = (preparation: { browserRun?: unknown } | undefined) =>
  (preparation?.browserRun ?? {}) as {
    status?: string;
    runId?: string;
    url?: string;
    frameUrl?: string;
    pagesProcessed?: number;
    fieldsDetected?: number;
    fieldsFilled?: string[];
    fields?: ReviewedApplicationField[];
    finalControl?: string;
    reason?: string;
    stopped?: boolean;
    submission?: Record<string, unknown>;
  };

const safeUrl = (value: string | undefined) => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (/validity|secret|cookie|session|password/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return value;
  }
};

const unresolved = (field: ReviewedApplicationField) =>
  field.reviewStatus === "requires_review" ||
  field.reviewStatus === "missing" ||
  (field.required && field.reviewStatus !== "filled" && field.reviewStatus !== "known");

export const submissionBlockers = (input: {
  applicationStatus?: string | undefined;
  browserStatus?: string | undefined;
  stopped?: boolean | undefined;
  sessionAvailable: boolean;
  submitting?: boolean | undefined;
  clicked?: boolean | undefined;
  coverLetterStatus?: string | undefined;
  missingInformation?: string[] | undefined;
  fields?: ReviewedApplicationField[] | undefined;
}): string[] => {
  const blockers: string[] = [];
  if (input.applicationStatus === "submitted" || input.browserStatus === "SUBMITTED") {
    blockers.push("Already submitted");
  }
  if (input.clicked) blockers.push("Submission was already attempted and will not be retried automatically");
  if (input.applicationStatus === "cancelled" || input.browserStatus === "CANCELLED") {
    blockers.push("Application cancelled");
  }
  if (input.stopped) blockers.push("Browser run stopped by user");
  if (input.submitting || input.browserStatus === "SUBMITTING" || input.applicationStatus === "submitting") {
    blockers.push("A submission is already in progress");
  }
  if (!input.sessionAvailable) blockers.push("Browser session is unavailable");
  if (input.browserStatus !== "PAUSED_FOR_REVIEW" && input.browserStatus !== "READY_FOR_SUBMISSION") {
    blockers.push("Browser run is not ready for approval");
  }
  if (input.coverLetterStatus === "needs_information") blockers.push("Cover letter required — action needed");
  for (const item of input.missingInformation ?? []) blockers.push(item);
  if ((input.fields ?? []).length === 0) blockers.push("Application fields have not been captured");
  for (const field of input.fields ?? []) {
    if (!unresolved(field)) continue;
    blockers.push(`${field.label ?? field.elementId} requires review`);
  }
  return blockers;
};

const reviewPayload = (
  jobId: string,
  context: Awaited<ReturnType<typeof loadContext>>,
) => {
  const { candidate, job, preparation, application } = context;
  const browserRun = browserRunOf(preparation ?? undefined);
  const session = browserSessions.get(jobId);
  const sessionAvailable = Boolean(session);
  const fields = browserRun.fields ?? [];
  const storedStatus = browserRun.status;
  const status = (storedStatus === "PAUSED_FOR_REVIEW" || storedStatus === "READY_FOR_SUBMISSION") && !sessionAvailable
    ? "BROWSER_SESSION_EXPIRED"
    : storedStatus;
  const coverLetter = (preparation?.coverLetter ?? {}) as { status?: string; content?: string; reason?: string };
  const match = (job?.match ?? {}) as {
    score?: number;
    matchScore?: number;
    decision?: string;
    reasons?: string[];
    reasoning?: string;
  };
  const tailoredResume = (preparation?.tailoredResume ?? {}) as {
    summary?: string;
    skills?: string[];
    filePath?: string;
    experience?: unknown[];
    education?: unknown[];
    projects?: unknown[];
  };
  const profileSkills = new Set((candidate?.skills as string[] | undefined) ?? []);
  const extraSkills = (tailoredResume.skills ?? []).filter((skill) => !profileSkills.has(skill));
  const blockers = submissionBlockers({
    applicationStatus: application?.status,
    browserStatus: storedStatus,
    stopped: browserRun.stopped,
    sessionAvailable,
    submitting: session?.submitting,
    clicked: Boolean((application?.submission as { clicked?: boolean } | undefined)?.clicked),
    coverLetterStatus: coverLetter.status,
    missingInformation: preparation?.missingInformation as string[] | undefined,
    fields,
  });
  return {
    job: {
      id: jobId,
      title: job?.title,
      company: job?.company,
      location: job?.location,
      source: job?.source,
      officialApplicationUrl: job?.officialApplicationUrl,
      description: job?.description,
      freshness: evaluateFreshness({
        ...(job?.postedDate ? { postedDate: job.postedDate } : {}),
        ...(job?.updatedDate ? { updatedDate: job.updatedDate } : {}),
      }),
      matchScore: match.matchScore ?? match.score,
      matchDecision: match.decision,
      matchExplanation: match.reasons ?? (match.reasoning ? [match.reasoning] : []),
      requiredSkills: job?.requiredSkills ?? [],
    },
    preparation: {
      status: preparation?.status,
      tailoredResume,
      resumeChanges: [
        extraSkills.length
          ? `Skills beyond the candidate profile: ${extraSkills.join(", ")}`
          : "Tailored skills stay within the candidate profile.",
        tailoredResume.filePath ? `Resume file: ${tailoredResume.filePath}` : "No resume file will be uploaded.",
      ],
      coverLetter,
      generatedAnswers: preparation?.generatedAnswers ?? [],
      missingInformation: preparation?.missingInformation ?? [],
      warnings: [
        ...((preparation?.missingInformation as string[] | undefined) ?? []),
        ...(coverLetter.status === "needs_information" ? ["Cover letter required — action needed"] : []),
      ],
    },
    browserRun: {
      id: browserRun.runId,
      status,
      applicationUrl: safeUrl(browserRun.url) ?? job?.officialApplicationUrl,
      pagesProcessed: browserRun.pagesProcessed ?? 0,
      fieldsDetected: browserRun.fieldsDetected ?? fields.length,
      fieldsFilled: browserRun.fieldsFilled ?? [],
      fields,
      unresolvedFields: fields.filter(unresolved),
      finalControl: browserRun.finalControl,
      reason: browserRun.reason,
      sessionAvailable,
    },
    application: {
      status: application?.status,
      submission: application?.submission,
    },
    canSubmit: blockers.length === 0,
    blockers,
  };
};

export const getReview: RequestHandler = async (request, response, next) => {
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
    if (!context.candidate) {
      notFound(response, "Active candidate profile not found");
      return;
    }
    if (!context.preparation) {
      notFound(response, "Application preparation not found");
      return;
    }
    response.json({ success: true, data: { review: reviewPayload(jobId, context) } });
  } catch (error) {
    next(error);
  }
};

const saveFields = async (
  preparationId: unknown,
  applicationQuery: { jobId: unknown; candidateProfileId: unknown },
  fields: ReviewedApplicationField[],
  elementId: string,
  value: string,
) => {
  await ApplicationPreparationModel.findByIdAndUpdate(preparationId, {
    $set: { "browserRun.fields": fields },
  });
  const existing = await ApplicationModel.findOne(applicationQuery).lean();
  const formFields = { ...(existing?.formFields as Record<string, unknown> | undefined), [elementId]: value };
  await ApplicationModel.findOneAndUpdate(
    applicationQuery,
    {
      $set: { formFields, status: existing?.status === "submitted" ? "submitted" : existing?.status ?? "ready_for_review" },
      $setOnInsert: { generatedAnswers: [], resumeUsed: {}, coverLetter: "" },
    },
    { upsert: true },
  );
};

export const updateReviewField: RequestHandler = async (request, response, next) => {
  try {
    const jobId = requestJobId(request);
    const elementId = typeof request.body?.elementId === "string" ? request.body.elementId : "";
    const value = typeof request.body?.value === "string" ? request.body.value.trim() : "";
    if (!jobId || !isValidObjectId(jobId)) {
      notFound(response, "Job not found");
      return;
    }
    if (!elementId || !value) {
      response.status(400).json({ success: false, message: "A field and a non-empty value are required" });
      return;
    }
    const context = await loadContext(jobId);
    if (!context.preparation || !context.candidate) {
      notFound(response, "Application preparation not found");
      return;
    }
    if (context.application?.status === "submitted") {
      response.status(409).json({ success: false, message: "Already submitted" });
      return;
    }
    const browserRun = browserRunOf(context.preparation);
    const fields = [...(browserRun.fields ?? [])];
    const index = fields.findIndex((field) => field.elementId === elementId);
    if (index < 0) {
      notFound(response, "Application field not found");
      return;
    }
    const current = fields[index]!;
    const session = browserSessions.get(jobId);
    if (!session) {
      response.status(409).json({ success: false, message: "BROWSER_SESSION_EXPIRED" });
      return;
    }
    let verified = false;
    try {
      const surface = await selectApplicationFrame(session.page);
      verified = await writeApplicationField(surface, current, value);
    } catch {
      verified = false;
    }
    const reviewStatus = verified ? "filled" : "requires_review";
    if (reviewStatus !== "filled") {
      response.status(409).json({
        success: false,
        message: "The browser did not accept this value",
        data: { sessionAvailable: true },
      });
      return;
    }
    fields[index] = { ...current, currentValue: value, source: "user", reviewStatus };
    await saveFields(
      context.preparation._id,
      { jobId: context.job?._id ?? jobId, candidateProfileId: context.candidate._id },
      fields,
      elementId,
      value,
    );
    response.json({ success: true, data: { field: fields[index], sessionAvailable: true } });
  } catch (error) {
    next(error);
  }
};

const persistRun = async (
  preparationId: unknown,
  browserRun: Record<string, unknown>,
  patch: Record<string, unknown>,
) => {
  await ApplicationPreparationModel.findByIdAndUpdate(preparationId, {
    $set: { browserRun: { ...browserRun, ...patch } },
  });
};

export const submitReviewedApplication: RequestHandler = async (request, response, next) => {
  try {
    const jobId = requestJobId(request);
    if (!jobId || !isValidObjectId(jobId)) {
      notFound(response, "Job not found");
      return;
    }
    if (request.body?.approved !== true) {
      response.status(400).json({ success: false, message: "Explicit approval is required" });
      return;
    }
    const context = await loadContext(jobId);
    if (!context.preparation || !context.candidate || !context.job) {
      notFound(response, "Application preparation not found");
      return;
    }
    const browserRun = browserRunOf(context.preparation);
    const session = browserSessions.get(jobId);
    const clicked = Boolean((context.application?.submission as { clicked?: boolean } | undefined)?.clicked);
    const blockers = submissionBlockers({
      applicationStatus: context.application?.status,
      browserStatus: browserRun.status,
      stopped: browserRun.stopped || session?.isStopped(),
      sessionAvailable: Boolean(session),
      submitting: session?.submitting,
      clicked,
      coverLetterStatus: (context.preparation.coverLetter as { status?: string } | undefined)?.status,
      missingInformation: context.preparation.missingInformation as string[] | undefined,
      fields: browserRun.fields,
    });
    if (blockers.length || !session) {
      response.status(409).json({ success: false, message: blockers[0] ?? "BROWSER_SESSION_EXPIRED", data: { blockers } });
      return;
    }
    session.submitting = true;
    try {
      if (session.isStopped()) {
        response.status(409).json({ success: false, message: "Browser run stopped by user" });
        return;
      }
      await persistRun(context.preparation._id, browserRun, { status: "SUBMITTING" });
      const attempt = await submissionRuntime.submit(session.page, {
        isStopped: () => session.isStopped(),
        fields: browserRun.fields ?? [],
        ...(browserRun.finalControl ? { expectedControl: browserRun.finalControl } : {}),
      });
      const applicationStatus = attempt.status === "SUBMITTED"
        ? "submitted"
        : attempt.status === "SUBMISSION_UNKNOWN"
          ? "submission_unknown"
          : attempt.status === "CANCELLED"
            ? "cancelled"
            : "submission_failed";
      await ApplicationModel.findOneAndUpdate(
        { jobId: context.job._id, candidateProfileId: context.candidate._id },
        {
          $set: {
            status: applicationStatus,
            applicationUrl: context.job.officialApplicationUrl,
            ...(attempt.status === "SUBMITTED" ? { appliedDate: new Date() } : {}),
            submission: { ...attempt, attemptedAt: new Date() },
            ...(attempt.status === "SUBMITTED" ? {} : { failure: attempt }),
          },
          $setOnInsert: { generatedAnswers: context.preparation.generatedAnswers ?? [], resumeUsed: {}, coverLetter: "", formFields: {} },
        },
        { upsert: true, new: true },
      );
      await persistRun(context.preparation._id, browserRun, {
        status: attempt.status,
        submission: attempt,
        reason: attempt.reason,
      });
      if (attempt.clicked || attempt.status === "SUBMITTED") {
        await browserSessions.release(jobId);
        activeRuns.delete(jobId);
      }
      response.json({ success: attempt.status === "SUBMITTED", data: { submission: attempt } });
    } finally {
      session.submitting = false;
    }
  } catch (error) {
    next(error);
  }
};

export const cancelReviewedApplication: RequestHandler = async (request, response, next) => {
  try {
    const jobId = requestJobId(request);
    if (!jobId || !isValidObjectId(jobId)) {
      notFound(response, "Job not found");
      return;
    }
    const context = await loadContext(jobId);
    if (!context.preparation || !context.candidate) {
      notFound(response, "Application preparation not found");
      return;
    }
    if (context.application?.status === "submitted") {
      response.status(409).json({ success: false, message: "Already submitted" });
      return;
    }
    const session = browserSessions.get(jobId);
    if (session?.submitting) {
      response.status(409).json({ success: false, message: "A submission is already in progress" });
      return;
    }
    session?.stop();
    await browserSessions.release(jobId);
    activeRuns.delete(jobId);
    const browserRun = browserRunOf(context.preparation);
    await persistRun(context.preparation._id, browserRun, {
      status: "CANCELLED",
      reason: "Cancelled before submission",
    });
    await ApplicationModel.findOneAndUpdate(
      { jobId: context.job?._id ?? jobId, candidateProfileId: context.candidate._id },
      {
        $set: { status: "cancelled" },
        $setOnInsert: { generatedAnswers: [], resumeUsed: {}, coverLetter: "", formFields: {} },
      },
      { upsert: true },
    );
    response.json({ success: true, data: { status: "CANCELLED" } });
  } catch (error) {
    next(error);
  }
};
