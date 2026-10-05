import type { JobSource } from "@personal-job-automation/shared/types";
import type { RawJobInput } from "../types/rawJob.js";

export type FetchJobsOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

export interface JobSourceAdapter {
  readonly source: JobSource;
  fetchJobs(options?: FetchJobsOptions): Promise<RawJobInput[]>;
}

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;