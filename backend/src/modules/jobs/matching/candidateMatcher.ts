import type {
  CandidateProfile,
  Job,
} from "@personal-job-automation/shared/types";
import {
  MATCH_SCORE_WEIGHTS,
  CORE_STACK,
  ROLE_SIGNALS,
  SKILL_WEIGHTS,
  UNRELATED_ROLE_SIGNALS,
} from "./constants.js";
import { analyzeExperience } from "./experienceAnalyzer.js";
import { analyzeLocation } from "./locationAnalyzer.js";
import { matchSkills } from "./skillMatcher.js";
import { normalizeSkill } from "../utils/normalizeSkills.js";
import type { MatchResult } from "./types.js";

const normalize = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9+#. -]/g, " ");

const analyzeRole = (
  candidate: CandidateProfile,
  job: Job,
): MatchResult["roleAnalysis"] => {
  const title = normalize(job.title);
  if (UNRELATED_ROLE_SIGNALS.some((signal) => title.includes(signal))) {
    return {
      status: "incompatible",
      reason: "Job title is outside the candidate's target engineering roles",
    };
  }
  const preferredRoleMatch = candidate.preferredRoles.some((role) =>
    title.includes(normalize(role)),
  );
  if (
    preferredRoleMatch ||
    ROLE_SIGNALS.some((signal) => title.includes(signal))
  ) {
    return {
      status: "compatible",
      reason: "Job title contains a compatible role signal",
    };
  }
  return {
    status: "unknown",
    reason: "Job title does not provide a clear target-role signal",
  };
};

const skillCoverage = (
  skills: ReturnType<typeof matchSkills>,
  preferred: boolean,
): number => {
  const relationships = preferred
    ? skills.preferredRelationships
    : skills.requiredRelationships;
  if (relationships.size === 0)
    return preferred ? 0 : MATCH_SCORE_WEIGHTS.requiredSkillCoverage;
  let total = 0;
  for (const relationship of relationships.values()) {
    if (relationship === "EXACT")
      total += preferred
        ? SKILL_WEIGHTS.exactPreferred
        : SKILL_WEIGHTS.exactRequired;
    if (relationship === "RELATED")
      total += preferred
        ? SKILL_WEIGHTS.relatedPreferred
        : SKILL_WEIGHTS.relatedRequired;
    if (relationship === "TRANSFERABLE") total += SKILL_WEIGHTS.transferable;
  }
  const maximum =
    relationships.size *
    (preferred ? SKILL_WEIGHTS.exactPreferred : SKILL_WEIGHTS.exactRequired);
  return (
    (total / maximum) *
    (preferred
      ? MATCH_SCORE_WEIGHTS.preferredSkillCoverage
      : MATCH_SCORE_WEIGHTS.requiredSkillCoverage)
  );
};

export const matchCandidateToJob = (
  candidate: CandidateProfile,
  job: Job,
): MatchResult => {
  const roleAnalysis = analyzeRole(candidate, job);
  const experienceAnalysis = analyzeExperience(
    job,
    candidate.yearsOfExperience,
  );
  const locationAnalysis = analyzeLocation(candidate, job);
  const skills = matchSkills(candidate, job);
  const hardFilterFailures: string[] = [];
  if (roleAnalysis.status === "incompatible")
    hardFilterFailures.push(roleAnalysis.reason);
  if (
    experienceAnalysis.status === "mismatch" &&
    experienceAnalysis.requirement?.preference === "required"
  )
    hardFilterFailures.push(experienceAnalysis.reason);
  if (locationAnalysis.status === "incompatible")
    hardFilterFailures.push(locationAnalysis.reason);
  if (skills.missingRequired.length > 0)
    hardFilterFailures.push(
      `Missing required skills: ${skills.missingRequired.join(", ")}`,
    );

  const roleRelevance =
    roleAnalysis.status === "compatible"
      ? 20
      : roleAnalysis.status === "unknown"
        ? 8
        : 0;
  const requiredSkillCoverage = skillCoverage(skills, false);
  const preferredSkillCoverage = skillCoverage(skills, true);
  const experienceFit =
    experienceAnalysis.status === "compatible"
      ? 15
      : experienceAnalysis.status === "unknown"
        ? 7
        : experienceAnalysis.requirement?.preference === "preferred"
          ? 3
          : 0;
  const locationCompatibility =
    locationAnalysis.status === "compatible"
      ? 15
      : locationAnalysis.status === "unknown"
        ? 0
        : 0;
  const candidateSkills = new Set(
    [...candidate.skills, ...candidate.technologies].map(normalizeSkill),
  );
  const coreMatches = CORE_STACK.filter(
    (skill) =>
      candidateSkills.has(skill) &&
      job.requiredSkills
        .concat(job.preferredSkills)
        .some((jobSkill) => jobSkill === skill),
  ).length;
  const coreStackAlignment = Math.min(
    MATCH_SCORE_WEIGHTS.coreStackAlignment,
    coreMatches,
  );
  const analysisConfidence =
    skills.unknown.length > 0 ||
    roleAnalysis.status === "unknown" ||
    experienceAnalysis.status === "unknown"
      ? 2
      : 5;
  const matchScore = Math.round(
    Math.min(
      100,
      roleRelevance +
        requiredSkillCoverage +
        preferredSkillCoverage +
        experienceFit +
        locationCompatibility +
        coreStackAlignment +
        analysisConfidence,
    ),
  );
  const meaningfulUncertainty =
    roleAnalysis.status === "unknown" ||
    experienceAnalysis.status === "unknown" ||
    locationAnalysis.status === "unknown" ||
    skills.unknown.length > 0;
  const eligible = hardFilterFailures.length === 0;
  const decision =
    !eligible || matchScore < 50
      ? "SKIP"
      : matchScore >= 75 && !meaningfulUncertainty
        ? "APPLY"
        : "REVIEW";
  const confidence =
    !meaningfulUncertainty && eligible
      ? "high"
      : hardFilterFailures.length > 0
        ? "low"
        : "medium";
  const reasons = [
    roleAnalysis.reason,
    experienceAnalysis.reason,
    locationAnalysis.reason,
  ];
  if (skills.exact.length > 0)
    reasons.push(`Exact skills: ${skills.exact.join(", ")}`);
  if (skills.related.length > 0)
    reasons.push(
      `Related skills do not prove exact experience: ${skills.related.join(", ")}`,
    );
  if (skills.missingPreferred.length > 0)
    reasons.push(
      `Missing preferred skills: ${skills.missingPreferred.join(", ")}`,
    );
  reasons.push(...hardFilterFailures);
  return {
    eligible,
    matchScore,
    confidence,
    decision,
    roleAnalysis,
    experienceAnalysis,
    locationAnalysis,
    skillAnalysis: skills,
    matchedSkills: skills.exact,
    missingSkills: [...skills.missingRequired, ...skills.missingPreferred],
    relatedSkills: [...skills.related, ...skills.transferable],
    reasons: [...new Set(reasons)],
    hardFilterFailures,
    scoreBreakdown: {
      roleRelevance,
      requiredSkillCoverage,
      preferredSkillCoverage,
      experienceFit,
      locationCompatibility,
      coreStackAlignment,
      analysisConfidence,
    },
  };
};
