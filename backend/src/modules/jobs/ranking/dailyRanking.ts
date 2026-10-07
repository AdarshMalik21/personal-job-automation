export const DAILY_SELECTION_LIMIT = 10;

const DEPRIORITIZED_APPLICATION_STATUSES = new Set([
  "submitted",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "follow_up_required",
]);

export type DailyDecision = "APPLY" | "REVIEW" | "SKIP";
export type DailyFreshness = "fresh" | "stale" | "unknown";
export type DailyLocationStatus = "compatible" | "incompatible" | "unknown";

export type RankableJob = {
  id: string;
  title: string;
  company: string;
  location?: string;
  remoteStatus?: string;
  officialApplicationUrl?: string;
  matchScore: number;
  decision: DailyDecision;
  reasons: string[];
  missingRequirements: string[];
  freshness: DailyFreshness;
  roleRelevance: number;
  requiredSkillCoverage: number;
  locationStatus: DailyLocationStatus;
  applicationStatus: string;
  preparationAvailable: boolean;
};

const decisionRank = (decision: DailyDecision): number =>
  decision === "APPLY" ? 0 : decision === "REVIEW" ? 1 : 2;

const freshnessRank = (freshness: DailyFreshness): number =>
  freshness === "fresh" ? 0 : freshness === "unknown" ? 1 : 2;

const locationRank = (status: DailyLocationStatus): number =>
  status === "compatible" ? 0 : status === "unknown" ? 1 : 2;

export const isDeprioritizedApplication = (status: string): boolean =>
  DEPRIORITIZED_APPLICATION_STATUSES.has(status);

export const rankingReason = (job: RankableJob): string => {
  const application = isDeprioritizedApplication(job.applicationStatus)
    ? "already applied"
    : "not yet applied";
  return `${job.decision} score ${job.matchScore}, ${job.freshness}, ${application}`;
};

export const rankDailyJobs = (
  jobs: readonly RankableJob[],
  limit = DAILY_SELECTION_LIMIT,
): RankableJob[] => {
  const eligible = jobs.filter(
    (job) => job.decision === "APPLY" || job.decision === "REVIEW",
  );
  return [...eligible]
    .sort((left, right) => {
      const decision = decisionRank(left.decision) - decisionRank(right.decision);
      if (decision !== 0) return decision;
      const score = right.matchScore - left.matchScore;
      if (score !== 0) return score;
      const freshness = freshnessRank(left.freshness) - freshnessRank(right.freshness);
      if (freshness !== 0) return freshness;
      const role = right.roleRelevance - left.roleRelevance;
      if (role !== 0) return role;
      const skills = right.requiredSkillCoverage - left.requiredSkillCoverage;
      if (skills !== 0) return skills;
      const location = locationRank(left.locationStatus) - locationRank(right.locationStatus);
      if (location !== 0) return location;
      const applied =
        Number(isDeprioritizedApplication(left.applicationStatus)) -
        Number(isDeprioritizedApplication(right.applicationStatus));
      if (applied !== 0) return applied;
      return left.id.localeCompare(right.id);
    })
    .slice(0, limit);
};
