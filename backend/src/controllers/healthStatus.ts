export type DependencyStatus = "connected" | "disconnected";

export const buildHealthReport = () => ({
  success: true as const,
  message: "API is running",
});

export const buildSystemHealthReport = (mongodb: DependencyStatus, redis: DependencyStatus) => ({
  success: true as const,
  data: {
    application: "running" as const,
    mongodb,
    redis,
    status: mongodb === "connected" && redis === "connected" ? "healthy" as const : "degraded" as const,
  },
});
