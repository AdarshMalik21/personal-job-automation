import { app } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { errorText } from "./config/redact.js";
import { connectRedis, disconnectRedis } from "./config/redis.js";
import { shutdownRuntime } from "./config/shutdown.js";
import type { Server } from "node:http";

const start = async (): Promise<void> => {
  console.info(`Starting API in ${env.nodeEnv}`);
  await Promise.all([connectDatabase(), connectRedis()]);
  const server = app.listen(env.port, () => {
    console.info(`API listening on port ${env.port}`);
  });
  registerShutdown(server);
};

const registerShutdown = (server: Server): void => {
  let stopping = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (stopping) return;
    stopping = true;
    console.info(`Received ${signal}; shutting down`);
    shutdownRuntime({
      closeHttpServer: () => new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
      disconnectDatabase,
      disconnectRedis,
    }).then(() => {
      console.info("Shutdown complete");
      process.exit(0);
    }).catch((error: unknown) => {
      console.error("Shutdown failed:", errorText(error));
      process.exit(1);
    });
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
};

start().catch(async (error: unknown) => {
  console.error("Unable to start API:", errorText(error));
  await disconnectDatabase().catch((disconnectError: unknown) => {
    console.error("MongoDB disconnect failed:", errorText(disconnectError));
  });
  await disconnectRedis().catch((disconnectError: unknown) => {
    console.error("Redis disconnect failed:", errorText(disconnectError));
  });
  process.exit(1);
});
