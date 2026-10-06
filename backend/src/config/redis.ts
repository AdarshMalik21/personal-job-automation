import { createClient, type RedisClientType } from "redis";
import { env } from "./env.js";
import { errorText } from "./redact.js";

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
  console.error("Redis connection error:", errorText(error));
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
    const message = errorText(error);
    console.error("Redis unavailable:", message);
    if (redisClient.isOpen) await redisClient.disconnect();
    if (env.production) throw new Error(`Redis connection failed: ${message}`);
  }
};

export const getRedisStatus = (): "connected" | "disconnected" =>
  connected ? "connected" : "disconnected";

export const disconnectRedis = async (): Promise<void> => {
  if (!redisClient.isOpen) return;
  await redisClient.quit();
  connected = false;
  console.info("Redis disconnected");
};
