export const MATCH_SCORE_WEIGHTS = {
  roleRelevance: 20,
  requiredSkillCoverage: 30,
  preferredSkillCoverage: 10,
  experienceFit: 15,
  locationCompatibility: 15,
  coreStackAlignment: 5,
  analysisConfidence: 5,
} as const;

export const SKILL_WEIGHTS = {
  exactRequired: 1,
  exactPreferred: 0.6,
  relatedRequired: 0.4,
  relatedPreferred: 0.25,
  transferable: 0.15,
  missing: 0,
} as const;

export const ROLE_SIGNALS = [
  "mern",
  "full stack",
  "fullstack",
  "react",
  "node",
  "next",
  "javascript",
  "typescript",
  "software engineer",
  "sde 1",
  "sde-1",
  "backend engineer",
] as const;

export const UNRELATED_ROLE_SIGNALS = [
  "data scientist",
  "data analyst",
  "ios developer",
  "android developer",
  "qa engineer",
  "quality assurance",
  "devops engineer",
  "salesforce",
  "servicenow",
  "telephony",
] as const;

export const CORE_STACK = [
  "javascript",
  "typescript",
  "react",
  "next.js",
  "node.js",
  "express.js",
  "mongodb",
] as const;