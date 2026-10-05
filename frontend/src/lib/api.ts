import type {
  ApiResponse,
  AuthSession,
  Job,
} from "@personal-job-automation/shared/types";

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

export type JobMatchView = NonNullable<Job["match"]> & {
  matchScore?: number;
  decision?: "APPLY" | "REVIEW" | "SKIP";
  confidence?: "high" | "medium" | "low";
  roleAnalysis?: { status?: string; reason?: string };
  experienceAnalysis?: {
    status?: string;
    reason?: string;
    candidateYears?: number;
    requirement?: { minimum?: number; maximum?: number; preference?: string };
  };
  locationAnalysis?: { status?: string; reason?: string };
  skillAnalysis?: {
    exact?: string[];
    related?: string[];
    transferable?: string[];
    missingRequired?: string[];
    missingPreferred?: string[];
    unknown?: string[];
  };
  reasons?: string[];
  hardFilterFailures?: string[];
  scoreBreakdown?: Record<string, number>;
};

export type DashboardJob = Job & {
  id: string;
  applicationStatus: string;
  reviewStatus?: "unreviewed" | "reviewed" | "skipped";
  match: JobMatchView;
  freshness?: { status: "fresh" | "stale" | "unknown"; reason: string; date?: string };
  openStatus?: "open" | "closed" | "unknown";
};

export type JobStats = {
  totalJobs: number;
  freshJobs: number;
  applyCount: number;
  reviewCount: number;
  skipCount: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  averageMatchScore: number;
  jobsDiscoveredToday: number;
  alreadyApplied: number;
};

export type JobListResult = {
  jobs: DashboardJob[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
};

export type JobListParams = {
  page?: number;
  limit?: number;
  search?: string;
  decision?: string;
  remoteStatus?: string;
  location?: string;
  minScore?: string;
  reviewStatus?: string;
  sortBy?: string;
};

const withToken = (token: string): RequestInit => ({
  headers: { Authorization: `Bearer ${token}` },
});

export const login = (email: string, password: string) =>
  request<AuthSession>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const getDashboardSummary = (token: string) =>
  request<DashboardSummary>("/dashboard/summary", {
    headers: { Authorization: `Bearer ${token}` },
  });

export const getJobStats = (token: string) =>
  request<JobStats>("/jobs/stats", withToken(token));

export const getJobs = (token: string, params: JobListParams = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") search.set(key, String(value));
  });
  return request<JobListResult>(`/jobs?${search.toString()}`, withToken(token));
};

export const getJob = (token: string, id: string) =>
  request<{ job: DashboardJob }>(`/jobs/${encodeURIComponent(id)}`, withToken(token));

export const markJobReviewed = (token: string, id: string) =>
  request<{ job: DashboardJob }>(`/jobs/${encodeURIComponent(id)}/review`, {
    ...withToken(token),
    method: "PATCH",
  });

export const skipJob = (token: string, id: string) =>
  request<{ job: DashboardJob }>(`/jobs/${encodeURIComponent(id)}/skip`, {
    ...withToken(token),
    method: "PATCH",
  });
