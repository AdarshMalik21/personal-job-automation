import type {
  FetchJobsOptions,
  FetchLike,
  JobSourceAdapter,
} from "../JobSourceAdapter.js";
import { requestJson } from "../http.js";
import { mapAshbyJob, parseAshbyResponse } from "./ashbyMapper.js";

const DEFAULT_API_BASE_URL = "https://api.ashbyhq.com/posting-api/job-board";
const DEFAULT_TIMEOUT_MS = 10_000;

export type AshbyAdapterOptions = {
  boardName: string;
  companyName: string;
  apiBaseUrl?: string;
  fetcher?: FetchLike;
};

export class AshbyAdapter implements JobSourceAdapter {
  readonly source = "ashby" as const;
  private readonly boardName: string;
  private readonly companyName: string;
  private readonly apiBaseUrl: string;
  private readonly fetcher: FetchLike;

  constructor(options: AshbyAdapterOptions) {
    if (!options.boardName.trim()) throw new Error("Ashby boardName is required");
    if (!options.companyName.trim())
      throw new Error("Ashby companyName is required");
    this.boardName = options.boardName.trim();
    this.companyName = options.companyName.trim();
    this.apiBaseUrl = (options.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(
      /\/+$/,
      "",
    );
    this.fetcher = options.fetcher ?? fetch;
  }

  async fetchJobs(options: FetchJobsOptions = {}) {
    try {
      const response = parseAshbyResponse(
        await requestJson(
          this.fetcher,
          `${this.apiBaseUrl}/${encodeURIComponent(this.boardName)}`,
          options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          options.signal,
        ),
      );
      return response.map((job) => mapAshbyJob(job, this.companyName));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Ashby fetch failed: ${message}`, { cause: error });
    }
  }
}
