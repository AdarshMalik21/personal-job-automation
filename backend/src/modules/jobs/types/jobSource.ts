import type { JobSource } from "@personal-job-automation/shared/types";

export const SUPPORTED_JOB_SOURCES = [
  "company",
  "greenhouse",
  "lever",
  "ashby",
  "linkedin",
  "naukri",
  "indeed",
  "wellfound",
  "other",
] as const satisfies readonly JobSource[];