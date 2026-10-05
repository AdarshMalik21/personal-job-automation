import { normalizeText } from "./text.js";

export const normalizeLocation = (
  location: string | undefined,
): string | undefined => {
  const normalized = location ? normalizeText(location) : undefined;
  if (!normalized) return undefined;
  return normalized === "gurugram" ? "gurgaon" : normalized;
};