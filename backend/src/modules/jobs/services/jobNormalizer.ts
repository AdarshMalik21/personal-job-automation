import type { Job } from "@personal-job-automation/shared/types";
import type { RawJobInput } from "../types/rawJob.js";
import { validateRawJobInput } from "../validators/rawJobValidator.js";
import { generateCanonicalIdentity } from "../utils/generateCanonicalIdentity.js";
import { normalizeCompany } from "../utils/normalizeCompany.js";
import { normalizeLocation } from "../utils/normalizeLocation.js";
import { normalizeRemoteStatus } from "../utils/normalizeRemoteStatus.js";
import { normalizeSkills } from "../utils/normalizeSkills.js";
import { normalizeTitle } from "../utils/normalizeTitle.js";
import { normalizeText, optionalText } from "../utils/text.js";

const normalizeDate = (
  value: string | Date | undefined,
): string | undefined => {
  if (value === undefined) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

export const normalizeJob = (rawJob: RawJobInput): Job => {
  validateRawJobInput(rawJob);
  const normalizedTitle = normalizeTitle(rawJob.title);
  const normalizedCompany = normalizeCompany(rawJob.company);
  const normalizedLocation = normalizeLocation(rawJob.location);
  const normalizedEmploymentType = rawJob.employmentType
    ? normalizeText(rawJob.employmentType)
    : undefined;
  const externalJobId = optionalText(rawJob.externalJobId);
  const officialApplicationUrl = optionalText(rawJob.officialApplicationUrl);
  const identityInput = {
    source: rawJob.source,
    normalizedCompany,
    normalizedTitle,
    ...(externalJobId ? { externalJobId } : {}),
    ...(officialApplicationUrl ? { officialApplicationUrl } : {}),
    ...(normalizedLocation ? { normalizedLocation } : {}),
    ...(normalizedEmploymentType ? { normalizedEmploymentType } : {}),
  };
  const canonicalIdentity = generateCanonicalIdentity(identityInput);
  const postedDate = normalizeDate(rawJob.postedDate);
  const updatedDate = normalizeDate(rawJob.updatedDate);
  const description = optionalText(rawJob.description);
  const location = optionalText(rawJob.location);
  const employmentType = optionalText(rawJob.employmentType);
  const experienceRequirement = optionalText(rawJob.experienceRequirement);
  const sourceUrl = optionalText(rawJob.sourceUrl);

  return {
    title: rawJob.title.trim(),
    normalizedTitle,
    company: rawJob.company.trim(),
    normalizedCompany,
    ...(description ? { description } : {}),
    ...(location ? { location } : {}),
    ...(normalizedLocation ? { normalizedLocation } : {}),
    remoteStatus: normalizeRemoteStatus(rawJob.remoteStatus),
    ...(employmentType ? { employmentType } : {}),
    ...(experienceRequirement ? { experienceRequirement } : {}),
    requiredSkills: normalizeSkills(rawJob.requiredSkills),
    preferredSkills: normalizeSkills(rawJob.preferredSkills),
    relatedSkills: normalizeSkills(rawJob.relatedSkills),
    source: rawJob.source,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(officialApplicationUrl ? { officialApplicationUrl } : {}),
    ...(externalJobId ? { externalJobId } : {}),
    ...(postedDate ? { postedDate } : {}),
    ...(updatedDate ? { updatedDate } : {}),
    discoveredDate: new Date().toISOString(),
    status: "discovered",
    canonicalIdentity,
    deduplication: {},
    analysis: {},
    match: {},
  };
};
