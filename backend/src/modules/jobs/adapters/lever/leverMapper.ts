import type { RawJobInput } from "../../types/rawJob.js";
import type { LeverJob } from "./leverTypes.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const isLeverJob = (value: unknown): value is LeverJob =>
  isRecord(value) && nonEmpty(value.id) && nonEmpty(value.text);
const dateFromMilliseconds = (value: number | undefined): string | undefined => {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

export const parseLeverResponse = (value: unknown): LeverJob[] => {
  if (!Array.isArray(value)) throw new Error("Lever response is malformed");
  return value.filter(isLeverJob);
};

export const mapLeverJob = (job: LeverJob, company: string): RawJobInput => {
  const applicationUrl = job.applyUrl ?? job.hostedUrl;
  const postedDate = dateFromMilliseconds(job.createdAt);
  const updatedDate = dateFromMilliseconds(job.updatedAt);
  return {
    source: "lever",
    externalJobId: job.id,
    title: job.text,
    company,
    ...(job.descriptionPlain ?? job.description
      ? { description: job.descriptionPlain ?? job.description }
      : {}),
    ...(job.categories?.location ? { location: job.categories.location } : {}),
    ...(job.workplaceType ? { remoteStatus: job.workplaceType } : {}),
    ...(job.categories?.commitment
      ? { employmentType: job.categories.commitment }
      : {}),
    ...(job.hostedUrl ? { sourceUrl: job.hostedUrl } : {}),
    ...(applicationUrl ? { officialApplicationUrl: applicationUrl } : {}),
    ...(postedDate ? { postedDate } : {}),
    ...(updatedDate ? { updatedDate } : {}),
  };
};
