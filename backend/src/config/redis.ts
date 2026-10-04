import { createClient, type RedisClientType } from "redis";
import { env } from "./env.js";

export const redisClient: RedisClientType = createClient({ url: env.redisUrl });
let connected = false;

redisClient.on("ready", () => {
  connected = true;
});
redisClient.on("end", () => {
  connected = false;
});
redisClient.on("error", (error) => {
  connected = false;
  console.error("Redis connection error:", error.message);
});

export const connectRedis = async (): Promise<void> => {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Redis connection timed out")), 5000);
  });

  try {
    await Promise.race([redisClient.connect(), timeout]);
    console.info("Redis connected");
  } catch (error) {
    connected = false;
    console.error(
      "Redis unavailable:",
      error instanceof Error ? error.message : error,
    );
    if (redisClient.isOpen) await redisClient.disconnect();
  }
};

export const getRedisStatus = (): "connected" | "disconnected" =>
  connected ? "connected" : "disconnected";
