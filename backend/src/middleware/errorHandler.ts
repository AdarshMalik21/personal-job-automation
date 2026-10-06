import type { ErrorRequestHandler } from "express";
import { redactSecrets } from "../config/redact.js";

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  const safeMessage = redactSecrets(error instanceof Error ? error.message : "Something went wrong");
  console.error("Unexpected request error:", safeMessage);
  const statusCode =
    typeof error === "object" && error !== null && "statusCode" in error
      ? Number(error.statusCode)
      : 500;
  const message =
    process.env.NODE_ENV === "production" && statusCode >= 500
      ? "Something went wrong"
      : safeMessage;

  response.status(statusCode).json({ success: false, message });
};
