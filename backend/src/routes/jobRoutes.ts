import { Router } from "express";
import { discoveryHandlers } from "../controllers/jobDiscoveryController.js";
import {
  getJob,
  listJobs,
  markReviewed,
  markSkipped,
  stats,
} from "../controllers/jobsController.js";
import { requireAuth } from "../middleware/auth.js";

export const jobRoutes = Router();
jobRoutes.use(requireAuth);
jobRoutes.post("/discovery/run", discoveryHandlers.run);
jobRoutes.get("/discovery/runs/:jobId", discoveryHandlers.status);
jobRoutes.get("/stats", stats);
jobRoutes.get("/", listJobs);
jobRoutes.get("/:id", getJob);
jobRoutes.patch("/:id/review", markReviewed);
jobRoutes.patch("/:id/skip", markSkipped);