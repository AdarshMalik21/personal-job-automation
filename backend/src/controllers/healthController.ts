import type { RequestHandler } from "express";
import { getDatabaseStatus } from "../config/database.js";
import { getRedisStatus } from "../config/redis.js";

export const health: RequestHandler = (_request, response) => {
  response.json({ success: true, message: "API is running" });
};

export const systemHealth: RequestHandler = (_request, response) => {
  const database = getDatabaseStatus();
  const redis = getRedisStatus();
  response.json({
    success: true,
    data: {
      api: "connected",
      database,
      redis,
      status:
        database === "connected" && redis === "connected"
          ? "healthy"
          : "degraded",
    },
  });
};
