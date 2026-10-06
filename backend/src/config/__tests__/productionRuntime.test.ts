import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readEnv } from "../envConfig.js";
import { redactSecrets } from "../redact.js";
import { shutdownRuntime } from "../shutdown.js";
import { buildHealthReport, buildSystemHealthReport } from "../../controllers/healthStatus.js";

const productionEnv = {
  NODE_ENV: "production",
  PORT: "5000",
  MONGODB_URI: "mongodb+srv://user:secret@cluster.example.net/personal_job_automation",
  REDIS_URL: "redis://:secret@redis.internal:6379",
  JWT_SECRET: "production-secret",
  ADMIN_EMAIL: "admin@example.com",
  ADMIN_PASSWORD: "production-password",
  FRONTEND_URL: "https://jobs.example.com",
};

describe("production configuration", () => {
  it("keeps development defaults when production variables are unset", () => {
    const config = readEnv({
      JWT_SECRET: "development-secret",
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_PASSWORD: "development-password",
    });
    assert.equal(config.production, false);
    assert.equal(config.port, 5000);
    assert.equal(config.mongodbUri, "mongodb://127.0.0.1:27017/personal_job_automation");
    assert.equal(config.redisUrl, "redis://127.0.0.1:6379");
    assert.equal(config.frontendUrl, "http://localhost:3000");
  });

  it("requires explicit production configuration and rejects wildcard CORS", () => {
    const config = readEnv(productionEnv);
    assert.equal(config.production, true);
    assert.equal(config.frontendUrl, "https://jobs.example.com");
    assert.equal(config.mongodbUri, productionEnv.MONGODB_URI);
    for (const name of ["MONGODB_URI", "REDIS_URL", "JWT_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD", "FRONTEND_URL"]) {
      const source: Record<string, string | undefined> = { ...productionEnv };
      delete source[name];
      assert.throws(() => readEnv(source), new RegExp(name));
    }
    assert.throws(() => readEnv({ ...productionEnv, FRONTEND_URL: "*" }), /wildcard/);
    assert.throws(() => readEnv({ ...productionEnv, PORT: "0" }), /PORT/);
  });

  it("removes database and redis connection strings from log text", () => {
    const redacted = redactSecrets(
      `MongoDB unavailable: ${productionEnv.MONGODB_URI} Redis unavailable: ${productionEnv.REDIS_URL}`,
    );
    assert.equal(redacted.includes("secret"), false);
    assert.equal(redacted.includes("mongodb+srv://"), false);
    assert.equal(redacted.includes("redis://"), false);
  });
});

describe("health reports", () => {
  it("reports the API as running and distinguishes MongoDB and Redis", () => {
    assert.deepEqual(buildHealthReport(), { success: true, message: "API is running" });
    assert.deepEqual(buildSystemHealthReport("connected", "disconnected"), {
      success: true,
      data: { application: "running", mongodb: "connected", redis: "disconnected", status: "degraded" },
    });
    const healthy = JSON.stringify(buildSystemHealthReport("connected", "connected"));
    assert.match(healthy, /"application":"running"/);
    assert.match(healthy, /"mongodb":"connected"/);
    assert.match(healthy, /"redis":"connected"/);
    assert.match(healthy, /"status":"healthy"/);
    assert.equal(healthy.includes("mongodb+srv"), false);
    assert.equal(healthy.includes("redis://"), false);
  });
});

describe("runtime shutdown", () => {
  it("closes the HTTP server before the database and Redis connections", async () => {
    const order: string[] = [];
    await shutdownRuntime({
      closeHttpServer: async () => { order.push("http"); },
      disconnectDatabase: async () => { order.push("mongodb"); },
      disconnectRedis: async () => { order.push("redis"); },
    });
    assert.deepEqual(order, ["http", "mongodb", "redis"]);
  });
});
