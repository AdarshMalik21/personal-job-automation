import type { RawJobInput } from "../../types/rawJob.js";
import type { AshbyJob } from "./ashbyTypes.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const isAshbyJob = (value: unknown): value is AshbyJob =>
  isRecord(value) && nonEmpty(value.id) && nonEmpty(value.title);

export const parseAshbyResponse = (value: unknown): AshbyJob[] => {
  if (!isRecord(value) || !Array.isArray(value.jobs))
    throw new Error("Ashby response is malformed");
  return value.jobs.filter(isAshbyJob);
};

export const mapAshbyJob = (
  job: AshbyJob,
  configuredCompany: string,
): RawJobInput => {
  const applicationUrl = job.applyUrl ?? job.jobUrl;
  return {
    source: "ashby",
    externalJobId: job.id,
    title: job.title,
    company: job.companyName ?? configuredCompany,
    ...(job.descriptionPlain ?? job.descriptionHtml
      ? { description: job.descriptionPlain ?? job.descriptionHtml }
      : {}),
    ...(job.location ? { location: job.location } : {}),
    ...(job.workplaceType ? { remoteStatus: job.workplaceType } : {}),
    ...(job.employmentType ? { employmentType: job.employmentType } : {}),
    ...(job.jobUrl ? { sourceUrl: job.jobUrl } : {}),
    ...(applicationUrl ? { officialApplicationUrl: applicationUrl } : {}),
    ...(job.publishedAt ? { postedDate: job.publishedAt } : {}),
    ...(job.updatedAt ? { updatedDate: job.updatedAt } : {}),
  };
};
