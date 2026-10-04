import { Router } from "express";
import { login, session } from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";

export const authRoutes = Router();
authRoutes.post("/login", login);
authRoutes.get("/session", requireAuth, session);
