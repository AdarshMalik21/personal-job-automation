import { Router } from "express";
import { summary } from "../controllers/dashboardController.js";
import { requireAuth } from "../middleware/auth.js";

export const dashboardRoutes = Router();
dashboardRoutes.get("/summary", requireAuth, summary);
