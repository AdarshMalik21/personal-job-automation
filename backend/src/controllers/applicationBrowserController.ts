import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { isValidObjectId } from "mongoose";
import { ApplicationModel } from "../models/Application.js";
import { ApplicationPreparationModel } from "../models/ApplicationPreparation.js";
import { CandidateProfileModel } from "../models/CandidateProfile.js";
import { JobModel } from "../models/Job.js";
import { activeRuns, browserSessions } from "../modules/applications/browserSession.js";
import { runApplication, type BrowserRunHooks } from "../modules/applications/applicationRunner.js";

const notFound = (response: Parameters<RequestHandler>[1], message: string) => {
  response.status(404).json({ success: false, message });
};

const requestJobId = (request: Parameters<RequestHandler>[0]): string | undefined => {
  const value = request.params.jobId;
  return typeof value === "string" ? value : undefined;
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
    if (activeRuns.has(jobId) || browserSessions.get(jobId)) {
      response.status(409).json({ success: false, message: "A browser run is already active" });
      return;
    }
    const gate = { stopped: false };
    activeRuns.set(jobId, {
      stop: async () => {
        gate.stopped = true;
      },
    });
    let retained = false;
    const hooks: BrowserRunHooks = {
      holdForReview: true,
      isStopped: () => gate.stopped,
      onBrowserCreated: (browser, context) => {
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
          submitting: false,
          isStopped: () => gate.stopped,
          stop: () => {
            gate.stopped = true;
          },
        });
      },
    };
    try {
      const result = await runApplication({
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
      };
      const updated = await ApplicationPreparationModel.findByIdAndUpdate(
        preparation._id,
        { $set: { browserRun: stored } },
        { new: true },
      ).lean();
      response.json({
        success: true,
        data: { browserRun: updated?.browserRun ?? stored },
      });
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
    response.json({ success: true, data: { browserRun: preparation.browserRun } });
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
