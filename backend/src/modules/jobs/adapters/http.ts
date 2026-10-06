import type { FetchLike } from "./JobSourceAdapter.js";

export const requestJson = async (
  fetcher: FetchLike,
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<unknown> => {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    const response = await fetcher(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    try {
      return await response.json();
    } catch {
      throw new Error("response JSON is malformed");
    }
  } catch (error) {
    if (timedOut) throw new Error(`request timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
};
