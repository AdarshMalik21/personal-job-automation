import type { FetchJobsOptions, FetchLike, JobSourceAdapter, SourceFetchReport, SourceQueryFailure } from "../JobSourceAdapter.js";
import type { RawJobInput } from "../../types/rawJob.js";
import { evaluateFreshness } from "../../services/freshness.js";
import { resolveApplicationDestination } from "./applicationUrl.js";
import { NaukriClient } from "./NaukriClient.js";
import { readNaukriConfig, type NaukriConfig } from "./naukriConfig.js";
import { mapNaukriJob } from "./NaukriMapper.js";
import { NaukriSourceError, type NaukriJobRecord } from "./NaukriTypes.js";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const domainOf = (url: string | undefined): string => {
  if (!url) return "none";
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid";
  }
};

const failureStatuses = (failures: SourceQueryFailure[]): string => {
  const counts = new Map<string, number>();
  for (const failure of failures) {
    const key = failure.status === undefined ? "none" : String(failure.status);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([status, count]) => `${status}:${count}`).join(",") || "none";
};

export class NaukriAdapter implements JobSourceAdapter {
  readonly source = "naukri" as const;
  fetchReport: SourceFetchReport | undefined;
  private readonly config: NaukriConfig;
  private readonly client: NaukriClient;
  private readonly fetcher: FetchLike;
  private readonly pause: (ms: number) => Promise<void>;

  constructor(options: {
    config?: NaukriConfig;
    fetcher?: FetchLike;
    client?: NaukriClient;
    delay?: (ms: number) => Promise<void>;
  } = {}) {
    this.config = options.config ?? readNaukriConfig();
    this.fetcher = options.fetcher ?? fetch;
    this.client = options.client ?? new NaukriClient(this.fetcher);
    this.pause = options.delay ?? wait;
  }

  async fetchJobs(options: FetchJobsOptions = {}): Promise<RawJobInput[]> {
    const jobs = new Map<string, { raw: RawJobInput; record: NaukriJobRecord }>();
    const failures: SourceQueryFailure[] = [];
    let queriesAttempted = 0;
    let queriesSucceeded = 0;
    let firstRequest = true;
    for (const keyword of this.config.queries) {
      for (const location of this.config.locations) {
        if (!firstRequest && this.config.delayMs > 0) await this.pause(this.config.delayMs);
        firstRequest = false;
        queriesAttempted += 1;
        let collected = 0;
        let pages = 0;
        let failed = false;
        for (let pageNo = 1; pageNo <= this.config.maxPages && collected < this.config.maxJobsPerQuery; pageNo += 1) {
          if (pageNo > 1 && this.config.delayMs > 0) await this.pause(this.config.delayMs);
          let records: NaukriJobRecord[];
          try {
            records = await this.client.search({
              keyword,
              location,
              pageNo,
              pageSize: Math.min(this.config.pageSize, this.config.maxJobsPerQuery - collected),
              experienceYears: this.config.experienceYears,
              jobAgeDays: this.config.jobAgeDays,
              timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
              maxRetries: this.config.maxRetries,
              ...(options.signal ? { signal: options.signal } : {}),
            });
          } catch (error) {
            if (!(error instanceof NaukriSourceError)) throw error;
            if (!error.retryable && error.statusCode === undefined && !/malformed/i.test(error.message)) throw error;
            const failure: SourceQueryFailure = {
              query: keyword,
              location,
              page: pageNo,
              retryable: error.retryable,
              message: error.message,
              ...(error.statusCode !== undefined ? { status: error.statusCode } : {}),
            };
            failures.push(failure);
            failed = true;
            console.error(`Naukri query failed query="${keyword}" location="${location}" page=${pageNo} status=${error.statusCode ?? "error"} retryable=${error.retryable}`);
            break;
          }
          pages += 1;
          console.info(`Naukri page fetched page=${pageNo} jobs=${records.length}`);
          if (records.length === 0) break;
          for (const record of records) {
            const mapped = mapNaukriJob(record);
            if (!mapped?.externalJobId || jobs.has(mapped.externalJobId)) continue;
            jobs.set(mapped.externalJobId, { raw: mapped, record });
            collected += 1;
            if (collected >= this.config.maxJobsPerQuery) break;
          }
        }
        if (!failed) {
          queriesSucceeded += 1;
          console.info(`Naukri query completed query="${keyword}" location="${location}" pages=${pages} jobs=${collected}`);
        }
      }
    }
    const report: SourceFetchReport = {
      queriesAttempted,
      queriesSucceeded,
      queriesFailed: failures.length,
      jobsFetched: jobs.size,
      requests: this.client.httpRequests,
      failures,
    };
    this.fetchReport = report;
    console.info(`Naukri discovery completed queriesAttempted=${queriesAttempted} queriesSucceeded=${queriesSucceeded} queriesFailed=${failures.length} jobsFetched=${jobs.size} requests=${report.requests} failureStatuses=${failureStatuses(failures)}`);
    const blocking = failures.find((failure) => failure.retryable);
    if (jobs.size === 0 && queriesSucceeded === 0 && blocking) {
      throw new NaukriSourceError(
        `Naukri fetch failed status=${blocking.status ?? "error"} query="${blocking.query}" location="${blocking.location}"`,
        blocking.status,
        true,
      );
    }
    return this.attachApplicationUrls([...jobs.values()], options.timeoutMs ?? this.config.timeoutMs);
  }

  private async attachApplicationUrls(
    jobs: Array<{ raw: RawJobInput; record: NaukriJobRecord }>,
    timeoutMs: number,
  ): Promise<RawJobInput[]> {
    const prioritized = [...jobs].sort((left, right) => Number(right.record.companyApplyJob === true) - Number(left.record.companyApplyJob === true));
    let resolved = 0;
    let skippedStale = 0;
    const limit = this.config.maxUrlResolutions;
    const concurrency = this.config.urlConcurrency;
    let cursor = 0;
    const worker = async () => {
      while (cursor < prioritized.length) {
        const index = cursor;
        cursor += 1;
        const item = prioritized[index];
        if (!item) return;
        const listing = item.raw.sourceUrl;
        if (!listing || item.record.companyApplyJob === false) {
          item.raw.analysis = {
            ...(item.raw.analysis ?? {}),
            applicationUrlType: item.record.companyApplyJob === false ? "NAUKRI_INTERNAL" : item.raw.analysis?.applicationUrlType ?? "UNKNOWN_EXTERNAL",
          };
          if (item.record.companyApplyJob === false) {
            console.info(`Naukri internal application jobId=${item.raw.externalJobId}`);
          }
          continue;
        }
        const postedDate = item.raw.postedDate;
        if (evaluateFreshness(postedDate ? { postedDate } : {}).status === "stale") {
          skippedStale += 1;
          continue;
        }
        if (resolved >= limit) continue;
        resolved += 1;
        const result = await resolveApplicationDestination(listing, { fetcher: this.fetcher, timeoutMs });
        item.raw.analysis = { ...(item.raw.analysis ?? {}), applicationUrlType: result.type };
        if (result.finalUrl && result.type !== "NAUKRI_INTERNAL" && result.type !== "UNKNOWN_EXTERNAL") {
          item.raw.officialApplicationUrl = result.finalUrl;
        }
        console.info(`Naukri application URL resolved jobId=${item.raw.externalJobId} finalDomain=${domainOf(result.finalUrl ?? listing)}`);
        console.info(`Naukri application URL classified jobId=${item.raw.externalJobId} type=${result.type}`);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, prioritized.length) }, () => worker()));
    console.info(`Naukri URL resolution completed resolved=${resolved} skippedStale=${skippedStale}`);
    return prioritized.map((item) => item.raw);
  }
}
