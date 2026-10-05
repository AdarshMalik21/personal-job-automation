import type {
  FetchJobsOptions,
  FetchLike,
  JobSourceAdapter,
} from "../JobSourceAdapter.js";
import { mapGreenhouseJob, parseGreenhouseBoardResponse, parseGreenhouseJobsResponse } from "./greenhouseMapper.js";

const DEFAULT_API_BASE_URL = "https://boards-api.greenhouse.io/v1";
const DEFAULT_TIMEOUT_MS = 10_000;

export type GreenhouseAdapterOptions = {
  boardToken: string;
  apiBaseUrl?: string;
  companyName?: string;
  fetcher?: FetchLike;
};

export class GreenhouseAdapter implements JobSourceAdapter {
  readonly source = "greenhouse" as const;

  private readonly boardToken: string;
  private readonly apiBaseUrl: string;
  private readonly companyName: string | undefined;
  private readonly fetcher: FetchLike;

  constructor(options: GreenhouseAdapterOptions) {
    if (!options.boardToken.trim()) {
      throw new Error("Greenhouse boardToken is required");
    }
    this.boardToken = options.boardToken.trim();
    this.apiBaseUrl = (options.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
    this.companyName = options.companyName?.trim() || undefined;
    this.fetcher = options.fetcher ?? fetch;
  }

  async fetchJobs(options: FetchJobsOptions = {}): Promise<ReturnType<JobSourceAdapter["fetchJobs"]> extends Promise<infer Jobs> ? Jobs : never> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const jobsUrl = `${this.apiBaseUrl}/boards/${encodeURIComponent(this.boardToken)}/jobs?content=true`;
    const boardUrl = `${this.apiBaseUrl}/boards/${encodeURIComponent(this.boardToken)}`;
    console.info(`Greenhouse fetch started for board ${this.boardToken}`);

    try {
      const boardResponse = this.companyName
        ? undefined
        : await this.requestJson(boardUrl, timeoutMs, options.signal);
      const jobsResponse = await this.requestJson(jobsUrl, timeoutMs, options.signal);
      const company = this.companyName ?? parseGreenhouseBoardResponse(boardResponse).name;
      const jobs = parseGreenhouseJobsResponse(jobsResponse).jobs.map((job) =>
        mapGreenhouseJob(job, company),
      );
      console.info(`Greenhouse fetch completed for board ${this.boardToken}: ${jobs.length} jobs`);
      return jobs;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`Greenhouse fetch failed for board ${this.boardToken}: ${message}`);
      throw new Error(`Greenhouse fetch failed: ${message}`, { cause: error });
    }
  }

  private async requestJson(
    url: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener("abort", abortFromCaller, { once: true });

    try {
      const response = await this.fetcher(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      try {
        return await response.json();
      } catch {
        throw new Error("response JSON is malformed");
      }
    } catch (error) {
      if (timedOut) throw new Error(`request timed out after ${timeoutMs}ms`);
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}