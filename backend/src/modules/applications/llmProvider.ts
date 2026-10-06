import type { PreparationContext } from "./types.js";

export type PreparationLlmProvider = {
  tailorResume?: (
    context: PreparationContext,
  ) => Promise<{ summary?: string }>;
  generateCoverLetter?: (context: PreparationContext) => Promise<string>;
  generateAnswer?: (
    question: string,
    context: PreparationContext,
  ) => Promise<string>;
};

export const unavailablePreparationLlmProvider: PreparationLlmProvider = {};
