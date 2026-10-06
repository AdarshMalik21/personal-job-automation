export const FOLLOW_UP_AFTER_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export const USER_TRACKING_STATUSES = [
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "follow_up_required",
] as const;

export type UserTrackingStatus = (typeof USER_TRACKING_STATUSES)[number];

export type HistoryEvent = {
  type: string;
  timestamp: Date;
  previousStatus?: string;
  newStatus?: string;
  note?: string;
  source: "system" | "user";
};

export type FollowUpDraft = {
  subject: string;
  body: string;
  missingInformation: string[];
};

export type FollowUpRecord = {
  eligible?: boolean;
  eligibleAt?: Date | string;
  status?: "none" | "required" | "prepared" | "needs_information";
  reason?: string;
  draft?: FollowUpDraft;
  preparedAt?: Date | string;
};

export type TrackedApplication = {
  _id?: unknown;
  status?: string;
  appliedDate?: Date | string;
  updatedAt?: Date | string;
  history?: HistoryEvent[];
  followUp?: FollowUpRecord;
  submission?: { attemptedAt?: Date | string; clicked?: boolean };
};

const historyTypeForStatus: Record<string, string> = {
  submitted: "Application submitted",
  interview: "Interview received",
  offer: "Offer received",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  follow_up_required: "Follow-up required",
};

const blockedFollowUpReason: Record<string, string> = {
  rejected: "Application was rejected",
  withdrawn: "Application was withdrawn",
  offer: "Application has an offer",
  interview: "Application is in interview",
  cancelled: "Application was cancelled",
  submission_failed: "Submission failed",
  submission_unknown: "Submission was not confirmed",
  submitting: "Submission is in progress",
};

export const isUserTrackingStatus = (status: string): status is UserTrackingStatus =>
  (USER_TRACKING_STATUSES as readonly string[]).includes(status);

export const historyTypeFor = (status: string): string =>
  historyTypeForStatus[status] ?? "Status changed";

export const submissionHistoryEvent = (input: {
  applicationStatus: string;
  previousStatus?: string;
  reason?: string;
  at: Date;
}): HistoryEvent => ({
  type: input.applicationStatus === "submitted" ? "Application submitted" : "Status changed",
  timestamp: input.at,
  newStatus: input.applicationStatus,
  source: "system",
  ...(input.previousStatus ? { previousStatus: input.previousStatus } : {}),
  ...(input.reason ? { note: input.reason } : {}),
});

export const statusChangeEvent = (input: {
  previousStatus?: string;
  status: string;
  note?: string;
  at: Date;
  source: "system" | "user";
}): HistoryEvent => ({
  type: historyTypeFor(input.status),
  timestamp: input.at,
  newStatus: input.status,
  source: input.source,
  ...(input.previousStatus ? { previousStatus: input.previousStatus } : {}),
  ...(input.note ? { note: input.note } : {}),
});

const timeOf = (value: Date | string | undefined): number | undefined => {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : undefined;
};

export const submissionTime = (application: TrackedApplication): Date | undefined => {
  const applied = timeOf(application.appliedDate);
  const attempted = timeOf(application.submission?.attemptedAt);
  const time = applied ?? attempted;
  return time === undefined ? undefined : new Date(time);
};

export const lastMeaningfulUpdate = (application: TrackedApplication): Date | undefined => {
  const times = [
    ...(application.history ?? []).flatMap((event) => {
      const time = event.newStatus ? timeOf(event.timestamp) : undefined;
      return time === undefined ? [] : [time];
    }),
    ...(() => {
      const submitted = timeOf(application.appliedDate) ?? timeOf(application.submission?.attemptedAt);
      return submitted === undefined ? [] : [submitted];
    })(),
  ];
  if (times.length === 0) return undefined;
  return new Date(Math.max(...times));
};

export const followUpDecision = (
  application: TrackedApplication,
  now = new Date(),
): { eligible: boolean; reason: string } => {
  if (application.status === "follow_up_required") {
    return { eligible: true, reason: "Follow-up is required" };
  }
  if (application.status !== "submitted") {
    return {
      eligible: false,
      reason: blockedFollowUpReason[application.status ?? ""] ?? "Application has not been submitted",
    };
  }
  if (application.followUp?.eligible || (application.history ?? []).some((event) => event.type === "Follow-up required")) {
    return { eligible: false, reason: "Follow-up was already recorded" };
  }
  const reference = lastMeaningfulUpdate(application);
  if (!reference) return { eligible: false, reason: "Submission date is unavailable" };
  if (now.getTime() - reference.getTime() < FOLLOW_UP_AFTER_DAYS * DAY_MS) {
    const submitted = submissionTime(application);
    const laterUpdate = submitted !== undefined && reference.getTime() > submitted.getTime();
    return {
      eligible: false,
      reason: laterUpdate
        ? "A status update was recorded less than 5 days ago"
        : "Application was submitted less than 5 days ago",
    };
  }
  return { eligible: true, reason: "No status update for 5 days" };
};

export type FollowUpPlan = {
  id: unknown;
  eligibleAt: Date;
  event: HistoryEvent;
};

export const planFollowUps = (applications: TrackedApplication[], now = new Date()): FollowUpPlan[] =>
  applications.flatMap((application) => {
    if (application.status !== "submitted") return [];
    const decision = followUpDecision(application, now);
    if (!decision.eligible) return [];
    return [{
      id: application._id,
      eligibleAt: now,
      event: statusChangeEvent({
        previousStatus: "submitted",
        status: "follow_up_required",
        note: decision.reason,
        at: now,
        source: "system",
      }),
    }];
  });

const formatDate = (value: Date | string | undefined): string => {
  const time = timeOf(value);
  if (time === undefined) return "an earlier date";
  return new Date(time).toISOString().slice(0, 10);
};

export const buildFollowUpDraft = (input: {
  jobTitle: string;
  company: string;
  appliedDate?: Date | string;
  firstName?: string;
  lastName?: string;
  email?: string;
}): FollowUpDraft & { status: "prepared" | "needs_information" } => {
  const name = [input.firstName, input.lastName].filter((part) => part && part.trim()).join(" ").trim();
  const missingInformation = [
    ...(!name ? ["Candidate name"] : []),
    ...(!input.email?.trim() ? ["Candidate email"] : []),
  ];
  const body = [
    "Hello,",
    "",
    `I am following up regarding my application for ${input.jobTitle} at ${input.company}, submitted on ${formatDate(input.appliedDate)}.`,
    "",
    "I remain interested in the opportunity and wanted to check whether there have been any updates regarding the application process.",
    "",
    "Thank you for your time.",
    "",
    name ? `Regards,\n${name}` : "Regards,",
  ].join("\n");
  return {
    subject: `Following up on my application for ${input.jobTitle}`,
    body,
    missingInformation,
    status: missingInformation.length ? "needs_information" : "prepared",
  };
};

export const applicationAnalytics = (statuses: string[]) => {
  const count = (status: string) => statuses.filter((item) => item === status).length;
  const submitted = count("submitted");
  const interviews = count("interview");
  const offers = count("offer");
  const rejected = count("rejected");
  const withdrawn = count("withdrawn");
  const followUpsRequired = count("follow_up_required");
  const successfullySubmitted = submitted + interviews + offers + rejected + withdrawn + followUpsRequired;
  const rate = (part: number) => (successfullySubmitted === 0 ? 0 : part / successfullySubmitted);
  return {
    totalApplications: statuses.length,
    submitted,
    interviews,
    offers,
    rejected,
    withdrawn,
    followUpsRequired,
    successfullySubmitted,
    interviewRate: rate(interviews),
    offerRate: rate(offers),
    rejectionRate: rate(rejected),
  };
};

export const trackingSummary = (application: TrackedApplication) => {
  const historyTimes = (application.history ?? []).flatMap((event) => {
    const time = timeOf(event.timestamp);
    return time === undefined ? [] : [time];
  });
  const updated = timeOf(application.updatedAt);
  const last = historyTimes.length ? Math.max(...historyTimes) : updated;
  return {
    status: application.status,
    ...(application.appliedDate ? { appliedDate: application.appliedDate } : {}),
    ...(last !== undefined ? { lastStatusUpdate: new Date(last) } : {}),
    followUpStatus: application.followUp?.status ?? "none",
  };
};
