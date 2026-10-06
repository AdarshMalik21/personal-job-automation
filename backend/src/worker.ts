import { connectDatabase, disconnectDatabase, getDatabaseStatus } from "./config/database.js";
import { errorText } from "./config/redact.js";
import { connectRedis, disconnectRedis, getRedisStatus, redisClient } from "./config/redis.js";
import { shutdownRuntime } from "./config/shutdown.js";
import { JobQueue } from "./queue/jobQueue.js";
import { createRedisCommands } from "./queue/redisCommands.js";
import { discoveryHandlers, runWorkerLoop } from "./worker/workerRuntime.js";

const start = async (): Promise<void> => {
  console.info("Worker started");
  await connectDatabase();
  if (getDatabaseStatus() !== "connected") throw new Error("MongoDB connection failed");
  await connectRedis();
  if (getRedisStatus() !== "connected") throw new Error("Redis connection failed");

  const commands = createRedisCommands(redisClient);
  const queue = new JobQueue(commands);
  await queue.recoverProcessing();
  let running = true;
  const stop = (signal: NodeJS.Signals) => {
    if (!running) return;
    running = false;
    console.info(`Shutdown started signal=${signal}`);
  };
  process.once("SIGTERM", () => stop("SIGTERM"));
  process.once("SIGINT", () => stop("SIGINT"));

  await runWorkerLoop({
    queue,
    handlers: discoveryHandlers(),
    reserve: (key) => commands.setNx(key, "1"),
    release: (key) => commands.del(key),
    isRunning: () => running,
  });

  await shutdownRuntime({ disconnectDatabase, disconnectRedis });
  console.info("Shutdown completed");
  process.exit(0);
};

start().catch(async (error: unknown) => {
  console.error("Worker failed:", errorText(error));
  await disconnectDatabase().catch((disconnectError: unknown) => {
    console.error("MongoDB disconnect failed:", errorText(disconnectError));
  });
  await disconnectRedis().catch((disconnectError: unknown) => {
    console.error("Redis disconnect failed:", errorText(disconnectError));
  });
  process.exit(1);
});
