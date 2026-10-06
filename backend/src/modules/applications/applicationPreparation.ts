import type { CandidateProfile, Job } from "@personal-job-automation/shared/types";
import { prepareApplicationAnswers } from "./applicationAnswers.js";
import { prepareCoverLetter } from "./coverLetterPreparation.js";
import type { PreparationLlmProvider } from "./llmProvider.js";
import { tailorResume } from "./resumeTailoring.js";
import type { PreparationContext, PreparationResult } from "./types.js";

export const prepareApplication = async (
  candidate: CandidateProfile,
  job: Job,
  provider: PreparationLlmProvider = {},
): Promise<PreparationResult> => {
  const context: PreparationContext = { candidate, job };
  const [tailoredResume, coverLetter, generatedAnswers] = await Promise.all([
    tailorResume(candidate, job, provider),
    prepareCoverLetter(candidate, job, provider),
    prepareApplicationAnswers(candidate, job, provider),
  ]);
  const missingInformation = [
    ...("missingInformation" in coverLetter
      ? (coverLetter.missingInformation ?? [])
      : []),
    ...generatedAnswers
      .filter((answer) => answer.status === "missing" || answer.status === "requires_review")
      .map((answer) => answer.question),
  ];
  return {
    status: missingInformation.length ? "needs_information" : "ready_for_review",
    tailoredResume,
    coverLetter,
    generatedAnswers,
    missingInformation: [...new Set(missingInformation)],
    generationMetadata: {
      provider: "replaceable-preparation-provider",
      deterministicMatchingRemainsAuthoritative: true,
      contextLoaded: Boolean(context.candidate && context.job),
    },
  };
};
