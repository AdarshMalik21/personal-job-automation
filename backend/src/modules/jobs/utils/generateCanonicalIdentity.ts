import { createHash } from "node:crypto";
import type { CanonicalIdentity } from "@personal-job-automation/shared/types";
import type { CanonicalIdentityInput } from "../types/canonicalJob.js";

const hash = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const urlKey = (url: string): string => {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    parsed.search = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString();
  } catch {
    return url.trim().toLowerCase();
  }
};

export const generateCanonicalIdentity = (
  input: CanonicalIdentityInput,
): CanonicalIdentity => {
  const components = {
    normalizedCompany: input.normalizedCompany,
    normalizedTitle: input.normalizedTitle,
    ...(input.normalizedLocation ? { normalizedLocation: input.normalizedLocation } : {}),
    ...(input.normalizedEmploymentType
      ? { normalizedEmploymentType: input.normalizedEmploymentType }
      : {}),
  };
  const crossSourceValue = [
    components.normalizedCompany,
    components.normalizedTitle,
    components.normalizedLocation ?? "",
    components.normalizedEmploymentType ?? "",
  ].join("|");
  const crossSourceKey = hash(`cross-source|${crossSourceValue}`);
  const strongValue = input.externalJobId
    ? `${input.source}|${input.externalJobId.trim()}`
    : input.officialApplicationUrl
      ? urlKey(input.officialApplicationUrl)
      : undefined;
  const strongKey = strongValue ? hash(`strong|${strongValue}`) : undefined;

  return {
    key: crossSourceKey,
    ...(strongKey ? { strongKey } : {}),
    crossSourceKey,
    confidence: strongKey ? "strong" : input.normalizedLocation ? "probable" : "weak",
    components,
  };
};