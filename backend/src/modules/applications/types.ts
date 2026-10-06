import type { CandidateProfile, Job } from "@personal-job-automation/shared/types";

export type PreparationStatus =
  | "not_started"
  | "preparing"
  | "ready_for_review"
  | "needs_information"
  | "failed";

export type TailoredResume = {
  personal: CandidateProfile["personal"];
  contact: CandidateProfile["contact"];
  summary?: string;
  skills: string[];
  technologies: string[];
  experience: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  education: Array<Record<string, unknown>>;
  certifications: Array<Record<string, unknown>>;
};

export type CoverLetterPreparation =
  | { status: "not_required"; content?: never; reason: string }
  | {
      status: "ready_for_review" | "needs_information";
      content?: string;
      reason: string;
      missingInformation?: string[];
    };

export type PreparedAnswer = {
  question: string;
  status: "known" | "generated" | "missing" | "requires_review";
  answer?: string;
  source?: string;
};

export type PreparationResult = {
  status: PreparationStatus;
  tailoredResume: TailoredResume;
  coverLetter: CoverLetterPreparation;
  generatedAnswers: PreparedAnswer[];
  missingInformation: string[];
  generationMetadata: Record<string, unknown>;
};

export type PreparationContext = {
  job: Job;
  candidate: CandidateProfile;
};
