import type { Job } from "@personal-job-automation/shared/types";

export type DeduplicatedJob = {
  job: Job;
  alternateSources: Array<{
    source: Job["source"];
    externalJobId?: string;
    sourceUrl?: string;
  }>;
};

export type DeduplicationResult = {
  jobs: DeduplicatedJob[];
  duplicatesRemoved: number;
};

const confidenceRank = { unknown: 0, weak: 1, probable: 2, strong: 3 } as const;

const identityKeys = (job: Job): string[] => {
  const keys: string[] = [];
  if (job.canonicalIdentity.strongKey)
    keys.push(`strong:${job.canonicalIdentity.strongKey}`);
  if (
    job.canonicalIdentity.components.normalizedLocation &&
    job.canonicalIdentity.confidence !== "weak" &&
    job.canonicalIdentity.confidence !== "unknown"
  ) {
    keys.push(`canonical:${job.canonicalIdentity.crossSourceKey}`);
  }
  return keys;
};

const completeness = (job: Job): number =>
  [
    job.officialApplicationUrl,
    job.description,
    job.location,
    job.employmentType,
    job.experienceRequirement,
    ...job.requiredSkills,
    ...job.preferredSkills,
    ...job.relatedSkills,
  ].filter(Boolean).length;

const prefer = (left: Job, right: Job): Job => {
  const leftScore =
    (left.officialApplicationUrl ? 1000 : 0) +
    (left.description?.length ?? 0) +
    (left.location ? 100 : 0) +
    completeness(left) +
    confidenceRank[left.canonicalIdentity.confidence] * 10;
  const rightScore =
    (right.officialApplicationUrl ? 1000 : 0) +
    (right.description?.length ?? 0) +
    (right.location ? 100 : 0) +
    completeness(right) +
    confidenceRank[right.canonicalIdentity.confidence] * 10;
  return rightScore > leftScore ? right : left;
};

export const deduplicateJobs = (jobs: Job[]): DeduplicationResult => {
  const groups: DeduplicatedJob[] = [];
  const byIdentity = new Map<string, number>();

  for (const job of jobs) {
    const keys = identityKeys(job);
    const groupIndex = keys
      .map((key) => byIdentity.get(key))
      .find((index): index is number => index !== undefined);
    if (groupIndex === undefined) {
      const index = groups.push({ job, alternateSources: [] }) - 1;
      for (const key of keys) byIdentity.set(key, index);
      continue;
    }

    const group = groups[groupIndex];
    if (!group) throw new Error("Deduplication group index is invalid");
    const existing = group.job;
    group.job = prefer(existing, job);
    const alternate = group.job === existing ? job : existing;
    group.alternateSources.push({
      source: alternate.source,
      ...(alternate.externalJobId
        ? { externalJobId: alternate.externalJobId }
        : {}),
      ...(alternate.sourceUrl ? { sourceUrl: alternate.sourceUrl } : {}),
    });
    for (const key of keys) byIdentity.set(key, groupIndex);
  }

  return { jobs: groups, duplicatesRemoved: jobs.length - groups.length };
};
