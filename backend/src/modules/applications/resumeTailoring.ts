import type { CandidateProfile, Job } from "@personal-job-automation/shared/types";
import type { PreparationLlmProvider } from "./llmProvider.js";
import type { TailoredResume } from "./types.js";

const normalize = (value: string) => value.trim().toLowerCase();
const textOf = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value) ?? "";

const relevance = (value: string, jobText: string) =>
  jobText.includes(normalize(value)) ? 1 : 0;

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
  const generated = provider.tailorResume
    ? await provider.tailorResume({ candidate, job })
    : {};
  return {
    personal: candidate.personal,
    contact: candidate.contact,
    ...(generated.summary
      ? { summary: generated.summary }
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
  const facts = [
    ...candidate.skills,
    ...candidate.technologies,
    candidate.personal.firstName,
    candidate.personal.lastName,
    ...candidate.preferredRoles,
  ].filter((value): value is string => Boolean(value));
  return facts.some((fact) => content.toLowerCase().includes(fact.toLowerCase()));
};

export const candidateFacts = (candidate: CandidateProfile): string[] =>
  [
    candidate.personal.firstName,
    candidate.personal.lastName,
    ...candidate.skills,
    ...candidate.technologies,
    ...candidate.experience.map(textOf),
    ...candidate.projects.map(textOf),
  ].filter((value): value is string => Boolean(value));
