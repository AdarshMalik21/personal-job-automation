export type ApplicationDestination =
  | "GREENHOUSE"
  | "LEVER"
  | "ASHBY"
  | "COMPANY_CAREER_PAGE"
  | "WORKDAY"
  | "NAUKRI_INTERNAL"
  | "UNKNOWN_EXTERNAL";

const RANK: Record<ApplicationDestination, number> = {
  UNKNOWN_EXTERNAL: 0,
  NAUKRI_INTERNAL: 1,
  WORKDAY: 4,
  ASHBY: 5,
  LEVER: 6,
  GREENHOUSE: 7,
  COMPANY_CAREER_PAGE: 8,
};

const hostname = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.hostname.toLowerCase();
  } catch {
    return undefined;
  }
};

export const classifyApplicationUrl = (url: string | undefined): ApplicationDestination => {
  const host = hostname(url);
  if (!host) return "UNKNOWN_EXTERNAL";
  if (host === "naukri.com" || host.endsWith(".naukri.com")) return "NAUKRI_INTERNAL";
  if (host === "greenhouse.io" || host.endsWith(".greenhouse.io")) return "GREENHOUSE";
  if (host === "lever.co" || host.endsWith(".lever.co")) return "LEVER";
  if (host === "ashbyhq.com" || host.endsWith(".ashbyhq.com")) return "ASHBY";
  if (host === "myworkdayjobs.com" || host.endsWith(".myworkdayjobs.com") || host === "workday.com" || host.endsWith(".workday.com")) {
    return "WORKDAY";
  }
  return "COMPANY_CAREER_PAGE";
};

export const applicationDestinationRank = (url: string | undefined): number =>
  RANK[classifyApplicationUrl(url)] * 1_000_000;

export const browserAutomationAllowed = (job: { analysis?: unknown }): boolean => {
  const destination = (job.analysis as { applicationUrlType?: unknown } | null | undefined)?.applicationUrlType;
  return destination !== "NAUKRI_INTERNAL";
};
