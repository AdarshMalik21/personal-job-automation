import type { RequestHandler } from "express";
import { ApplicationModel } from "../models/Application.js";
import { ApplicationPreparationModel } from "../models/ApplicationPreparation.js";
import { DailySelectionModel } from "../models/DailySelection.js";
import { JobModel } from "../models/Job.js";
import { getDatabaseStatus } from "../config/database.js";
import { getRedisStatus } from "../config/redis.js";
import { overlayDailyWorkflow } from "../modules/jobs/ranking/dailyWorkflow.js";
import { kolkataParts } from "../scheduler/discoverySchedule.js";

export const summary: RequestHandler = async (_request, response, next) => {
  try {
    if (getDatabaseStatus() !== "connected") {
      response.json({
        success: true,
        data: {
          systemStatus: "degraded",
          databaseStatus: "disconnected",
          redisStatus: getRedisStatus(),
          totalJobs: 0,
          totalApplications: 0,
        },
      });
      return;
    }

    const [totalJobs, totalApplications] = await Promise.all([
      JobModel.countDocuments(),
      ApplicationModel.countDocuments(),
    ]);
    response.json({
      success: true,
      data: {
        systemStatus:
          getDatabaseStatus() === "connected" &&
          getRedisStatus() === "connected"
            ? "healthy"
            : "degraded",
        databaseStatus: getDatabaseStatus(),
        redisStatus: getRedisStatus(),
        totalJobs,
        totalApplications,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const dailySelection: RequestHandler = async (_request, response, next) => {
  try {
    const dateKey = kolkataParts(new Date()).dateKey;
    if (getDatabaseStatus() !== "connected") {
      response.json({
        success: true,
        data: { dateKey, timezone: "Asia/Kolkata", jobs: [], notificationStatus: "none" },
      });
      return;
    }
    const selection = await DailySelectionModel.findOne({ dateKey }).lean();
    const jobs = Array.isArray(selection?.jobs) ? selection.jobs : [];
    const jobIds = jobs
      .map((job) => (job && typeof job === "object" && "jobId" in job ? String(job.jobId) : ""))
      .filter((jobId) => jobId.length > 0);
    const [applications, preparations] = await Promise.all([
      ApplicationModel.find({ jobId: { $in: jobIds } }).select("jobId status").lean(),
      ApplicationPreparationModel.find({ jobId: { $in: jobIds } }).select("jobId status missingInformation").lean(),
    ]);
    response.json({
      success: true,
      data: {
        dateKey,
        timezone: "Asia/Kolkata",
        jobs: overlayDailyWorkflow(
          jobs as Array<{ jobId: string; applicationStatus: string }>,
          applications.map((item) => ({ jobId: String(item.jobId), status: item.status })),
          preparations.map((item) => ({
            jobId: String(item.jobId),
            status: item.status,
            missingInformation: Array.isArray(item.missingInformation)
              ? item.missingInformation.filter((entry): entry is string => typeof entry === "string")
              : [],
          })),
        ),
        notificationStatus: selection?.notificationStatus ?? "none",
      },
    });
  } catch (error) {
    next(error);
  }
};
