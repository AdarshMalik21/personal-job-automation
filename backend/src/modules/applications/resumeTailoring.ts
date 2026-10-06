import type { CandidateProfile, Job } from "@personal-job-automation/shared/types";
import type { PreparationLlmProvider } from "./llmProvider.js";
import type { TailoredResume } from "./types.js";

const normalize = (value: string) => value.trim().toLowerCase();
const relevance = (value: string, jobText: string) =>
  jobText.includes(normalize(value)) ? 1 : 0;

const collectStrings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
};

const experienceYears = (candidate: CandidateProfile): string[] => [
  ...(candidate.yearsOfExperience !== undefined
    ? [String(candidate.yearsOfExperience)]
    : []),
  ...candidate.experience.flatMap((entry) => {
    const years = entry.years;
    return typeof years === "number" || typeof years === "string"
      ? [String(years)]
      : [];
  }),
];

const safeNarrativeWords = new Set([
  "a",
  "an",
  "am",
  "and",
  "apis",
  "applications",
  "as",
  "build",
  "built",
  "building",
  "experience",
  "for",
  "have",
  "i",
  "interested",
  "in",
  "my",
  "of",
  "on",
  "payments",
  "reliable",
  "services",
  "skills",
  "technology",
  "the",
  "to",
  "use",
  "using",
  "with",
  "worked",
]);

const removeCandidateFacts = (content: string, candidate: CandidateProfile) => {
  let remainder = content.toLowerCase();
  const facts = [...new Set(candidateFacts(candidate))]
    .filter((fact) => fact.trim().length >= 3)
    .sort((left, right) => right.length - left.length);
  for (const fact of facts) {
    const escaped = fact.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    remainder = remainder.replace(new RegExp(escaped, "g"), " ");
  }
  return remainder;
};

const hasOnlySafeNarrativeFraming = (
  content: string,
  candidate: CandidateProfile,
): boolean => {
  const remainder = removeCandidateFacts(content, candidate);
  const words = remainder.match(/[a-z]+/g) ?? [];
  return words.every((word) => safeNarrativeWords.has(word));
};

const containsUnsupportedYears = (
  content: string,
  candidate: CandidateProfile,
): boolean => {
  const allowed = new Set(experienceYears(candidate));
  return [...content.matchAll(/\b(\d+)\+?\s+years?\b/gi)].some(
    (match) => !allowed.has(match[1] ?? ""),
  );
};

export const tailorResume = async (
  candidate: CandidateProfile,
  job: Job,
  provider: PreparationLlmProvider = {},
): Promise<TailoredResume> => {
  const jobText = normalize(
    [job.title, job.description, ...job.requiredSkills, ...job.preferredSkills]
      .filter(Boolean)
      .join(" "),
  );
  const skills = [...new Set([...candidate.skills, ...candidate.technologies])];
  skills.sort(
    (left, right) =>
      relevance(right, jobText) - relevance(left, jobText) ||
      left.localeCompare(right),
  );
  let generated: { summary?: string } = {};
  if (provider.tailorResume) {
    try {
      generated = await provider.tailorResume({ candidate, job });
    } catch {
      generated = {};
    }
  }
  const generatedSummary =
    generated.summary?.trim() &&
    validateGeneratedSummary(generated.summary, candidate)
      ? generated.summary.trim()
      : undefined;
  return {
    personal: candidate.personal,
    contact: candidate.contact,
    ...(generatedSummary
      ? { summary: generatedSummary }
      : candidate.personal.professionalSummary
        ? { summary: candidate.personal.professionalSummary }
        : {}),
    skills,
    technologies: candidate.technologies,
    experience: candidate.experience,
    projects: candidate.projects,
    education: candidate.education,
    certifications: candidate.certifications,
  };
};

export const containsCandidateFact = (
  content: string,
  candidate: CandidateProfile,
): boolean => {
  const facts = candidateFacts(candidate)
    .filter((fact) => fact.trim().length >= 3)
    .map((fact) => fact.toLowerCase());
  const sentences = content
    .split(/(?:[.!?]+\s+|\r?\n+)/)
    .map((sentence) => sentence.trim().toLowerCase())
    .filter(Boolean);
  return (
    sentences.length > 0 &&
    sentences.every(
      (sentence) =>
        facts.some((fact) => sentence.includes(fact)) &&
        hasOnlySafeNarrativeFraming(sentence, candidate),
    )
  );
};

export const candidateFacts = (candidate: CandidateProfile): string[] =>
  [
    candidate.personal.firstName,
    candidate.personal.lastName,
    candidate.personal.professionalSummary,
    ...candidate.skills,
    ...candidate.technologies,
    ...collectStrings(candidate.experience),
    ...collectStrings(candidate.projects),
    ...collectStrings(candidate.education),
    ...collectStrings(candidate.certifications),
  ].filter((value): value is string => Boolean(value));

export const validateGeneratedSummary = (
  content: string,
  candidate: CandidateProfile,
): boolean =>
  containsCandidateFact(content, candidate) &&
  !containsUnsupportedYears(content, candidate);

export const validateGeneratedContent = (
  content: string,
  candidate: CandidateProfile,
): boolean =>
  containsCandidateFact(content, candidate) &&
  !containsUnsupportedYears(content, candidate);
