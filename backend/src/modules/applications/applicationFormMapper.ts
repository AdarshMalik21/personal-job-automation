import type { CandidateProfile } from "@personal-job-automation/shared/types";
import type { PreparedAnswer } from "./types.js";
import type { DetectedApplicationField } from "./browserRunTypes.js";

export type FieldMapping = {
  field: DetectedApplicationField;
  value?: string;
  confidence: "high" | "unknown";
  reason?: string;
};

const normalized = (value: string | undefined) =>
  (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const fieldText = (field: DetectedApplicationField) =>
  normalized([field.label, field.name, field.id, field.placeholder].filter(Boolean).join(" "));

const exactAnswer = (
  field: DetectedApplicationField,
  answers: PreparedAnswer[],
): string | undefined => {
  const text = fieldText(field);
  return answers.find((answer) => {
    const question = normalized(answer.question);
    return question === normalized(field.group) || text.includes(question);
  })?.answer;
};

export const mapApplicationField = (
  field: DetectedApplicationField,
  candidate: CandidateProfile,
  answers: PreparedAnswer[],
): FieldMapping => {
  const text = fieldText(field);
  const mappings: Array<[RegExp, string | undefined]> = [
    [/\bfirst name\b|given name/, candidate.personal.firstName],
    [/\blast name\b|family name|surname/, candidate.personal.lastName],
    [/\bemail\b|email address/, candidate.contact.email],
    [/\bphone\b|phone number|mobile/, candidate.contact.phone],
    [/\byears of experience\b|total years of experience/, candidate.yearsOfExperience?.toString()],
  ];
  const match = mappings.find(([pattern]) => pattern.test(text));
  if (match) {
    return match[1]
      ? { field, value: match[1], confidence: "high" }
      : { field, confidence: "unknown", reason: "Candidate value is missing" };
  }
  const answer = exactAnswer(field, answers);
  if (answer && field.type === "radio") {
    const option = normalized([field.label, field.value].filter(Boolean).join(" "));
    return normalized(answer) === option
      ? { field, value: answer, confidence: "high" }
      : { field, confidence: "unknown", reason: "A different radio option is the approved answer" };
  }
  if (answer && field.type !== "checkbox") return { field, value: answer, confidence: "high" };
  if (
    /(salary|compensation|authorization|visa|sponsorship|notice|relocation|citizenship|gender|birth|criminal|disability|veteran)/.test(
      text,
    )
  ) {
    return {
      field,
      confidence: "unknown",
      reason: "Sensitive field requires explicit user-approved information",
    };
  }
  return {
    field,
    confidence: "unknown",
    reason: "Field meaning has no deterministic prepared mapping",
  };
};
