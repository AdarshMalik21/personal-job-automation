import type { RequestHandler } from "express";
import { isValidObjectId } from "mongoose";
import { ApplicationPreparationModel } from "../models/ApplicationPreparation.js";
import { CandidateProfileModel } from "../models/CandidateProfile.js";
import { JobModel } from "../models/Job.js";
import { runApplication } from "../modules/applications/applicationRunner.js";

const notFound = (response: Parameters<RequestHandler>[1], message: string) => {
  response.status(404).json({ success: false, message });
};

const activeRuns = new Set<string>();
const requestJobId = (request: Parameters<RequestHandler>[0]): string | undefined => {
  const value = request.params.jobId;
  return typeof value === "string" ? value : undefined;
};

const loadPreparation = async (jobId: string) => {
  const candidate = await CandidateProfileModel.findOne({ isActive: true })
    .sort({ updatedAt: -1 })
    .lean();
  if (!candidate) return { candidate: undefined, job: undefined, preparation: undefined };
  const [job, preparation] = await Promise.all([
    JobModel.findById(jobId).lean(),
    ApplicationPreparationModel.findOne({
      jobId,
      candidateProfileId: candidate._id,
    }).lean(),
  ]);
  return { candidate, job, preparation };
};

export const browserRun: RequestHandler = async (request, response, next) => {
  try {
    const jobId = requestJobId(request);
    if (!jobId || !isValidObjectId(jobId)) {
      notFound(response, "Job not found");
      return;
    }
    const { job, candidate, preparation } = await loadPreparation(jobId);
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
    if (activeRuns.has(jobId)) {
      response.status(409).json({ success: false, message: "A browser run is already active" });
      return;
    }
    activeRuns.add(jobId);
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
      });
      const updated = await ApplicationPreparationModel.findByIdAndUpdate(
        preparation._id,
        { $set: { browserRun: { ...result, completedAt: new Date() } } },
        { new: true },
      ).lean();
      response.json({
        success: true,
        data: { browserRun: updated?.browserRun ?? result },
      });
    } finally {
      activeRuns.delete(jobId);
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
    const { preparation: existingPreparation } = await loadPreparation(jobId);
    if (!existingPreparation) {
      notFound(response, "Application preparation not found");
      return;
    }
    const preparation = await ApplicationPreparationModel.findByIdAndUpdate(
      existingPreparation._id,
      {
        $set: {
          browserRun: {
            status: "PAUSED_FOR_REVIEW",
            reason: "Browser run stopped by user",
            completedAt: new Date(),
          },
        },
      },
      { new: true },
    ).lean();
    if (!preparation) {
      notFound(response, "Application preparation not found");
      return;
    }
    response.json({ success: true, data: { browserRun: preparation.browserRun } });
  } catch (error) {
    next(error);
  }
};
