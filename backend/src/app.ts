import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { authRoutes } from "./routes/authRoutes.js";
import { dashboardRoutes } from "./routes/dashboardRoutes.js";
import { healthRoutes } from "./routes/healthRoutes.js";

export const app = express();

app.use(cors({ origin: env.frontendUrl }));
app.use(express.json({ limit: "1mb" }));
app.use(requestLogger);
app.use("/api", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use((_request, response) => {
  response.status(404).json({ success: false, message: "Route not found" });
});
app.use(errorHandler);
