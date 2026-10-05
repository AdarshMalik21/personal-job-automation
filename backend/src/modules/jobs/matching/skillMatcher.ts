import { normalizeSkill } from "../utils/normalizeSkills.js";
import type { CandidateProfile, Job } from "@personal-job-automation/shared/types";
import type { SkillAnalysis, SkillRelationship } from "./types.js";

const relatedSkills: Record<string, string[]> = {
  "next.js": ["react"],
  react: ["next.js"],
  "express.js": ["node.js"],
  "node.js": ["express.js"],
  nestjs: ["node.js", "express.js", "typescript"],
  mongodb: ["mongoose"],
  javascript: ["typescript"],
  typescript: ["javascript"],
};

const knownSkills = new Set([
  "javascript",
  "typescript",
  "react",
  "next.js",
  "node.js",
  "express.js",
  "nestjs",
  "mongodb",
  "mongoose",
  "redis",
  "aws",
  "ec2",
  "docker",
  "rest",
  "rest apis",
  "git",
  "github",
  "c++",
  "c#",
  ".net",
]);

const unique = (values: string[]): string[] => [...new Set(values)];

const candidateSkillSet = (candidate: CandidateProfile): Set<string> =>
  new Set(
    [...candidate.skills, ...candidate.technologies].map(normalizeSkill).filter(Boolean),
  );

const relatedCandidateSkillSet = (candidate: CandidateProfile): Set<string> =>
  new Set(candidate.relatedTechnology.map(normalizeSkill).filter(Boolean));

const relationship = (
  skill: string,
  exact: Set<string>,
  related: Set<string>,
): SkillRelationship => {
  if (exact.has(skill)) return "EXACT";
  if (related.has(skill)) return "RELATED";
  if (skill === "nestjs" && ["node.js", "express.js", "typescript"].some((candidateSkill) => exact.has(candidateSkill))) {
    return "TRANSFERABLE";
  }
  if ((relatedSkills[skill] ?? []).some((candidateSkill) => exact.has(candidateSkill))) {
    return "RELATED";
  }
  return knownSkills.has(skill) ? "MISSING" : "UNKNOWN";
};

export type SkillMatchResult = SkillAnalysis & {
  requiredRelationships: Map<string, SkillRelationship>;
  preferredRelationships: Map<string, SkillRelationship>;
};

export const matchSkills = (candidate: CandidateProfile, job: Job): SkillMatchResult => {
  const exact = candidateSkillSet(candidate);
  const related = relatedCandidateSkillSet(candidate);
  const required = unique(job.requiredSkills.map(normalizeSkill).filter(Boolean));
  const preferred = unique(job.preferredSkills.map(normalizeSkill).filter(Boolean));
  const requiredRelationships = new Map<string, SkillRelationship>();
  const preferredRelationships = new Map<string, SkillRelationship>();
  const result: SkillAnalysis = {
    exact: [],
    related: [],
    transferable: [],
    missingRequired: [],
    missingPreferred: [],
    unknown: [],
  };

  const classify = (
    skills: string[],
    target: Map<string, SkillRelationship>,
    requiredSkill: boolean,
  ) => {
    for (const skill of skills) {
      const match = relationship(skill, exact, related);
      target.set(skill, match);
      if (match === "EXACT") result.exact.push(skill);
      if (match === "RELATED") result.related.push(skill);
      if (match === "TRANSFERABLE") result.transferable.push(skill);
      if (match === "UNKNOWN") result.unknown.push(skill);
      if (match !== "EXACT") {
        if (requiredSkill) result.missingRequired.push(skill);
        else result.missingPreferred.push(skill);
      }
    }
  };

  classify(required, requiredRelationships, true);
  classify(preferred, preferredRelationships, false);
  result.exact = unique(result.exact);
  result.related = unique(result.related);
  result.transferable = unique(result.transferable);
  result.unknown = unique(result.unknown);
  return { ...result, requiredRelationships, preferredRelationships };
};