import type {
  CandidateProfile,
  Job,
} from "@personal-job-automation/shared/types";

export type MatchDecision = "APPLY" | "REVIEW" | "SKIP";
export type MatchConfidence = "high" | "medium" | "low";
export type SkillRelationship =
  | "EXACT"
  | "RELATED"
  | "TRANSFERABLE"
  | "MISSING"
  | "UNKNOWN";

export type ExperienceAnalysis = {
  status: "compatible" | "mismatch" | "unknown";
  candidateYears?: number;
  requirement?: {
    minimum?: number;
    maximum?: number;
    preference: "required" | "preferred" | "unknown";
  };
  reason: string;
};

export type LocationAnalysis = {
  status: "compatible" | "incompatible" | "unknown";
  reason: string;
};

export type SkillAnalysis = {
  exact: string[];
  related: string[];
  transferable: string[];
  missingRequired: string[];
  missingPreferred: string[];
  unknown: string[];
};

export type RoleClassification = "TARGET" | "RELATED" | "AMBIGUOUS" | "EXCLUDED";

export type RoleAnalysis = {
  status: "compatible" | "incompatible" | "unknown";
  reason: string;
  normalizedRole: string;
  confidence: number;
  classification?: RoleClassification;
  matchedTargetRole?: string;
  exclusionCategory?: string;
  exclusionReason?: string;
  evidence?: string[];
};

export type MatchResult = {
  eligible: boolean;
  matchScore: number;
  confidence: MatchConfidence;
  decision: MatchDecision;
  roleAnalysis: RoleAnalysis;
  experienceAnalysis: ExperienceAnalysis;
  locationAnalysis: LocationAnalysis;
  skillAnalysis: SkillAnalysis;
  matchedSkills: string[];
  missingSkills: string[];
  relatedSkills: string[];
  reasons: string[];
  hardFilterFailures: string[];
  scoreBreakdown: {
    roleRelevance: number;
    requiredSkillCoverage: number;
    preferredSkillCoverage: number;
    experienceFit: number;
    locationCompatibility: number;
    coreStackAlignment: number;
    analysisConfidence: number;
  };
};

export type CandidateMatcherInput = {
  candidate: CandidateProfile;
  job: Job;
};
