import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prepareApplicationAnswers } from "../applicationAnswers.js";
import { prepareApplication } from "../applicationPreparation.js";
import { prepareCoverLetter } from "../coverLetterPreparation.js";
import { tailorResume } from "../resumeTailoring.js";
import type { PreparationLlmProvider } from "../llmProvider.js";
import type { CandidateProfile, Job } from "@personal-job-automation/shared/types";

const candidate = (overrides: Partial<CandidateProfile> = {}): CandidateProfile => ({
  isActive: true,
  personal: {
    firstName: "Asha",
    professionalSummary: "Backend engineer building reliable APIs.",
  },
  contact: { email: "asha@example.com" },
  yearsOfExperience: 4,
  experience: [{ company: "Acme", role: "Backend Engineer", years: 4 }],
  education: [{ institution: "Example University", degree: "BTech" }],
  skills: ["TypeScript", "Node.js"],
  technologies: ["PostgreSQL", "Redis"],
  projects: [{ name: "Payments API", description: "A Node.js payments service" }],
  certifications: [],
  preferredRoles: ["Backend Engineer"],
  preferredLocations: ["Remote"],
  remotePreference: "remote",
  verifiedInformation: {},
  relatedTechnology: [],
  unknownInformation: [],
  ...overrides,
});

const job = (overrides: Partial<Job> = {}): Job => ({
  title: "Senior Backend Engineer",
  normalizedTitle: "senior backend engineer",
  company: "Acme",
  normalizedCompany: "acme",
  description: "Use Node.js and PostgreSQL. Please include a cover letter.",
  location: "Remote",
  remoteStatus: "remote",
  requiredSkills: ["Node.js", "PostgreSQL", "Kubernetes"],
  preferredSkills: [],
  relatedSkills: [],
  source: "company",
  status: "discovered",
  canonicalIdentity: {
    key: "acme:senior-backend-engineer",
    crossSourceKey: "acme:senior-backend-engineer",
    confidence: "strong",
    components: {
      normalizedCompany: "acme",
      normalizedTitle: "senior backend engineer",
    },
  },
  ...overrides,
});

describe("application preparation services", () => {
  it("prioritizes matching existing skills without adding JD-only skills", async () => {
    const resume = await tailorResume(candidate(), job());
    assert.deepEqual(resume.skills.slice(0, 3), ["Node.js", "PostgreSQL", "Redis"]);
    assert.equal(resume.skills.includes("Kubernetes"), false);
    assert.equal(resume.experience[0]?.company, "Acme");
  });

  it("preserves factual experience and does not change years", async () => {
    const resume = await tailorResume(candidate(), job());
    assert.equal(resume.experience[0]?.years, 4);
    assert.equal(resume.projects[0]?.name, "Payments API");
  });

  it("requires a provider for an explicitly requested cover letter", async () => {
    const result = await prepareCoverLetter(candidate(), job());
    assert.equal(result.status, "needs_information");
    assert.deepEqual(result.missingInformation, ["cover letter generation provider"]);
  });

  it("does not generate an unnecessary cover letter", async () => {
    let called = false;
    const result = await prepareCoverLetter(
      candidate(),
      job({ description: "Use Node.js and PostgreSQL." }),
      {
        generateCoverLetter: async () => {
          called = true;
          return "I built a Payments API with Node.js.";
        },
      },
    );
    assert.equal(result.status, "not_required");
    assert.equal(called, false);
  });

  it("accepts only grounded provider cover-letter output", async () => {
    const provider: PreparationLlmProvider = {
      generateCoverLetter: async () => "I built a Payments API with Node.js.",
    };
    assert.equal(
      (await prepareCoverLetter(candidate(), job(), provider)).status,
      "ready_for_review",
    );
    const ungrounded: PreparationLlmProvider = {
      generateCoverLetter: async () => "I won a fictional award.",
    };
    assert.equal(
      (await prepareCoverLetter(candidate(), job(), ungrounded)).status,
      "needs_information",
    );
  });

  it("rejects mixed truthful and fabricated cover letters without retaining content", async () => {
    const provider: PreparationLlmProvider = {
      generateCoverLetter: async () =>
        "I have experience with Node.js and TypeScript.\n" +
        "I previously led 30 engineers at Google.",
    };
    const result = await prepareCoverLetter(candidate(), job(), provider);
    assert.equal(result.status, "needs_information");
    assert.equal("content" in result, false);
  });

  it("answers known profile questions and marks sensitive unknowns for review", async () => {
    const answers = await prepareApplicationAnswers(candidate(), job());
    assert.deepEqual(answers.find((answer) => answer.question === "Years of experience"), {
      question: "Years of experience",
      status: "known",
      answer: "4",
      source: "candidate.yearsOfExperience",
    });
    assert.equal(
      answers.find((answer) => answer.question === "Expected salary")?.status,
      "missing",
    );
    assert.equal(
      answers.find((answer) => answer.question === "Work authorization")?.status,
      "missing",
    );
  });

  it("creates a reviewable preparation result without inventing missing data", async () => {
    const result = await prepareApplication(candidate(), job());
    assert.equal(result.status, "needs_information");
    assert.equal(result.tailoredResume.skills.includes("Kubernetes"), false);
    assert.ok(result.missingInformation.includes("Expected salary"));
    assert.equal(result.coverLetter.status, "needs_information");
    assert.equal(result.generationMetadata.deterministicMatchingRemainsAuthoritative, true);
  });

  it("supports grounded generated answers through a replaceable provider", async () => {
    const provider: PreparationLlmProvider = {
      generateAnswer: async (question) =>
        question === "Why are you interested in this role?"
          ? "I am interested in building APIs with Node.js."
          : "I build services with TypeScript.",
    };
    const answers = await prepareApplicationAnswers(candidate(), job(), provider);
    assert.equal(
      answers.find((answer) => answer.question === "Why are you interested in this role?")
        ?.status,
      "generated",
    );
  });

  it("requires review for an ungrounded generated answer", async () => {
    const provider: PreparationLlmProvider = {
      generateAnswer: async () => "I managed a team of 20 engineers at Google.",
    };
    const answers = await prepareApplicationAnswers(candidate(), job(), provider);
    const answer = answers.find(
      (item) => item.question === "Why are you interested in this role?",
    );
    assert.equal(answer?.status, "requires_review");
    assert.equal(answer?.answer, undefined);
  });

  it("rejects mixed truthful and fabricated generated answers", async () => {
    const provider: PreparationLlmProvider = {
      generateAnswer: async () =>
        "I have experience building Node.js applications and TypeScript services.\n" +
        "I also led a team of 20 engineers at Google and managed systems processing millions of requests per second.",
    };
    const answers = await prepareApplicationAnswers(candidate(), job(), provider);
    const answer = answers.find(
      (item) => item.question === "Why are you interested in this role?",
    );
    assert.equal(answer?.status, "requires_review");
    assert.equal(answer?.answer, undefined);
  });

  it("rejects a fabricated claim sharing a sentence with a valid skill", async () => {
    const provider: PreparationLlmProvider = {
      generateAnswer: async () =>
        "I have experience with Node.js and I led a team of 30 engineers at Google.",
    };
    const answers = await prepareApplicationAnswers(candidate(), job(), provider);
    const answer = answers.find(
      (item) => item.question === "Why are you interested in this role?",
    );
    assert.equal(answer?.status, "requires_review");
    assert.equal(answer?.answer, undefined);
  });

  it("rejects fabricated metrics and project achievements", async () => {
    const provider: PreparationLlmProvider = {
      generateAnswer: async () =>
        "I build TypeScript applications and managed systems processing 10 million requests per second.",
    };
    const answers = await prepareApplicationAnswers(candidate(), job(), provider);
    assert.equal(
      answers.find((item) => item.question === "Why are you interested in this role?")?.status,
      "requires_review",
    );

    const projectProvider: PreparationLlmProvider = {
      generateAnswer: async () =>
        "I built Payments API and scaled it to 10 million users.",
    };
    const projectAnswers = await prepareApplicationAnswers(
      candidate(),
      job(),
      projectProvider,
    );
    assert.equal(
      projectAnswers.find(
        (item) => item.question === "Why are you interested in this role?",
      )?.status,
      "requires_review",
    );
  });

  it("accepts independently grounded multi-sentence content", async () => {
    const provider: PreparationLlmProvider = {
      generateAnswer: async () =>
        "I have experience with Node.js.\nI have experience with TypeScript.",
    };
    const answers = await prepareApplicationAnswers(candidate(), job(), provider);
    const answer = answers.find(
      (item) => item.question === "Why are you interested in this role?",
    );
    assert.equal(answer?.status, "generated");
    assert.ok(answer?.answer);
  });

  it("never calls the provider for sensitive missing information", async () => {
    const questions: string[] = [];
    const provider: PreparationLlmProvider = {
      generateAnswer: async (question) => {
        questions.push(question);
        return "Node.js";
      },
    };
    const answers = await prepareApplicationAnswers(candidate(), job(), provider);
    for (const question of [
      "Expected salary",
      "Work authorization",
      "Notice period",
      "Relocation",
    ]) {
      assert.equal(
        answers.find((answer) => answer.question === question)?.status,
        "missing",
      );
      assert.equal(questions.includes(question), false);
    }
  });

  it("rejects an ungrounded resume summary and keeps the factual fallback", async () => {
    const provider: PreparationLlmProvider = {
      tailorResume: async () => ({
        summary: "Senior engineer with 8 years of experience leading large-scale systems.",
      }),
    };
    const resume = await tailorResume(candidate(), job(), provider);
    assert.equal(resume.summary, candidate().personal.professionalSummary);
  });

  it("rejects mixed truthful and fabricated resume summaries", async () => {
    const provider: PreparationLlmProvider = {
      tailorResume: async () => ({
        summary:
          "Full-stack developer with experience building Node.js applications. " +
          "Led a team of 20 engineers at Google and designed infrastructure serving 10 million users.",
      }),
    };
    const resume = await tailorResume(candidate(), job(), provider);
    assert.equal(resume.summary, candidate().personal.professionalSummary);
  });
});
