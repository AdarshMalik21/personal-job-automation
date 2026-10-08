import type { FetchLike } from "../JobSourceAdapter.js";
import {
  classifyApplicationUrl,
  type ApplicationDestination,
} from "../../services/applicationDestination.js";

const MAX_REDIRECTS = 5;
const ATS_URL = /https?:\/\/(?:[\w.-]+\.)?(?:greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|workday\.com)\/[^\s"'<>]*/gi;

export type ResolvedApplicationUrl = {
  finalUrl?: string;
  type: ApplicationDestination;
  reason?: string;
};

const safeUrl = (value: string, base?: string): string | undefined => {
  try {
    const parsed = new URL(value, base);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
};

const officialUrlInHtml = (html: string): string | undefined => {
  const match = html.match(ATS_URL)?.[0]?.replace(/[),.;]+$/, "");
  return match ? safeUrl(match) : undefined;
};

const timedOut = (error: unknown): boolean =>
  error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");

export const resolveApplicationDestination = async (
  startUrl: string,
  options: { fetcher: FetchLike; timeoutMs: number },
): Promise<ResolvedApplicationUrl> => {
  const seen = new Set<string>();
  const start = safeUrl(startUrl);
  if (!start) return { type: "UNKNOWN_EXTERNAL", reason: "unsafe URL" };
  let current = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (seen.has(current)) return { type: "UNKNOWN_EXTERNAL", reason: "redirect loop" };
    seen.add(current);
    let response: Response;
    try {
      response = await options.fetcher(current, {
        method: "GET",
        redirect: "manual",
        headers: { accept: "text/html,application/json", "user-agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      return { type: "UNKNOWN_EXTERNAL", reason: timedOut(error) ? "timeout" : "request failed" };
    }
    if (response.status === 301 || response.status === 302 || response.status === 303 || response.status === 307 || response.status === 308) {
      const location = response.headers.get("location");
      const nextUrl = location ? safeUrl(location, current) : undefined;
      if (!nextUrl) return { type: "UNKNOWN_EXTERNAL", reason: "redirect missing location" };
      current = nextUrl;
      continue;
    }
    if (response.status === 403 || response.status === 429 || response.status >= 500) {
      return { type: "UNKNOWN_EXTERNAL", reason: `HTTP ${response.status}` };
    }
    const type = classifyApplicationUrl(current);
    if (type === "UNKNOWN_EXTERNAL") return { type: "UNKNOWN_EXTERNAL" };
    if (type === "NAUKRI_INTERNAL") {
      const html = await response.text().catch(() => "");
      const external = officialUrlInHtml(html);
      if (external) {
        const externalType = classifyApplicationUrl(external);
        return externalType === "COMPANY_CAREER_PAGE" || externalType === "UNKNOWN_EXTERNAL"
          ? { type: "NAUKRI_INTERNAL" }
          : { finalUrl: external, type: externalType };
      }
      return { type: "NAUKRI_INTERNAL" };
    }
    return { finalUrl: current, type };
  }
  return { type: "UNKNOWN_EXTERNAL", reason: "redirect limit" };
};
