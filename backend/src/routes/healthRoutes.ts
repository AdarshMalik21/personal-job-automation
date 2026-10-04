import { Router } from "express";
import { health, systemHealth } from "../controllers/healthController.js";

export const healthRoutes = Router();
healthRoutes.get("/health", health);
healthRoutes.get("/health/system", systemHealth);
