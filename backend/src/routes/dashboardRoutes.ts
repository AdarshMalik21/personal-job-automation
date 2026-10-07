import { Router } from "express";
import { dailySelection, summary } from "../controllers/dashboardController.js";
import { requireAuth } from "../middleware/auth.js";

export const dashboardRoutes = Router();
dashboardRoutes.get("/summary", requireAuth, summary);
dashboardRoutes.get("/daily-selection", requireAuth, dailySelection);
