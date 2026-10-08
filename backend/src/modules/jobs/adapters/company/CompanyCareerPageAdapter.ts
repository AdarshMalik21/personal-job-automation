import type {
  FetchJobsOptions,
  FetchLike,
  JobSourceAdapter,
} from "../JobSourceAdapter.js";
import { requestJson } from "../http.js";
import type { RawJobInput } from "../../types/rawJob.js";

const DEFAULT_TIMEOUT_MS = 10_000;

export type CompanyCareerPageParser = (
  response: unknown,
  config: CompanyCareerPageConfig,
) => RawJobInput[];

export type CompanyCareerPageConfig = {
  companyName: string;
  endpoint: string;
  parser: CompanyCareerPageParser;
};

export type CompanyCareerPageAdapterOptions = CompanyCareerPageConfig & {
  fetcher?: FetchLike;
};

/**
 * A deliberately non-crawling adapter. Each company supplies a parser for its
 * known response shape while the request and ingestion contract stay shared.
 */
export class CompanyCareerPageAdapter implements JobSourceAdapter {
  readonly source = "company" as const;
  private readonly config: CompanyCareerPageConfig;
  private readonly fetcher: FetchLike;

  constructor(options: CompanyCareerPageAdapterOptions) {
    if (!options.companyName.trim())
      throw new Error("Company career page companyName is required");
    if (!options.endpoint.trim())
      throw new Error("Company career page endpoint is required");
    this.config = {
      companyName: options.companyName.trim(),
      endpoint: options.endpoint,
      parser: options.parser,
    };
    this.fetcher = options.fetcher ?? fetch;
  }

  async fetchJobs(options: FetchJobsOptions = {}): Promise<RawJobInput[]> {
    try {
      const response = await requestJson(
        this.fetcher,
        this.config.endpoint,
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        options.signal,
      );
      return this.config.parser(response, this.config).map((job) => (
        job.officialApplicationUrl
          ? { ...job, analysis: { ...(job.analysis ?? {}), applicationUrlType: "COMPANY_CAREER_PAGE" } }
          : job
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(
        `Company career page fetch failed for ${this.config.companyName}: ${message}`,
        { cause: error },
      );
    }
  }
}
