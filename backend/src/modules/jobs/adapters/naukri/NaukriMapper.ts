import type { RawJobInput } from "../../types/rawJob.js";
import type { NaukriJobRecord } from "./NaukriTypes.js";

const text = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  return cleaned || undefined;
};

const absoluteListingUrl = (record: NaukriJobRecord): string | undefined => {
  const path = text(record.jdURL);
  if (!path) return undefined;
  if (path.startsWith("https://") || path.startsWith("http://")) return path;
  if (path.startsWith("/")) return `https://www.naukri.com${path}`;
  return undefined;
};

const postedDate = (value: NaukriJobRecord["createdDate"]): string | undefined => {
  if (typeof value === "number" && value > 1_000_000_000_000) return new Date(value).toISOString();
  if (typeof value === "string" && /^\d{13}$/.test(value)) return new Date(Number(value)).toISOString();
  return undefined;
};

const placeholder = (record: NaukriJobRecord, type: string): string | undefined =>
  text(record.placeholders?.find((item) => item.type === type)?.label);

export const mapNaukriJob = (record: NaukriJobRecord): RawJobInput | undefined => {
  const title = text(record.title);
  const company = text(record.companyName);
  const externalJobId = record.jobId === undefined ? undefined : String(record.jobId).trim();
  if (!title || !company || !externalJobId) return undefined;
  const location = placeholder(record, "location");
  const experience = text(record.experienceText) ?? placeholder(record, "experience");
  const skills = (text(record.tagsAndSkills) ?? "").split(",").map((skill) => skill.trim()).filter(Boolean);
  const description = text(record.jobDescription);
  const sourceUrl = absoluteListingUrl(record);
  const posted = postedDate(record.createdDate);
  const remote = location && /\bremote\b/i.test(location)
    ? (/\bhybrid\b/i.test(location) ? "hybrid" : "remote")
    : location && /\bhybrid\b/i.test(location)
      ? "hybrid"
      : undefined;
  return {
    source: "naukri",
    externalJobId,
    title,
    company,
    ...(description ? { description } : {}),
    ...(location ? { location } : {}),
    ...(remote ? { remoteStatus: remote } : {}),
    ...(experience ? { experienceRequirement: experience } : {}),
    ...(skills.length > 0 ? { requiredSkills: skills } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(posted ? { postedDate: posted } : {}),
    analysis: {
      applicationUrlType: record.companyApplyJob === false ? "NAUKRI_INTERNAL" : "UNKNOWN_EXTERNAL",
      companyApplyJob: record.companyApplyJob === true,
    },
  };
};
