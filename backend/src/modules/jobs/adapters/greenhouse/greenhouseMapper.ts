import type { RawJobInput } from "../../types/rawJob.js";
import type {
  GreenhouseBoardResponse,
  GreenhouseJob,
  GreenhouseJobsResponse,
} from "./greenhouseTypes.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const hasNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isGreenhouseJob = (value: unknown): value is GreenhouseJob =>
  isRecord(value) &&
  typeof value.id === "number" &&
  Number.isInteger(value.id) &&
  hasNonEmptyString(value.title);

export const parseGreenhouseBoardResponse = (
  value: unknown,
): GreenhouseBoardResponse => {
  if (!isRecord(value) || !hasNonEmptyString(value.name)) {
    throw new Error("Greenhouse board response is malformed");
  }
  return { name: value.name };
};

export const parseGreenhouseJobsResponse = (
  value: unknown,
): GreenhouseJobsResponse => {
  if (!isRecord(value) || !Array.isArray(value.jobs)) {
    throw new Error("Greenhouse jobs response is malformed");
  }
  if (!value.jobs.every(isGreenhouseJob)) {
    throw new Error("Greenhouse jobs response contains an invalid job");
  }
  return { jobs: value.jobs };
};

export const mapGreenhouseJob = (
  job: GreenhouseJob,
  company: string,
): RawJobInput => ({
  source: "greenhouse",
  externalJobId: String(job.id),
  title: job.title,
  company,
  ...(job.content !== undefined ? { description: job.content } : {}),
  ...(job.location?.name ? { location: job.location.name } : {}),
  ...(job.absolute_url
    ? {
        sourceUrl: job.absolute_url,
        officialApplicationUrl: job.absolute_url,
      }
    : {}),
  ...(job.first_published ? { postedDate: job.first_published } : {}),
  ...(job.updated_at ? { updatedDate: job.updated_at } : {}),
});
