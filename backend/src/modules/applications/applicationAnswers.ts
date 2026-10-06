import type { CandidateProfile, Job } from "@personal-job-automation/shared/types";
import type { PreparationLlmProvider } from "./llmProvider.js";
import type { PreparedAnswer } from "./types.js";
import { validateGeneratedContent } from "./resumeTailoring.js";

const value = (candidate: CandidateProfile, key: string): string | undefined => {
  if (key === "years") {
    return candidate.yearsOfExperience !== undefined
      ? String(candidate.yearsOfExperience)
      : undefined;
  }
  if (key === "location") {
    return [
      candidate.location?.city,
      candidate.location?.region,
      candidate.location?.country,
    ]
      .filter(Boolean)
      .join(", ") || undefined;
  }
  return undefined;
};

const knownQuestions: Array<[string, string, string]> = [
  ["Years of experience", "years", "candidate.yearsOfExperience"],
  ["Current location", "location", "candidate.location"],
];

const providerQuestions = [
  "Why are you interested in this role?",
  "What makes you a good fit?",
];

export const prepareApplicationAnswers = async (
  candidate: CandidateProfile,
  job: Job,
  provider: PreparationLlmProvider = {},
): Promise<PreparedAnswer[]> => {
  const answers: PreparedAnswer[] = knownQuestions.map(
    ([question, key, source]) => {
      const answer = value(candidate, key);
      return answer
        ? { question, status: "known", answer, source }
        : {
            question,
            status: "missing",
            source,
          };
    },
  );
  for (const question of providerQuestions) {
    if (!provider.generateAnswer) {
      answers.push({
        question,
        status: "requires_review",
        source: "preparation provider unavailable",
      });
      continue;
    }
    let answer = "";
    try {
      answer = (
        await provider.generateAnswer(question, { candidate, job })
      ).trim();
    } catch {
      answer = "";
    }
    answers.push(
      answer && validateGeneratedContent(answer, candidate)
        ? { question, status: "generated", answer, source: "preparation provider" }
        : {
            question,
            status: "requires_review",
            source: answer
              ? "provider answer could not be deterministically verified"
              : "provider failed or returned no answer",
          },
    );
  }
  for (const question of [
    "Notice period",
    "Expected salary",
    "Work authorization",
    "Relocation",
  ]) {
    answers.push({
      question,
      status: "missing",
      source: "candidate profile does not provide this information",
    });
  }
  return answers;
};
