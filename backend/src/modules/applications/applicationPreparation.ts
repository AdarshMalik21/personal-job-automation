import type { CandidateProfile, Job } from "@personal-job-automation/shared/types";
import { prepareApplicationAnswers } from "./applicationAnswers.js";
import { prepareCoverLetter } from "./coverLetterPreparation.js";
import type { PreparationLlmProvider } from "./llmProvider.js";
import { tailorResume } from "./resumeTailoring.js";
import type {
  CoverLetterPreparation,
  PreparationContext,
  PreparationResult,
  PreparedAnswer,
} from "./types.js";

export const missingInformationFor = (
  coverLetter: CoverLetterPreparation,
  generatedAnswers: PreparedAnswer[],
): string[] => [
  ...new Set([
    ...("missingInformation" in coverLetter
      ? (coverLetter.missingInformation ?? [])
      : []),
    ...generatedAnswers
      .filter((answer) => answer.status === "missing" || answer.status === "requires_review")
      .map((answer) => answer.question),
  ]),
];

export const recomputePreparationState = (
  coverLetter: CoverLetterPreparation,
  generatedAnswers: PreparedAnswer[],
): Pick<PreparationResult, "status" | "missingInformation" | "generatedAnswers" | "coverLetter"> => {
  const missingInformation = missingInformationFor(coverLetter, generatedAnswers);
  return {
    coverLetter,
    generatedAnswers,
    missingInformation,
    status: missingInformation.length ? "needs_information" : "ready_for_review",
  };
};

export const applyExplicitAnswers = (
  generatedAnswers: PreparedAnswer[],
  updates: unknown,
): { ok: true; answers: PreparedAnswer[] } | { ok: false; message: string } => {
  if (!Array.isArray(updates) || updates.length === 0) {
    return { ok: false, message: "Answers are required" };
  }
  const next = generatedAnswers.map((answer) => ({ ...answer }));
  for (const update of updates) {
    const question =
      update && typeof update === "object"
        ? (update as { question?: unknown }).question
        : undefined;
    const answer =
      update && typeof update === "object"
        ? (update as { answer?: unknown }).answer
        : undefined;
    if (typeof question !== "string" || !next.some((item) => item.question === question)) {
      return { ok: false, message: "Unknown preparation question" };
    }
    if (typeof answer !== "string" || answer.trim() === "") {
      return { ok: false, message: "Answer must be non-empty" };
    }
    const index = next.findIndex((item) => item.question === question);
    next[index] = {
      question,
      status: "known",
      answer: answer.trim(),
      source: "user",
    };
  }
  return { ok: true, answers: next };
};

export const preserveUserAnswers = (
  generatedAnswers: PreparedAnswer[],
  existingAnswers: unknown,
): PreparedAnswer[] => {
  const userAnswers = new Map<string, string>();
  if (Array.isArray(existingAnswers)) {
    for (const item of existingAnswers) {
      if (!item || typeof item !== "object") continue;
      const answer = item as PreparedAnswer;
      if (
        answer.source === "user" &&
        typeof answer.question === "string" &&
        typeof answer.answer === "string" &&
        answer.answer.trim() !== ""
      ) {
        userAnswers.set(answer.question, answer.answer.trim());
      }
    }
  }
  return generatedAnswers.map((answer) => {
    const preserved = userAnswers.get(answer.question);
    if (preserved === undefined) return answer;
    return {
      question: answer.question,
      status: "known",
      answer: preserved,
      source: "user",
    };
  });
};

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
  return {
    tailoredResume,
    ...recomputePreparationState(coverLetter, generatedAnswers),
    generationMetadata: {
      provider: "replaceable-preparation-provider",
      deterministicMatchingRemainsAuthoritative: true,
      contextLoaded: Boolean(context.candidate && context.job),
    },
  };
};
