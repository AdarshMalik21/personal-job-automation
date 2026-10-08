export const DEFAULT_NAUKRI_QUERIES = [
  "MERN Developer",
  "Full Stack Developer",
  "Full Stack Engineer",
  "React Node Developer",
] as const;

export const DEFAULT_NAUKRI_LOCATIONS = [
  "Delhi NCR",
  "Noida",
  "Gurgaon",
  "Remote",
] as const;

export type NaukriConfig = {
  enabled: boolean;
  queries: string[];
  locations: string[];
  maxPages: number;
  maxJobsPerQuery: number;
  pageSize: number;
  timeoutMs: number;
  delayMs: number;
  maxRetries: number;
  experienceYears: number;
  jobAgeDays: number;
  urlConcurrency: number;
  maxUrlResolutions: number;
};

const integer = (
  source: Record<string, string | undefined>,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number => {
  const raw = source[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
};

const list = (
  source: Record<string, string | undefined>,
  name: string,
  fallback: readonly string[],
): string[] => {
  const raw = source[name]?.trim();
  if (!raw) return [...fallback];
  const values = raw.split(",").map((item) => item.trim()).filter(Boolean);
  if (values.length === 0) throw new Error(`${name} must list at least one value`);
  return values;
};

export const readNaukriConfig = (
  source: Record<string, string | undefined> = process.env,
): NaukriConfig => {
  const enabledValue = source.NAUKRI_ENABLED?.trim().toLowerCase();
  return {
    enabled: enabledValue !== "false" && enabledValue !== "0",
    queries: list(source, "NAUKRI_QUERIES", DEFAULT_NAUKRI_QUERIES),
    locations: list(source, "NAUKRI_LOCATIONS", DEFAULT_NAUKRI_LOCATIONS),
    maxPages: integer(source, "NAUKRI_MAX_PAGES", 3, 1, 20),
    maxJobsPerQuery: integer(source, "NAUKRI_MAX_JOBS_PER_QUERY", 50, 1, 200),
    pageSize: integer(source, "NAUKRI_PAGE_SIZE", 20, 1, 50),
    timeoutMs: integer(source, "NAUKRI_REQUEST_TIMEOUT_MS", 15_000, 1_000, 60_000),
    delayMs: integer(source, "NAUKRI_REQUEST_DELAY_MS", 400, 0, 10_000),
    maxRetries: integer(source, "NAUKRI_MAX_RETRIES", 2, 0, 3),
    experienceYears: integer(source, "NAUKRI_EXPERIENCE_YEARS", 1, 0, 30),
    jobAgeDays: integer(source, "NAUKRI_JOB_AGE_DAYS", 15, 0, 60),
    urlConcurrency: integer(source, "NAUKRI_URL_CONCURRENCY", 2, 1, 4),
    maxUrlResolutions: integer(source, "NAUKRI_MAX_URL_RESOLUTIONS", 80, 0, 400),
  };
};
