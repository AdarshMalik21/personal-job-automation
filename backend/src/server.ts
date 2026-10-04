import { app } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { connectRedis } from "./config/redis.js";

const start = async (): Promise<void> => {
  await Promise.all([connectDatabase(), connectRedis()]);
  app.listen(env.port, () => {
    console.info(`API listening on http://localhost:${env.port}`);
  });
};

start().catch((error: unknown) => {
  console.error(
    "Unable to start API:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
