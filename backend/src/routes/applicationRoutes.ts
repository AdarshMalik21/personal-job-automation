import { Router } from "express";
import {
  getPreparation,
  prepare,
} from "../controllers/applicationPreparationController.js";
import { requireAuth } from "../middleware/auth.js";

export const applicationRoutes = Router();
applicationRoutes.use(requireAuth);
applicationRoutes.post("/:jobId/prepare", prepare);
applicationRoutes.get("/:jobId/preparation", getPreparation);
