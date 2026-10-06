import { Router } from "express";
import {
  getPreparation,
  prepare,
} from "../controllers/applicationPreparationController.js";
import {
  browserRun,
  getBrowserRun,
  stopBrowserRun,
} from "../controllers/applicationBrowserController.js";
import { requireAuth } from "../middleware/auth.js";

export const applicationRoutes = Router();
applicationRoutes.use(requireAuth);
applicationRoutes.post("/:jobId/prepare", prepare);
applicationRoutes.get("/:jobId/preparation", getPreparation);
applicationRoutes.post("/:jobId/browser-run", browserRun);
applicationRoutes.get("/:jobId/browser-run", getBrowserRun);
applicationRoutes.post("/:jobId/browser-run/stop", stopBrowserRun);
