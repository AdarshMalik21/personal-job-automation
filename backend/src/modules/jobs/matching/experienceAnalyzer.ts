import type { Job } from "@personal-job-automation/shared/types";
import type { ExperienceAnalysis } from "./types.js";

type ParsedRequirement = {
  minimum?: number;
  maximum?: number;
  preference: "required" | "preferred" | "unknown";
};

const numberPattern = "(\\d+(?:\\.\\d+)?)";

const parseRequirement = (value: string): ParsedRequirement | undefined => {
  const lower = value.toLowerCase();
  const preference =
    /preferred|nice to have|bonus|plus|desired|preferred qualification/.test(
      lower,
    )
      ? "preferred"
      : "required";
  const range = new RegExp(
    `${numberPattern}\\s*(?:-|–|to)\\s*${numberPattern}\\s*\\+?\\s*(?:years?|yrs?\\b)`,
  );
  const rangeMatch = lower.match(range);
  if (rangeMatch) {
    return {
      minimum: Number(rangeMatch[1]),
      maximum: Number(rangeMatch[2]),
      preference,
    };
  }
  const minimum = lower.match(
    new RegExp(
      `(?:at least|minimum of?|minimum|required)\\s*${numberPattern}\\s*\\+?\\s*(?:years?|yrs?\\b)`,
    ),
  );
  const plus = lower.match(
    new RegExp(`${numberPattern}\\s*\\+\\s*(?:years?|yrs?\\b)`),
  );
  if (minimum || plus) {
    const match = minimum ?? plus;
    return { minimum: Number(match?.[1]), preference };
  }
  return /experience|experienced|professional experience|several years/.test(
    lower,
  )
    ? { preference: "unknown" }
    : undefined;
};

export const analyzeExperience = (
  job: Job,
  candidateYears: number | undefined,
): ExperienceAnalysis => {
  const source = job.experienceRequirement ?? job.description;
  if (!source)
    return {
      status: "unknown",
      ...(candidateYears !== undefined ? { candidateYears } : {}),
      reason: "No experience requirement is available",
    };
  const requirement = parseRequirement(source);
  if (!requirement)
    return {
      status: "unknown",
      ...(candidateYears !== undefined ? { candidateYears } : {}),
      reason: "Experience requirement is not stated numerically",
    };
  if (requirement.preference === "unknown" || candidateYears === undefined) {
    return {
      status: "unknown",
      ...(candidateYears !== undefined ? { candidateYears } : {}),
      requirement,
      reason:
        candidateYears === undefined
          ? "Candidate experience is not available"
          : "Experience language is ambiguous",
    };
  }
  if (
    requirement.minimum !== undefined &&
    candidateYears < requirement.minimum
  ) {
    return {
      status: requirement.preference === "required" ? "mismatch" : "compatible",
      candidateYears,
      requirement,
      reason:
        requirement.preference === "required"
          ? `Role requires at least ${requirement.minimum} years`
          : `Preferred experience is above the candidate's ${candidateYears} years`,
    };
  }
  return {
    status: "compatible",
    candidateYears,
    requirement,
    reason: "Candidate experience is compatible with the stated requirement",
  };
};
