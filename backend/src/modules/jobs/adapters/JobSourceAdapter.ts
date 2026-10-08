import type { JobSource } from "@personal-job-automation/shared/types";
import type { RawJobInput } from "../types/rawJob.js";

export type FetchJobsOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type SourceQueryFailure = {
  query: string;
  location: string;
  page: number;
  status?: number;
  retryable: boolean;
  message: string;
};

export type SourceFetchReport = {
  queriesAttempted: number;
  queriesSucceeded: number;
  queriesFailed: number;
  jobsFetched: number;
  requests: number;
  failures: SourceQueryFailure[];
};

export interface JobSourceAdapter {
  readonly source: JobSource;
  fetchJobs(options?: FetchJobsOptions): Promise<RawJobInput[]>;
  fetchReport?: SourceFetchReport | undefined;
}

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;
