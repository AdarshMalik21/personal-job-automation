import type {
  FetchJobsOptions,
  FetchLike,
  JobSourceAdapter,
} from "../JobSourceAdapter.js";
import { requestJson } from "../http.js";
import { mapLeverJob, parseLeverResponse } from "./leverMapper.js";

const DEFAULT_API_BASE_URL = "https://api.lever.co/v0/postings";
const DEFAULT_TIMEOUT_MS = 10_000;

export type LeverAdapterOptions = {
  site: string;
  companyName: string;
  apiBaseUrl?: string;
  fetcher?: FetchLike;
};

export class LeverAdapter implements JobSourceAdapter {
  readonly source = "lever" as const;
  private readonly site: string;
  private readonly companyName: string;
  private readonly apiBaseUrl: string;
  private readonly fetcher: FetchLike;

  constructor(options: LeverAdapterOptions) {
    if (!options.site.trim()) throw new Error("Lever site is required");
    if (!options.companyName.trim())
      throw new Error("Lever companyName is required");
    this.site = options.site.trim();
    this.companyName = options.companyName.trim();
    this.apiBaseUrl = (options.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(
      /\/+$/,
      "",
    );
    this.fetcher = options.fetcher ?? fetch;
  }

  async fetchJobs(options: FetchJobsOptions = {}) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const url = `${this.apiBaseUrl}/${encodeURIComponent(this.site)}?mode=json`;
    try {
      const response = parseLeverResponse(
        await requestJson(this.fetcher, url, timeoutMs, options.signal),
      );
      return response.map((job) => mapLeverJob(job, this.companyName));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Lever fetch failed: ${message}`, { cause: error });
    }
  }
}
