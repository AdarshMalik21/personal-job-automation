import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

type TokenPayload = { email: string; role: "admin" };

export const requireAuth: RequestHandler = (request, response, next) => {
  const token = request.headers.authorization?.startsWith("Bearer ")
    ? request.headers.authorization.slice(7)
    : undefined;

  if (!token) {
    response
      .status(401)
      .json({ success: false, message: "Authentication required" });
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as TokenPayload;
    request.session = { email: payload.email, role: payload.role };
    next();
  } catch {
    response
      .status(401)
      .json({ success: false, message: "Invalid or expired session" });
  }
};
