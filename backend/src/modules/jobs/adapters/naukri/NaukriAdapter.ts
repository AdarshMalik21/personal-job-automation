import type { FetchJobsOptions, FetchLike, JobSourceAdapter } from "../JobSourceAdapter.js";
import type { RawJobInput } from "../../types/rawJob.js";
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

export class NaukriAdapter implements JobSourceAdapter {
  readonly source = "naukri" as const;
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
    let firstRequest = true;
    for (const keyword of this.config.queries) {
      for (const location of this.config.locations) {
        if (!firstRequest && this.config.delayMs > 0) await this.pause(this.config.delayMs);
        firstRequest = false;
        console.info(`Naukri fetch started query="${keyword}" location="${location}"`);
        let collected = 0;
        let pages = 0;
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
            const status = error instanceof NaukriSourceError ? error.statusCode : undefined;
            console.error(`Naukri fetch failed status=${status ?? "error"} query="${keyword}" location="${location}"`);
            throw error;
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
        console.info(`Naukri pagination completed pages=${pages} jobs=${collected}`);
        console.info(`Naukri fetch completed query="${keyword}" jobs=${collected}`);
      }
    }
    return this.attachApplicationUrls([...jobs.values()], options.timeoutMs ?? this.config.timeoutMs);
  }

  private async attachApplicationUrls(
    jobs: Array<{ raw: RawJobInput; record: NaukriJobRecord }>,
    timeoutMs: number,
  ): Promise<RawJobInput[]> {
    const prioritized = [...jobs].sort((left, right) => Number(right.record.companyApplyJob === true) - Number(left.record.companyApplyJob === true));
    let resolved = 0;
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
        if (!listing || item.record.companyApplyJob === false || resolved >= limit) {
          item.raw.analysis = {
            ...(item.raw.analysis ?? {}),
            applicationUrlType: item.record.companyApplyJob === false ? "NAUKRI_INTERNAL" : item.raw.analysis?.applicationUrlType ?? "UNKNOWN_EXTERNAL",
          };
          if (item.record.companyApplyJob === false) {
            console.info(`Naukri internal application jobId=${item.raw.externalJobId}`);
          }
          continue;
        }
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
    return prioritized.map((item) => item.raw);
  }
}
