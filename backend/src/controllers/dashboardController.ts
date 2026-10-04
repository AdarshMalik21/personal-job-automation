import type { RequestHandler } from "express";
import { ApplicationModel } from "../models/Application.js";
import { JobModel } from "../models/Job.js";
import { getDatabaseStatus } from "../config/database.js";
import { getRedisStatus } from "../config/redis.js";

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
