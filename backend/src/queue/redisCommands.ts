import type { RedisClientType } from "redis";
import type { QueueCommands } from "./types.js";

type RedisQueueClient = Pick<
  RedisClientType,
  "set" | "get" | "del" | "lPush" | "lMove" | "lRem" | "lRange" | "zAdd" | "zRange" | "zRem"
>;

export const createRedisCommands = (redis: RedisQueueClient): QueueCommands => ({
  async set(key, value) {
    await redis.set(key, value);
  },
  async setNx(key, value) {
    const result = await redis.set(key, value, { NX: true });
    return result === "OK";
  },
  async get(key) {
    return redis.get(key);
  },
  async del(key) {
    await redis.del(key);
  },
  async push(key, value) {
    await redis.lPush(key, value);
  },
  async moveTailToHead(source, destination) {
    return redis.lMove(source, destination, "RIGHT", "LEFT");
  },
  async remove(key, value) {
    await redis.lRem(key, 1, value);
  },
  async list(key) {
    return redis.lRange(key, 0, -1);
  },
  async schedule(key, score, member) {
    await redis.zAdd(key, { score, value: member });
  },
  async due(key, now) {
    return redis.zRange(key, 0, now, { BY: "SCORE" });
  },
  async unschedule(key, member) {
    return (await redis.zRem(key, member)) > 0;
  },
});
