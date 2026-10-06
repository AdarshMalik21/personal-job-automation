import type { Browser, BrowserContext, Page } from "playwright";

const SESSION_TTL_MS = 20 * 60 * 1000;

export type HeldBrowserSession = {
  jobId: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  createdAt: number;
  submitting: boolean;
  isStopped: () => boolean;
  stop: () => void;
};

const sessions = new Map<string, HeldBrowserSession>();
const stops = new Map<string, { stop: () => Promise<void> }>();

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

export const browserSessions = {
  hold(session: HeldBrowserSession) {
    sessions.set(session.jobId, session);
  },
  get(jobId: string): HeldBrowserSession | undefined {
    const session = sessions.get(jobId);
    if (!session) return undefined;
    const expired = Date.now() - session.createdAt > SESSION_TTL_MS;
    if (!session.submitting && (session.isStopped() || expired)) {
      void this.release(jobId);
      return undefined;
    }
    return session;
  },
  async release(jobId: string) {
    const session = sessions.get(jobId);
    sessions.delete(jobId);
    await session?.context.close().catch(() => undefined);
    await session?.browser.close().catch(() => undefined);
  },
  clearForTests() {
    sessions.clear();
    stops.clear();
  },
};
