import type { CandidateProfile, Job } from "@personal-job-automation/shared/types";
import type { PreparationLlmProvider } from "./llmProvider.js";
import { candidateFacts, containsCandidateFact } from "./resumeTailoring.js";
import type { CoverLetterPreparation } from "./types.js";

const coverLetterRequested = (job: Job): boolean =>
  /\b(cover letter|covering letter|motivation letter)\b/i.test(
    job.description ?? "",
  );

export const prepareCoverLetter = async (
  candidate: CandidateProfile,
  job: Job,
  provider: PreparationLlmProvider = {},
): Promise<CoverLetterPreparation> => {
  const requested = coverLetterRequested(job);
  if (!requested && !provider.generateCoverLetter) {
    return {
      status: "not_required",
      reason: "The job does not explicitly request a cover letter.",
    };
  }
  if (!provider.generateCoverLetter) {
    return {
      status: "needs_information",
      reason: "A replaceable content provider is required to draft this letter.",
      missingInformation: ["cover letter generation provider"],
    };
  }
  const content = (await provider.generateCoverLetter({ candidate, job })).trim();
  if (
    !content ||
    !containsCandidateFact(content, {
      ...candidate,
      skills: [...candidate.skills, ...candidateFacts(candidate)],
    })
  ) {
    return {
      status: "needs_information",
      reason: "Generated cover letter did not contain a verifiable candidate fact.",
      missingInformation: ["grounded cover letter content"],
    };
  }
  return {
    status: "ready_for_review",
    content,
    reason: requested
      ? "The job explicitly requests a cover letter."
      : "The configured preparation provider determined a cover letter is useful.",
  };
};
