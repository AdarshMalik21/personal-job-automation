import type { RequestHandler } from "express";

export const requestLogger: RequestHandler = (request, _response, next) => {
  const startedAt = Date.now();
  const method = request.method;
  const path = request.originalUrl;
  _response.on("finish", () => {
    console.info(
      `${method} ${path} ${_response.statusCode} ${Date.now() - startedAt}ms`,
    );
  });
  next();
};
