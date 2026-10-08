import type { Browser, BrowserContext, Page } from "playwright";

export const BROWSER_INACTIVITY_MS = 30 * 60 * 1000;

export type HeldBrowserSession = {
  jobId: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  createdAt: number;
  lastActivityAt: number;
  submitting: boolean;
  isStopped: () => boolean;
  stop: () => void;
};

export type SessionAssessment = {
  session?: HeldBrowserSession;
  unavailable: "missing" | "expired" | "invalid" | null;
};

const sessions = new Map<string, HeldBrowserSession>();
const stops = new Map<string, { stop: () => Promise<void> }>();

const hasMethod = (value: object, name: string) =>
  typeof (value as Record<string, unknown>)[name] === "function";

export const sessionIsLive = (session: Pick<HeldBrowserSession, "browser" | "context" | "page">): boolean => {
  try {
    const connected = hasMethod(session.browser, "isConnected") ? session.browser.isConnected() : true;
    const contextOpen = hasMethod(session.context, "isClosed") ? !session.context.isClosed() : true;
    const pageOpen = hasMethod(session.page, "isClosed") ? !session.page.isClosed() : true;
    return connected === true && contextOpen && pageOpen;
  } catch {
    return false;
  }
};

export const activeRuns = {
  has: (jobId: string) => stops.has(jobId),
  get: (jobId: string) => stops.get(jobId),
  set: (jobId: string, run: { stop: () => Promise<void> }) => {
    stops.set(jobId, run);
  },
  delete: (jobId: string) => {
    stops.delete(jobId);
  },
};

const assessSession = (jobId: string): SessionAssessment => {
  const session = sessions.get(jobId);
  if (!session) return { unavailable: "missing" };
  if (!session.submitting && session.isStopped()) {
    void browserSessions.release(jobId);
    return { unavailable: "invalid" };
  }
  if (!session.submitting && Date.now() - session.lastActivityAt > BROWSER_INACTIVITY_MS) {
    console.info(`[ApplicationBrowser] Browser session expired jobId=${jobId}`);
    void browserSessions.release(jobId);
    return { unavailable: "expired" };
  }
  if (!session.submitting && !sessionIsLive(session)) {
    console.info(`[ApplicationBrowser] Browser session invalidated jobId=${jobId}`);
    void browserSessions.release(jobId);
    return { unavailable: "invalid" };
  }
  return { session, unavailable: null };
};

export const browserSessions = {
  hold(session: Omit<HeldBrowserSession, "lastActivityAt"> & { lastActivityAt?: number }) {
    const held: HeldBrowserSession = {
      ...session,
      lastActivityAt: session.lastActivityAt ?? Date.now(),
    };
    sessions.set(session.jobId, held);
    console.info(`[ApplicationBrowser] Browser session held jobId=${session.jobId}`);
  },
  assess: assessSession,
  touch(jobId: string) {
    const session = sessions.get(jobId);
    if (!session || !sessionIsLive(session)) return;
    session.lastActivityAt = Date.now();
  },
  get(jobId: string, options?: { touch?: boolean }): HeldBrowserSession | undefined {
    const assessed = assessSession(jobId);
    if (assessed.session && options?.touch) assessed.session.lastActivityAt = Date.now();
    return assessed.session;
  },
  async release(jobId: string) {
    const session = sessions.get(jobId);
    if (!session || sessions.get(jobId) !== session) return;
    const stopAtStart = stops.get(jobId);
    sessions.delete(jobId);
    if (stops.get(jobId) === stopAtStart) stops.delete(jobId);
    const closeQuietly = async (close: unknown) => {
      if (typeof close !== "function") return;
      try {
        await (close as () => unknown)();
      } catch {
        // Cleanup is idempotent and must not surface to the request.
      }
    };
    await closeQuietly(session.page?.close);
    await closeQuietly(session.context?.close);
    await closeQuietly(session.browser?.close);
  },
  clearForTests() {
    sessions.clear();
    stops.clear();
  },
};
