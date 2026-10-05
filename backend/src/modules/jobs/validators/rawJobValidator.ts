import type { JobSource } from "@personal-job-automation/shared/types";
import type { RawJobInput } from "../types/rawJob.js";
import { SUPPORTED_JOB_SOURCES } from "../types/jobSource.js";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export function validateRawJobInput(value: unknown): asserts value is RawJobInput {
  if (!value || typeof value !== "object") throw new Error("Raw job input must be an object");
  const input = value as Record<string, unknown>;
  if (!isNonEmptyString(input.title)) throw new Error("Raw job title is required");
  if (!isNonEmptyString(input.company)) throw new Error("Raw job company is required");
  if (!SUPPORTED_JOB_SOURCES.includes(input.source as JobSource)) {
    throw new Error("Raw job source is unsupported");
  }
  for (const field of ["requiredSkills", "preferredSkills", "relatedSkills"]) {
    if (input[field] !== undefined && (!Array.isArray(input[field]) || !input[field].every(isNonEmptyString))) {
      throw new Error(`Raw job ${field} must be an array of strings`);
    }
  }
  if (input.postedDate !== undefined && !(input.postedDate instanceof Date) && !isNonEmptyString(input.postedDate)) {
    throw new Error("Raw job postedDate must be a date or date string");
  }
}