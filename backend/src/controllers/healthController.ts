import type { RequestHandler } from "express";
import { getDatabaseStatus } from "../config/database.js";
import { getRedisStatus } from "../config/redis.js";
import { buildHealthReport, buildSystemHealthReport } from "./healthStatus.js";

export const health: RequestHandler = (_request, response) => {
  response.json(buildHealthReport());
};

export const systemHealth: RequestHandler = (_request, response) => {
  response.json(buildSystemHealthReport(getDatabaseStatus(), getRedisStatus()));
};
