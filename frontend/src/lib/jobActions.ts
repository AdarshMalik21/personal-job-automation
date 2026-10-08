import type { DashboardJob } from "./api";

export const ACTION_LIMIT = 10;

const FINISHED_APPLICATIONS = new Set([
  "submitted",
  "rejected",
  "withdrawn",
  "interview",
  "offer",
  "follow_up_required",
  "submitting",
]);

const DEPRIORITIZED_APPLICATIONS = new Set([
  "submitted",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "follow_up_required",
]);

export type MatchInconsistency = {
  title: string;
  company: string;
  decision: "APPLY" | "REVIEW";
};

export type JobAction = {
  label: "Prepare Application" | "Review Application" | "Review" | "Track Application" | "Apply" | "Apply on Naukri";
  href?: string;
  prepare?: boolean;
  external?: boolean;
};

const scoreOf = (job: DashboardJob) => job.match.matchScore ?? job.match.score ?? 0;

export const hardExperienceMismatch = (job: DashboardJob): boolean => {
  const experience = job.match.experienceAnalysis;
  const minimum = experience?.requirement?.minimum;
  return experience?.status === "mismatch"
    && experience.requirement?.preference === "required"
    && typeof minimum === "number"
    && typeof experience.candidateYears === "number"
    && experience.candidateYears < minimum;
};

export const hasHardFilter = (job: DashboardJob): boolean =>
  (job.match.hardFilterFailures?.length ?? 0) > 0 || hardExperienceMismatch(job);

export const isAvailable = (job: DashboardJob): boolean =>
  job.openStatus !== "closed" && job.status !== "closed";

export const applicationDestination = (job: { analysis?: Record<string, unknown> }): string | undefined => {
  const value = job.analysis?.applicationUrlType;
  return typeof value === "string" ? value : undefined;
};

export const naukriInternalApplication = (job: DashboardJob): boolean =>
  applicationDestination(job) === "NAUKRI_INTERNAL" && Boolean(job.sourceUrl);

export const hasValidApplicationUrl = (job: DashboardJob): boolean => {
  const value = job.officialApplicationUrl?.trim();
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const roleFits = (job: DashboardJob) => job.match.roleAnalysis?.status !== "incompatible";
const locationFits = (job: DashboardJob) => job.match.locationAnalysis?.status !== "incompatible";

export const blockingInconsistencies = (jobs: readonly DashboardJob[]): MatchInconsistency[] =>
  jobs.flatMap((job) => {
    const decision = job.match.decision;
    if ((decision === "REVIEW" || decision === "APPLY") && hardExperienceMismatch(job)) {
      return [{ title: job.title, company: job.company, decision }];
    }
    return [];
  });

const meetsStatedExperience = (job: DashboardJob): boolean => {
  const experience = job.match.experienceAnalysis;
  const minimum = experience?.requirement?.minimum;
  if (experience?.status !== "compatible") return false;
  if (typeof minimum === "number" && typeof experience.candidateYears === "number" && experience.candidateYears < minimum) return false;
  return true;
};

const canOpenApplication = (job: DashboardJob) => hasValidApplicationUrl(job) || naukriInternalApplication(job);

export const isRecommended = (job: DashboardJob): boolean =>
  job.match.decision === "APPLY"
  && !hasHardFilter(job)
  && isAvailable(job)
  && canOpenApplication(job)
  && !FINISHED_APPLICATIONS.has(job.applicationStatus)
  && meetsStatedExperience(job)
  && job.match.locationAnalysis?.status === "compatible"
  && job.match.roleAnalysis?.status === "compatible";

export const needsReview = (job: DashboardJob): boolean =>
  job.match.decision === "REVIEW"
  && !hasHardFilter(job)
  && isAvailable(job)
  && canOpenApplication(job)
  && !FINISHED_APPLICATIONS.has(job.applicationStatus)
  && roleFits(job)
  && locationFits(job)
  && !hardExperienceMismatch(job);

const freshnessRank = (job: DashboardJob) =>
  job.freshness?.status === "fresh" ? 0 : job.freshness?.status === "unknown" ? 1 : 2;

const locationRank = (job: DashboardJob) => {
  const status = job.match.locationAnalysis?.status;
  return status === "compatible" ? 0 : status === "unknown" ? 1 : 2;
};

export const orderByExistingRanking = (jobs: readonly DashboardJob[]): DashboardJob[] =>
  [...jobs].sort((left, right) => {
    const score = scoreOf(right) - scoreOf(left);
    if (score !== 0) return score;
    const freshness = freshnessRank(left) - freshnessRank(right);
    if (freshness !== 0) return freshness;
    const role = (right.match.scoreBreakdown?.roleRelevance ?? 0) - (left.match.scoreBreakdown?.roleRelevance ?? 0);
    if (role !== 0) return role;
    const skills = (right.match.scoreBreakdown?.requiredSkillCoverage ?? 0) - (left.match.scoreBreakdown?.requiredSkillCoverage ?? 0);
    if (skills !== 0) return skills;
    const location = locationRank(left) - locationRank(right);
    if (location !== 0) return location;
    const applied = Number(DEPRIORITIZED_APPLICATIONS.has(left.applicationStatus))
      - Number(DEPRIORITIZED_APPLICATIONS.has(right.applicationStatus));
    if (applied !== 0) return applied;
    return left.id.localeCompare(right.id);
  });

export const recommendedJobs = (jobs: readonly DashboardJob[]) =>
  orderByExistingRanking(jobs.filter(isRecommended)).slice(0, ACTION_LIMIT);

export const reviewJobs = (jobs: readonly DashboardJob[]) =>
  orderByExistingRanking(jobs.filter(needsReview)).slice(0, ACTION_LIMIT);

export const excludedJobs = (jobs: readonly DashboardJob[]) =>
  jobs.filter((job) => !isRecommended(job) && !needsReview(job));

const yearCount = (value: number) => `${value} ${value === 1 ? "year" : "years"}`;

export const experienceLabel = (job: DashboardJob): string => {
  const requirement = job.match.experienceAnalysis?.requirement;
  const preferred = requirement?.preference === "preferred" ? " preferred" : "";
  if (typeof requirement?.minimum === "number" && typeof requirement.maximum === "number") {
    return `Experience: ${requirement.minimum}–${requirement.maximum} years${preferred}`;
  }
  if (typeof requirement?.minimum === "number") {
    return `Experience: ${requirement.minimum}+ ${requirement.minimum === 1 ? "year" : "years"}${preferred}`;
  }
  if (job.match.experienceAnalysis?.status === "unknown") return "Experience: Not clearly specified";
  const text = job.experienceRequirement?.trim();
  if (text && !/candidateYears|preference:|minimum:|maximum:/i.test(text)) return `Experience: ${text}`;
  return "Experience: Not specified";
};

const skillLabel = (skill: string) => skill.replace(/^\w/, (letter) => letter.toUpperCase());

export const matchReasons = (job: DashboardJob): string[] => {
  const reasons: string[] = [];
  if (job.match.roleAnalysis?.status === "compatible") reasons.push("Role matches your target");
  for (const skill of job.match.skillAnalysis?.exact ?? []) {
    reasons.push(`${skillLabel(skill)} matches your experience`);
  }
  if (job.match.experienceAnalysis?.status === "compatible") reasons.push("Experience requirement matches");
  if (job.match.locationAnalysis?.status === "compatible") reasons.push("Location matches your preference");
  return reasons.slice(0, 6);
};

export const reviewReasons = (job: DashboardJob): string[] => {
  const reasons: string[] = [];
  if (job.match.experienceAnalysis?.status === "unknown") reasons.push("Experience requirement is ambiguous");
  if (job.match.locationAnalysis?.status === "unknown") reasons.push("Location information is incomplete");
  if (job.match.roleAnalysis?.status === "unknown") reasons.push("Role fit is uncertain");
  if ((job.match.skillAnalysis?.unknown?.length ?? 0) > 0) reasons.push("Important job information is uncertain");
  if (reasons.length === 0) reasons.push("This job is close, but not confident enough to recommend");
  return reasons;
};

export const exclusionReason = (job: DashboardJob): string => {
  if (hardExperienceMismatch(job)) {
    const minimum = job.match.experienceAnalysis?.requirement?.minimum;
    return typeof minimum === "number" ? `${yearCount(minimum)} required` : "Experience requirement is not met";
  }
  if ((job.match.hardFilterFailures?.length ?? 0) > 0) {
    const failure = job.match.hardFilterFailures?.[0] ?? "";
    if (/years/i.test(failure)) return failure.replace(/^Role requires at least /, "").replace(/years.*/, "years required");
    if (/location/i.test(failure)) return "Location does not match";
    if (/skill/i.test(failure)) return "Required skills are missing";
    if (/role/i.test(failure)) return "Role does not match";
    return "Does not meet your criteria";
  }
  if (job.match.roleAnalysis?.status === "incompatible") return "Role does not match";
  if (job.match.locationAnalysis?.status === "incompatible") return "Location does not match";
  if (job.openStatus === "closed" || job.status === "closed") return "Job is closed";
  if (!hasValidApplicationUrl(job)) return "No application link";
  if (job.match.decision === "SKIP") return "Not a match";
  if (!job.match.decision) return "Not matched";
  return "Not actionable";
};

const workModes: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  any: "Flexible",
  unknown: "Work mode not specified",
};

export const placeLabel = (job: DashboardJob): string => {
  const location = job.location?.trim() || "Location not specified";
  const mode = workModes[job.remoteStatus ?? "unknown"] ?? "Work mode not specified";
  return `${location} · ${mode}`;
};

export const postedLabel = (job: DashboardJob, now = Date.now()): string => {
  const raw = job.postedDate ?? job.freshness?.date;
  const parsed = raw ? Date.parse(raw) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    if (job.freshness?.status === "fresh") return "Posted: Recently";
    if (job.freshness?.status === "stale") return "Posted: Older listing";
    return "Posted: Date not specified";
  }
  const days = Math.floor((now - parsed) / 86_400_000);
  if (days <= 0) return "Posted: Today";
  if (days === 1) return "Posted: 1 day ago";
  return `Posted: ${days} days ago`;
};

export const matchLabel = (job: DashboardJob) => `Match: ${Math.round(scoreOf(job))}%`;

const applicationLabels: Record<string, string> = {
  not_applied: "Not applied",
  prepared: "Prepared",
  ready_for_review: "Ready for review",
  needs_information: "Needs information",
  submitted: "Submitted",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  follow_up_required: "Follow-up required",
  submitting: "Submitting",
};

export const applicationLabel = (status: string) => applicationLabels[status] ?? "Not applied";

export const applicationDestinationLabel = (job: DashboardJob): string => {
  const destination = applicationDestination(job);
  if (destination === "NAUKRI_INTERNAL") return "Apply on Naukri";
  if (destination === "GREENHOUSE" || destination === "LEVER" || destination === "ASHBY" || destination === "WORKDAY") return "Official company application";
  if (destination === "COMPANY_CAREER_PAGE") return "Official company page";
  if (job.officialApplicationUrl) return "Official application page";
  return "Application link unavailable";
};

export const recommendedAction = (job: DashboardJob): JobAction => {
  if (naukriInternalApplication(job)) {
    return { label: "Apply on Naukri", href: job.sourceUrl, external: true };
  }
  if (job.applicationStatus === "prepared" || job.applicationStatus === "needs_information" || job.applicationStatus === "ready_for_review") {
    return { label: "Review Application", href: `/jobs/${job.id}/review` };
  }
  if (FINISHED_APPLICATIONS.has(job.applicationStatus)) {
    return { label: "Track Application", href: `/jobs/${job.id}` };
  }
  return { label: "Prepare Application", href: `/jobs/${job.id}/review`, prepare: true };
};

export const detailAction = (job: DashboardJob): JobAction => {
  if (isRecommended(job) || needsReview(job)) return recommendedAction(job);
  if (FINISHED_APPLICATIONS.has(job.applicationStatus)) return { label: "Track Application", href: `/jobs/${job.id}` };
  return { label: "Review", href: `/jobs/${job.id}/review` };
};

export const requirementLines = (job: DashboardJob): string[] => {
  const lines = [experienceLabel(job)];
  const skills = [...job.requiredSkills, ...(job.match.skillAnalysis?.missingRequired ?? [])];
  const unique = [...new Set(skills.map(skillLabel))];
  if (unique.length > 0) lines.push(`Skills: ${unique.join(", ")}`);
  return lines;
};

export const plainDescription = (value: string | undefined) =>
  value?.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
  || "No description was provided.";

export type RecommendedFilter = {
  role: string;
  location: string;
  workMode: string;
  experience: string;
  applicationStatus: string;
};

export type ReviewFilter = {
  role: string;
  location: string;
  experience: string;
  reviewReason: string;
};

export const filterRecommended = (jobs: readonly DashboardJob[], filter: RecommendedFilter) =>
  jobs.filter((job) => {
    if (filter.role && !job.title.toLowerCase().includes(filter.role.toLowerCase())) return false;
    if (filter.location && !(job.location ?? "").toLowerCase().includes(filter.location.toLowerCase())) return false;
    if (filter.workMode && (job.remoteStatus ?? "unknown") !== filter.workMode) return false;
    if (filter.experience && experienceLabel(job) !== filter.experience) return false;
    if (filter.applicationStatus && applicationLabel(job.applicationStatus) !== filter.applicationStatus) return false;
    return true;
  });

export const filterReview = (jobs: readonly DashboardJob[], filter: ReviewFilter) =>
  jobs.filter((job) => {
    if (filter.role && !job.title.toLowerCase().includes(filter.role.toLowerCase())) return false;
    if (filter.location && !(job.location ?? "").toLowerCase().includes(filter.location.toLowerCase())) return false;
    if (filter.experience && experienceLabel(job) !== filter.experience) return false;
    if (filter.reviewReason && !reviewReasons(job).includes(filter.reviewReason)) return false;
    return true;
  });

export const formatWhen = (value: Date) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(value);

export const latestDiscovery = (jobs: readonly DashboardJob[]): Date | undefined => {
  const times = jobs
    .map((job) => Date.parse(job.discoveredDate ?? job.updatedDate ?? ""))
    .filter((time) => Number.isFinite(time));
  if (times.length === 0) return undefined;
  return new Date(Math.max(...times));
};
