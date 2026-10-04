import type { RequestHandler } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const login: RequestHandler = async (request, response) => {
  const email =
    typeof request.body?.email === "string"
      ? request.body.email.trim().toLowerCase()
      : "";
  const password =
    typeof request.body?.password === "string" ? request.body.password : "";
  const passwordMatches = await bcrypt.compare(
    password,
    await bcrypt.hash(env.adminPassword, 12),
  );

  if (email !== env.adminEmail.toLowerCase() || !passwordMatches) {
    response
      .status(401)
      .json({ success: false, message: "Invalid credentials" });
    return;
  }

  const token = jwt.sign(
    { email: env.adminEmail, role: "admin" },
    env.jwtSecret,
    { expiresIn: "8h" },
  );
  response.json({
    success: true,
    data: { token, user: { email: env.adminEmail, role: "admin" } },
  });
};

export const session: RequestHandler = (request, response) => {
  response.json({ success: true, data: { user: request.session } });
};
