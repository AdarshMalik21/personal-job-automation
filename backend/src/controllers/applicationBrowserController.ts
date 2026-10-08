import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { isValidObjectId } from "mongoose";
import { ApplicationModel } from "../models/Application.js";
import { ApplicationPreparationModel } from "../models/ApplicationPreparation.js";
import { CandidateProfileModel } from "../models/CandidateProfile.js";
import { JobModel } from "../models/Job.js";
import { errorText } from "../config/redact.js";
import { activeRuns, browserSessions } from "../modules/applications/browserSession.js";
import { runApplication, type BrowserRunHooks } from "../modules/applications/applicationRunner.js";

const notFound = (response: Parameters<RequestHandler>[1], message: string) => {
  response.status(404).json({ success: false, message });
};

const requestJobId = (request: Parameters<RequestHandler>[0]): string | undefined => {
  const value = request.params.jobId;
  return typeof value === "string" ? value : undefined;
};

type BrowserRunner = typeof runApplication;
let browserRunner: BrowserRunner = runApplication;

export const useBrowserRunnerForTests = (runner?: BrowserRunner) => {
  browserRunner = runner ?? runApplication;
};

const reviewableStatus = (status: unknown) =>
  status === "PAUSED_FOR_REVIEW" || status === "READY_FOR_SUBMISSION" || status === "SUBMITTING";

const humanBrowserFailure = (reason: unknown) => {
  const text = typeof reason === "string" ? reason.toLowerCase() : "";
  if (text.includes("timeout") || text.includes("net::") || text.includes("navigation") || text.includes("enotfound") || text.includes("econn")) {
    return "The application page could not be opened.";
  }
  return "Unable to start browser automation.";
};

const expireStoredRun = async (
  jobId: string,
  preparation: { _id: unknown; browserRun?: unknown },
  stored: Record<string, unknown>,
) => {
  const expired = {
    ...stored,
    status: "BROWSER_SESSION_EXPIRED",
    reason: "Browser session expired. Restart Browser Run.",
  };
  await ApplicationPreparationModel.findByIdAndUpdate(preparation._id, { $set: { browserRun: expired } });
  preparation.browserRun = expired;
  console.info(`[ApplicationBrowser] Browser session expired jobId=${jobId}`);
  return { browserRun: expired, sessionAvailable: false as const };
};

export const reconcileBrowserRun = async (
  jobId: string,
  preparation: { _id: unknown; browserRun?: unknown },
) => {
  const stored = { ...((preparation.browserRun ?? {}) as Record<string, unknown>) };
  const assessed = browserSessions.assess(jobId);
  const live = Boolean(assessed.session);
  if (stored.status === "RUNNING" && !live && !activeRuns.has(jobId)) {
    return expireStoredRun(jobId, preparation, stored);
  }
  if (reviewableStatus(stored.status) && !live) {
    return expireStoredRun(jobId, preparation, stored);
  }
  return { browserRun: stored, sessionAvailable: live };
};

const loadPreparation = async (jobId: string) => {
  const candidate = await CandidateProfileModel.findOne({ isActive: true })
    .sort({ updatedAt: -1 })
    .lean();
  if (!candidate) return { candidate: undefined, job: undefined, preparation: undefined, application: undefined };
  const [job, preparation, application] = await Promise.all([
    JobModel.findById(jobId).lean(),
    ApplicationPreparationModel.findOne({
      jobId,
      candidateProfileId: candidate._id,
    }).lean(),
    ApplicationModel.findOne({ jobId, candidateProfileId: candidate._id }).lean(),
  ]);
  return { candidate, job, preparation, application };
};

export const browserRun: RequestHandler = async (request, response, next) => {
  try {
    const jobId = requestJobId(request);
    if (!jobId || !isValidObjectId(jobId)) {
      notFound(response, "Job not found");
      return;
    }
    const { job, candidate, preparation, application } = await loadPreparation(jobId);
    if (!job) {
      notFound(response, "Job not found");
      return;
    }
    if (!candidate) {
      notFound(response, "Active candidate profile not found");
      return;
    }
    if (!preparation) {
      notFound(response, "Application preparation not found");
      return;
    }
    if (application?.status === "submitted") {
      response.status(409).json({ success: false, message: "Already submitted" });
      return;
    }
    const existing = browserSessions.assess(jobId);
    if (activeRuns.has(jobId) || existing.session) {
      response.json({
        success: true,
        data: {
          browserRun: {
            ...(preparation.browserRun ?? {}),
            status: existing.session ? (preparation.browserRun as { status?: string } | undefined)?.status ?? "PAUSED_FOR_REVIEW" : "RUNNING",
            sessionAvailable: Boolean(existing.session),
          },
          alreadyActive: true,
        },
      });
      return;
    }
    const previousStatus = (preparation.browserRun as { status?: string } | undefined)?.status;
    if (previousStatus === "BROWSER_SESSION_EXPIRED" || previousStatus === "FAILED" || existing.unavailable === "expired" || existing.unavailable === "invalid") {
      console.info(`[ApplicationBrowser] Browser session restarted jobId=${jobId}`);
    }
    console.info(`[ApplicationBrowser] Starting browser run jobId=${jobId}`);
    await ApplicationPreparationModel.findByIdAndUpdate(preparation._id, {
      $set: {
        browserRun: {
          ...(typeof preparation.browserRun === "object" && preparation.browserRun ? preparation.browserRun : {}),
          status: "RUNNING",
          reason: "Preparing application",
        },
      },
    });
    const gate = { stopped: false };
    activeRuns.set(jobId, {
      stop: async () => {
        gate.stopped = true;
      },
    });
    let retained = false;
    const hooks: BrowserRunHooks = {
      holdForReview: true,
      jobId,
      isStopped: () => gate.stopped,
      onBrowserCreated: (browser, context) => {
        console.info(`[ApplicationBrowser] Browser launched jobId=${jobId}`);
        activeRuns.set(jobId, {
          stop: async () => {
            gate.stopped = true;
            browserSessions.get(jobId)?.stop();
            await context.close().catch(() => undefined);
            await browser.close().catch(() => undefined);
            await browserSessions.release(jobId);
            activeRuns.delete(jobId);
          },
        });
      },
      onHeld: ({ browser, context, page }) => {
        retained = true;
        browserSessions.hold({
          jobId,
          browser,
          context,
          page,
          createdAt: Date.now(),
          lastActivityAt: Date.now(),
          submitting: false,
          isStopped: () => gate.stopped,
          stop: () => {
            gate.stopped = true;
          },
        });
      },
    };
    try {
      const result = await browserRunner({
        job: {
          ...(job.officialApplicationUrl
            ? { officialApplicationUrl: job.officialApplicationUrl }
            : {}),
          status: job.status,
          match: job.match,
        },
        candidate: candidate as never,
        preparation: preparation as never,
      }, undefined, hooks);
      const stored = {
        ...result,
        runId: randomUUID(),
        completedAt: new Date(),
        stopped: gate.stopped,
        ...(result.status === "FAILED" ? { reason: humanBrowserFailure(result.reason) } : {}),
      };
      if (result.status === "FAILED") {
        console.error(`[ApplicationBrowser] Browser run failed jobId=${jobId} error=${errorText(result.reason)}`);
      }
      const updated = await ApplicationPreparationModel.findByIdAndUpdate(
        preparation._id,
        { $set: { browserRun: stored } },
        { new: true },
      ).lean();
      if (retained) console.info(`[ApplicationBrowser] Application paused for review jobId=${jobId}`);
      response.json({
        success: true,
        data: { browserRun: { ...(updated?.browserRun ?? stored), sessionAvailable: retained } },
      });
    } catch (error) {
      console.error(`[ApplicationBrowser] Browser run failed jobId=${jobId} error=${errorText(error)}`);
      await ApplicationPreparationModel.findByIdAndUpdate(preparation._id, {
        $set: {
          browserRun: {
            ...(preparation.browserRun ?? {}),
            status: "FAILED",
            reason: "Unable to start browser automation.",
          },
        },
      });
      response.status(502).json({ success: false, message: "Unable to start browser automation." });
    } finally {
      if (!retained) activeRuns.delete(jobId);
    }
  } catch (error) {
    next(error);
  }
};

export const getBrowserRun: RequestHandler = async (
  request,
  response,
  next,
) => {
  try {
    const jobId = requestJobId(request);
    if (!jobId || !isValidObjectId(jobId)) {
      notFound(response, "Job not found");
      return;
    }
    const { preparation } = await loadPreparation(jobId);
    if (!preparation) {
      notFound(response, "Application preparation not found");
      return;
    }
    const reconciled = await reconcileBrowserRun(jobId, preparation);
    response.json({ success: true, data: { browserRun: { ...reconciled.browserRun, sessionAvailable: reconciled.sessionAvailable } } });
  } catch (error) {
    next(error);
  }
};

export const stopBrowserRun: RequestHandler = async (
  request,
  response,
  next,
) => {
  try {
    const jobId = requestJobId(request);
    if (!jobId || !isValidObjectId(jobId)) {
      notFound(response, "Job not found");
      return;
    }
    const activeRun = activeRuns.get(jobId);
    const session = browserSessions.get(jobId);
    if (!activeRun && !session) {
      response.status(409).json({ success: false, message: "No active browser run exists" });
      return;
    }
    session?.stop();
    await activeRun?.stop();
    const { preparation } = await loadPreparation(jobId);
    if (preparation) {
      const browserRun = (preparation.browserRun ?? {}) as Record<string, unknown>;
      await ApplicationPreparationModel.findByIdAndUpdate(preparation._id, {
        $set: {
          browserRun: {
            ...browserRun,
            stopped: true,
            reason: "Browser run stopped by user",
          },
        },
      });
    }
    response.status(202).json({ success: true, data: { status: "STOP_REQUESTED" } });
  } catch (error) {
    next(error);
  }
};
