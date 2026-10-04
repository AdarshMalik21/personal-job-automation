import "dotenv/config";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 5000),
  mongodbUri:
    process.env.MONGODB_URI ??
    "mongodb://127.0.0.1:27017/personal_job_automation",
  redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  jwtSecret: required("JWT_SECRET"),
  adminEmail: required("ADMIN_EMAIL"),
  adminPassword: required("ADMIN_PASSWORD"),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
};
