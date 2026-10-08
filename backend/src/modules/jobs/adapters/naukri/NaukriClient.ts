import type { FetchLike } from "../JobSourceAdapter.js";
import { generateNkparam } from "./naukriNkparam.js";
import { NaukriSourceError, type NaukriJobRecord, type NaukriSearchResponse } from "./NaukriTypes.js";

export const NAUKRI_SEARCH_URL = "https://www.naukri.com/jobapi/v3/search";

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const TOKEN_STATUS = new Set([403, 406]);

export type NaukriSearchInput = {
  keyword: string;
  location: string;
  pageNo: number;
  pageSize: number;
  experienceYears: number;
  jobAgeDays: number;
  timeoutMs: number;
  maxRetries: number;
  signal?: AbortSignal;
};

const seoKey = (keyword: string, location: string, pageNo: number): string => {
  const keywordSlug = keyword.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const locationSlug = location.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${keywordSlug}-jobs-in-${locationSlug}-${pageNo}`;
};

const searchUrl = (input: NaukriSearchInput): string => {
  const params = new URLSearchParams({
    noOfResults: String(input.pageSize),
    urlType: "search_by_keyword",
    searchType: "adv",
    keyword: input.keyword,
    k: input.keyword,
    pageNo: String(input.pageNo),
    experience: String(input.experienceYears),
    l: input.location,
    seoKey: seoKey(input.keyword, input.location, input.pageNo),
    src: "jobsearchDesk",
    nignbevent_src: "jobsearchDeskGNB",
  });
  if (input.jobAgeDays > 0) params.set("jobAge", String(input.jobAgeDays));
  return `${NAUKRI_SEARCH_URL}?${params.toString()}`;
};

const headers = (): Record<string, string> => ({
  accept: "application/json",
  "accept-language": "en-US,en;q=0.9",
  appid: "109",
  systemid: "Naukri",
  clientid: "d3skt0p",
  gid: "LOCATION,INDUSTRY,EDUCATION,FAREA_ROLE",
  nkparam: generateNkparam(),
  referer: "https://www.naukri.com/",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
});

const isTimeout = (error: unknown): boolean =>
  error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");

export class NaukriClient {
  constructor(private readonly fetcher: FetchLike = fetch) {}

  async search(input: NaukriSearchInput): Promise<NaukriJobRecord[]> {
    const url = searchUrl(input);
    const response = await this.request(url, input.timeoutMs, input.maxRetries, input.signal, 0, false);
    let body: NaukriSearchResponse;
    try {
      body = await response.json() as NaukriSearchResponse;
    } catch {
      throw new NaukriSourceError("Naukri response was malformed");
    }
    const jobs = body?.jobDetails ?? body?.jobs;
    if (!Array.isArray(jobs)) throw new NaukriSourceError("Naukri response was malformed");
    return jobs;
  }

  private async request(
    url: string,
    timeoutMs: number,
    maxRetries: number,
    signal: AbortSignal | undefined,
    attempt: number,
    tokenRetried: boolean,
  ): Promise<Response> {
    try {
      const response = await this.fetcher(url, {
        headers: headers(),
        signal: signal ?? AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) return response;
      const retryToken = TOKEN_STATUS.has(response.status) && !tokenRetried;
      const retryTransient = RETRYABLE_STATUS.has(response.status) && attempt < maxRetries;
      if (retryToken || retryTransient) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return this.request(url, timeoutMs, maxRetries, signal, attempt + 1, tokenRetried || TOKEN_STATUS.has(response.status));
      }
      throw new NaukriSourceError(`Naukri fetch failed status=${response.status}`, response.status);
    } catch (error) {
      if (error instanceof NaukriSourceError) throw error;
      if (isTimeout(error) && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return this.request(url, timeoutMs, maxRetries, signal, attempt + 1, tokenRetried);
      }
      const message = error instanceof Error ? error.message : "Naukri request failed";
      throw new NaukriSourceError(isTimeout(error) ? "Naukri request timed out" : message);
    }
  }
}
