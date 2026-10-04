import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  console.error(
    "Unexpected request error:",
    error instanceof Error ? error.message : error,
  );
  const statusCode =
    typeof error === "object" && error !== null && "statusCode" in error
      ? Number(error.statusCode)
      : 500;
  const message =
    process.env.NODE_ENV === "production" && statusCode >= 500
      ? "Something went wrong"
      : error instanceof Error
        ? error.message
        : "Something went wrong";

  response.status(statusCode).json({ success: false, message });
};
