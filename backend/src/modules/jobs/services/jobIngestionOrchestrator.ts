import type { Job, JobSource } from "@personal-job-automation/shared/types";
import type { JobSourceAdapter } from "../adapters/JobSourceAdapter.js";
import { normalizeJob } from "./jobNormalizer.js";
import { deduplicateJobs, type DeduplicatedJob } from "./deduplicateJobs.js";
import {
  deriveOpenStatus,
  validateApplicationUrl,
  type OpenStatus,
  type UrlFetcher,
  type UrlValidationResult,
} from "./applicationStatus.js";
import {
  evaluateFreshness,
  type FreshnessResult,
  type FreshnessStatus,
} from "./freshness.js";

export type SourceIngestionResult = {
  source: JobSource;
  status: "success" | "failed";
  fetched: number;
  error?: string;
};

export type IngestedJob = DeduplicatedJob & {
  freshness: FreshnessResult;
  urlValidation: UrlValidationResult;
  openStatus: OpenStatus;
};

export type JobIngestionResult = {
  jobs: IngestedJob[];
  sources: SourceIngestionResult[];
  stats: {
    totalFetched: number;
    totalValid: number;
    totalInvalid: number;
    totalNormalized: number;
    totalDuplicates: number;
    totalFresh: number;
    totalStale: number;
    totalUnknownFreshness: number;
    totalOpen: number;
    totalClosed: number;
    totalUnknownStatus: number;
  };
};

export type JobIngestionOptions = {
  now?: Date;
  freshWithinDays?: number;
  validateApplicationUrls?: boolean;
  urlFetcher?: UrlFetcher;
  urlTimeoutMs?: number;
};

export class JobSourceOrchestrator {
  constructor(private readonly adapters: JobSourceAdapter[]) {}

  async ingest(options: JobIngestionOptions = {}): Promise<JobIngestionResult> {
    console.info(`Starting job ingestion for ${this.adapters.length} source(s)`);
    const fetchedJobs: Array<{ source: JobSource; jobs: Awaited<ReturnType<JobSourceAdapter["fetchJobs"]>> }> = [];
    const sources: SourceIngestionResult[] = [];

    for (const adapter of this.adapters) {
      try {
        const jobs = await adapter.fetchJobs();
        fetchedJobs.push({ source: adapter.source, jobs });
        sources.push({ source: adapter.source, status: "success", fetched: jobs.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown source failure";
        sources.push({ source: adapter.source, status: "failed", fetched: 0, error: message });
      }
    }

    const rawJobs = fetchedJobs.flatMap((result) => result.jobs);
    const normalized: Job[] = [];
    let invalid = 0;
    for (const rawJob of rawJobs) {
      try {
        normalized.push(normalizeJob(rawJob));
      } catch {
        invalid += 1;
      }
    }
    const deduplication = deduplicateJobs(normalized);
    const urlCache = new Map<string, Promise<UrlValidationResult>>();
    const jobs = await Promise.all(
      deduplication.jobs.map(async (deduplicated) => {
        const url = deduplicated.job.officialApplicationUrl;
        const cacheKey = url ?? "";
        let urlValidation: Promise<UrlValidationResult>;
        if (!options.validateApplicationUrls || !url) {
          urlValidation = Promise.resolve({ status: "unknown", reason: "URL validation was not requested" });
        } else if (!urlCache.has(cacheKey)) {
          const result = validateApplicationUrl(url, {
            ...(options.urlFetcher ? { fetcher: options.urlFetcher } : {}),
            ...(options.urlTimeoutMs !== undefined
              ? { timeoutMs: options.urlTimeoutMs }
              : {}),
          });
          urlCache.set(cacheKey, result);
          urlValidation = result;
        } else {
          urlValidation = urlCache.get(cacheKey)!;
        }
        const validation = await urlValidation;
        return {
          ...deduplicated,
          freshness: evaluateFreshness(deduplicated.job, options),
          urlValidation: validation,
          openStatus: deriveOpenStatus(validation),
        };
      }),
    );

    const countFreshness = (status: FreshnessStatus) => jobs.filter((job) => job.freshness.status === status).length;
    const countOpen = (status: OpenStatus) => jobs.filter((job) => job.openStatus === status).length;
    console.info(`Ingestion completed: ${jobs.length} clean job(s), ${deduplication.duplicatesRemoved} duplicate(s) removed`);
    return {
      jobs,
      sources,
      stats: {
        totalFetched: rawJobs.length,
        totalValid: normalized.length,
        totalInvalid: invalid,
        totalNormalized: normalized.length,
        totalDuplicates: deduplication.duplicatesRemoved,
        totalFresh: countFreshness("fresh"),
        totalStale: countFreshness("stale"),
        totalUnknownFreshness: countFreshness("unknown"),
        totalOpen: countOpen("open"),
        totalClosed: countOpen("closed"),
        totalUnknownStatus: countOpen("unknown"),
      },
    };
  }
}