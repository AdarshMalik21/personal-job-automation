import { Router } from "express";
import {
  getPreparation,
  prepare,
  updatePreparation,
} from "../controllers/applicationPreparationController.js";
import {
  browserRun,
  getBrowserRun,
  stopBrowserRun,
} from "../controllers/applicationBrowserController.js";
import {
  cancelReviewedApplication,
  getReview,
  submitReviewedApplication,
  updateReviewField,
} from "../controllers/applicationReviewController.js";
import {
  evaluateApplicationFollowUps,
  getApplicationAnalytics,
  getApplicationFollowUp,
  getApplicationTracking,
  prepareApplicationFollowUp,
  updateApplicationStatus,
} from "../controllers/applicationTrackingController.js";
import { requireAuth } from "../middleware/auth.js";

export const applicationRoutes = Router();
applicationRoutes.use(requireAuth);
applicationRoutes.post("/:jobId/prepare", prepare);
applicationRoutes.get("/:jobId/preparation", getPreparation);
applicationRoutes.patch("/:jobId/preparation", updatePreparation);
applicationRoutes.post("/:jobId/browser-run", browserRun);
applicationRoutes.get("/:jobId/browser-run", getBrowserRun);
applicationRoutes.post("/:jobId/browser-run/stop", stopBrowserRun);
applicationRoutes.get("/:jobId/review", getReview);
applicationRoutes.patch("/:jobId/review/fields", updateReviewField);
applicationRoutes.post("/:jobId/submit", submitReviewedApplication);
applicationRoutes.post("/:jobId/cancel", cancelReviewedApplication);
applicationRoutes.get("/analytics", getApplicationAnalytics);
applicationRoutes.post("/follow-ups/evaluate", evaluateApplicationFollowUps);
applicationRoutes.get("/:jobId/tracking", getApplicationTracking);
applicationRoutes.patch("/:jobId/status", updateApplicationStatus);
applicationRoutes.get("/:jobId/follow-up", getApplicationFollowUp);
applicationRoutes.post("/:jobId/follow-up", prepareApplicationFollowUp);
