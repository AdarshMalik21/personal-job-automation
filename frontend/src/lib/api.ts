import type { ApiResponse, AuthSession } from "@personal-job-automation/shared/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

const request = async <T>(
  path: string,
  options?: RequestInit,
): Promise<ApiResponse<T>> => {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const result = (await response.json()) as ApiResponse<T>;
  if (!response.ok) throw new Error(result.message ?? "Request failed");
  return result;
};

export type DashboardSummary = {
  systemStatus: "healthy" | "degraded";
  databaseStatus: "connected" | "disconnected";
  redisStatus: "connected" | "disconnected";
  totalJobs: number;
  totalApplications: number;
};

export const login = (email: string, password: string) =>
  request<AuthSession>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const getDashboardSummary = (token: string) =>
  request<DashboardSummary>("/dashboard/summary", {
    headers: { Authorization: `Bearer ${token}` },
  });
