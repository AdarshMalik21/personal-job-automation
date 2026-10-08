import { errorText } from "../../../config/redact.js";
import { ApplicationModel } from "../../../models/Application.js";
import { ApplicationPreparationModel } from "../../../models/ApplicationPreparation.js";
import { DailySelectionModel } from "../../../models/DailySelection.js";
import { JobModel } from "../../../models/Job.js";
import {
  createNotificationProvider,
  type DailyJobReport,
  type DailyReportJob,
  type NotificationProvider,
} from "../../notifications/notificationProvider.js";
import { DISCOVERY_TIMEZONE } from "../../../scheduler/discoverySchedule.js";
import { evaluateFreshness } from "../services/freshness.js";
import {
  rankDailyJobs,
  rankingReason,
  type DailyDecision,
  type DailyFreshness,
  type DailyLocationStatus,
  type RankableJob,
} from "./dailyRanking.js";

export type StoredDailySelection = {
  dateKey: string;
  jobs: DailyReportJob[];
  notificationStatus: "pending" | "sent" | "failed";
  notificationError?: string;
};

export type DailySelectionStore = {
  findByDate(dateKey: string): Promise<StoredDailySelection | null>;
  insert(selection: StoredDailySelection): Promise<StoredDailySelection>;
  replaceJobs(dateKey: string, jobs: DailyReportJob[]): Promise<void>;
  updateStatus(dateKey: string, status: "sent" | "failed", error?: string): Promise<void>;
};

export const dailyReportKey = (dateKey: string): string =>
  `daily-job-report:${dateKey}:${DISCOVERY_TIMEZONE}`;

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

const numberValue = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];

const decisionOf = (value: unknown): DailyDecision | undefined =>
  value === "APPLY" || value === "REVIEW" || value === "SKIP" ? value : undefined;

const locationOf = (value: unknown): DailyLocationStatus =>
  value === "compatible" || value === "incompatible" || value === "unknown" ? value : "unknown";

const reportJob = (job: RankableJob, rank: number): DailyReportJob => ({
  rank,
  jobId: job.id,
  title: job.title,
  company: job.company,
  ...(job.location ? { location: job.location } : {}),
  ...(job.remoteStatus ? { remoteStatus: job.remoteStatus } : {}),
  matchScore: job.matchScore,
  decision: job.decision === "REVIEW" ? "REVIEW" : "APPLY",
  reasons: job.reasons,
  missingRequirements: job.missingRequirements,
  freshness: job.freshness,
  ...(job.officialApplicationUrl ? { officialApplicationUrl: job.officialApplicationUrl } : {}),
  applicationStatus: job.applicationStatus,
  preparationAvailable: job.preparationAvailable,
  rankingReason: rankingReason(job),
});

export const toDailyReport = (dateKey: string, jobs: DailyReportJob[]): DailyJobReport => ({
  dateKey,
  timezone: DISCOVERY_TIMEZONE,
  jobs,
});

export const loadRankableJobs = async (now = new Date()): Promise<RankableJob[]> => {
  const jobs = await JobModel.find().lean();
  const ids = jobs.map((job) => job._id);
  const [applications, preparations] = await Promise.all([
    ApplicationModel.find({ jobId: { $in: ids } }).select("jobId status").lean(),
    ApplicationPreparationModel.find({ jobId: { $in: ids } }).select("jobId status").lean(),
  ]);
  const applicationStatus = new Map(applications.map((item) => [String(item.jobId), item.status]));
  const prepared = new Set(
    preparations
      .filter((item) => item.status && item.status !== "not_started")
      .map((item) => String(item.jobId)),
  );
  const rankable: RankableJob[] = [];
  for (const job of jobs) {
    const match = (job.match ?? {}) as Record<string, unknown>;
    const decision = decisionOf(match.decision);
    if (!decision) continue;
    const breakdown = (match.scoreBreakdown ?? {}) as Record<string, unknown>;
    const location = (match.locationAnalysis ?? {}) as Record<string, unknown>;
    const skills = (match.skillAnalysis ?? {}) as Record<string, unknown>;
    const freshness = evaluateFreshness(
      {
        ...(job.postedDate ? { postedDate: job.postedDate } : {}),
        ...(job.updatedDate ? { updatedDate: job.updatedDate } : {}),
      },
      { now },
    );
    const locationText = text(job.location);
    const remoteStatus = text(job.remoteStatus);
    const officialApplicationUrl = text(job.officialApplicationUrl);
    const hardFilterFailure = stringList(match.hardFilterFailures).length > 0;
    rankable.push({
      id: String(job._id),
      title: job.title,
      company: job.company,
      ...(locationText ? { location: locationText } : {}),
      ...(remoteStatus ? { remoteStatus } : {}),
      ...(officialApplicationUrl ? { officialApplicationUrl } : {}),
      matchScore: numberValue(match.matchScore ?? match.score),
      decision,
      reasons: stringList(match.reasons),
      missingRequirements: [
        ...stringList(skills.missingRequired),
        ...stringList(skills.missingPreferred),
        ...stringList(skills.unknown),
      ],
      freshness: freshness.status,
      roleRelevance: numberValue(breakdown.roleRelevance),
      requiredSkillCoverage: numberValue(breakdown.requiredSkillCoverage),
      locationStatus: locationOf(location.status),
      applicationStatus: applicationStatus.get(String(job._id)) ?? "not_applied",
      preparationAvailable: prepared.has(String(job._id)),
      ...(hardFilterFailure ? { hardFilterFailure } : {}),
    });
  }
  return rankable;
};

const fromDocument = (value: {
  dateKey: string;
  jobs?: unknown;
  notificationStatus?: string | null;
  notificationError?: string | null;
}): StoredDailySelection => {
  const notificationError = typeof value.notificationError === "string" ? value.notificationError : undefined;
  return {
    dateKey: value.dateKey,
    jobs: Array.isArray(value.jobs) ? value.jobs as DailyReportJob[] : [],
    notificationStatus: value.notificationStatus === "sent" || value.notificationStatus === "failed" ? value.notificationStatus : "pending",
    ...(notificationError ? { notificationError } : {}),
  };
};

export class MongooseDailySelectionStore implements DailySelectionStore {
  async findByDate(dateKey: string): Promise<StoredDailySelection | null> {
    const document = await DailySelectionModel.findOne({ dateKey }).lean();
    return document ? fromDocument(document) : null;
  }

  async insert(selection: StoredDailySelection): Promise<StoredDailySelection> {
    try {
      const document = await DailySelectionModel.create(selection);
      return fromDocument(document.toObject());
    } catch (error) {
      const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === 11000;
      if (!duplicate) throw error;
      const existing = await this.findByDate(selection.dateKey);
      if (existing) return existing;
      throw error;
    }
  }

  async replaceJobs(dateKey: string, jobs: DailyReportJob[]): Promise<void> {
    await DailySelectionModel.updateOne({ dateKey }, { $set: { jobs } });
  }

  async updateStatus(dateKey: string, status: "sent" | "failed", error?: string): Promise<void> {
    await DailySelectionModel.updateOne(
      { dateKey },
      {
        $set: {
          notificationStatus: status,
          ...(error ? { notificationError: error } : {}),
        },
        ...(error ? {} : { $unset: { notificationError: "" } }),
      },
    );
  }
}

export class MemoryDailySelectionStore implements DailySelectionStore {
  private readonly rows = new Map<string, StoredDailySelection>();

  async findByDate(dateKey: string): Promise<StoredDailySelection | null> {
    return this.rows.get(dateKey) ?? null;
  }

  async insert(selection: StoredDailySelection): Promise<StoredDailySelection> {
    const existing = this.rows.get(selection.dateKey);
    if (existing) return existing;
    this.rows.set(selection.dateKey, selection);
    return selection;
  }

  async replaceJobs(dateKey: string, jobs: DailyReportJob[]): Promise<void> {
    const existing = this.rows.get(dateKey);
    if (!existing) return;
    existing.jobs = jobs;
  }

  async updateStatus(dateKey: string, status: "sent" | "failed", error?: string): Promise<void> {
    const existing = this.rows.get(dateKey);
    if (!existing) return;
    existing.notificationStatus = status;
    if (error) existing.notificationError = error;
    else delete existing.notificationError;
  }
}

export const publishDailyReport = async (input: {
  dateKey: string;
  jobs: readonly RankableJob[];
  store: DailySelectionStore;
  notifier: NotificationProvider;
}): Promise<{ report: DailyJobReport; sent: boolean; duplicate: boolean }> => {
  const existing = await input.store.findByDate(input.dateKey);
  const ranked = rankDailyJobs(input.jobs).map((job, index) => reportJob(job, index + 1));
  const selection = existing ?? await input.store.insert({
    dateKey: input.dateKey,
    jobs: ranked,
    notificationStatus: "pending",
  });
  if (selection.notificationStatus === "sent") {
    const jobs = ranked.length > 0 || selection.jobs.length === 0 ? ranked : selection.jobs;
    if (jobs !== selection.jobs) await input.store.replaceJobs(input.dateKey, jobs);
    return { report: toDailyReport(input.dateKey, jobs), sent: false, duplicate: true };
  }
  await input.store.replaceJobs(input.dateKey, ranked);
  const report = toDailyReport(input.dateKey, ranked);
  try {
    await input.notifier.sendDailyJobReport(report);
    await input.store.updateStatus(input.dateKey, "sent");
    return { report, sent: true, duplicate: false };
  } catch (error) {
    await input.store.updateStatus(input.dateKey, "failed", errorText(error));
    throw error;
  }
};

export const runDailyReport = async (
  dateKey: string,
  dependencies: {
    loadJobs?: () => Promise<RankableJob[]>;
    store?: DailySelectionStore;
    notifier?: NotificationProvider;
  } = {},
): Promise<{ report: DailyJobReport; sent: boolean; duplicate: boolean }> => {
  const jobs = await (dependencies.loadJobs ?? loadRankableJobs)();
  return publishDailyReport({
    dateKey,
    jobs,
    store: dependencies.store ?? new MongooseDailySelectionStore(),
    notifier: dependencies.notifier ?? createNotificationProvider(),
  });
};
