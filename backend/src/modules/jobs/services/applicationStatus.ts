export type OpenStatus = "open" | "closed" | "unknown";

export type UrlValidationStatus =
  | "reachable"
  | "unreachable"
  | "invalid"
  | "unknown";

export type UrlValidationResult = {
  status: UrlValidationStatus;
  statusCode?: number;
  reason: string;
};

export type UrlFetcher = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export const validateApplicationUrl = async (
  url: string | undefined,
  options: { fetcher?: UrlFetcher; timeoutMs?: number } = {},
): Promise<UrlValidationResult> => {
  if (!url)
    return { status: "unknown", reason: "No application URL is available" };
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol))
      throw new Error("URL must use HTTP or HTTPS");
  } catch (error) {
    return {
      status: "invalid",
      reason:
        error instanceof Error ? error.message : "Application URL is invalid",
    };
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 5_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetcher ?? fetch)(url, {
      method: "HEAD",
      signal: controller.signal,
    });
    if (response.status === 404 || response.status === 410) {
      return {
        status: "unreachable",
        statusCode: response.status,
        reason: `Application URL returned HTTP ${response.status}`,
      };
    }
    if (response.status >= 200 && response.status < 400) {
      return {
        status: "reachable",
        statusCode: response.status,
        reason: "Application URL responded successfully",
      };
    }
    return {
      status: "unknown",
      statusCode: response.status,
      reason: `Application URL returned HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      status: "unknown",
      reason:
        error instanceof Error
          ? error.message
          : "Application URL could not be checked",
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const deriveOpenStatus = (
  urlValidation: UrlValidationResult,
): OpenStatus => {
  if (
    urlValidation.status === "unreachable" ||
    urlValidation.status === "invalid"
  )
    return "closed";
  return "unknown";
};
