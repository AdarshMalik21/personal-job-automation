import type {
  ApiResponse,
  AuthSession,
  Job,
} from "@personal-job-automation/shared/types";

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const API_URL =
  process.env.NODE_ENV === "production" ? "/api/backend" : configuredApiUrl || "http://localhost:5000/api";

const request = async <T>(
  path: string,
  options?: RequestInit,
): Promise<ApiResponse<T>> => {
  if (!API_URL) throw new Error("NEXT_PUBLIC_API_URL is not configured");
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
  tracking?: {
    status?: string;
    appliedDate?: string;
    lastStatusUpdate?: string;
    followUpStatus?: string;
  };
  match: JobMatchView;
  freshness?: {
    status: "fresh" | "stale" | "unknown";
    reason: string;
    date?: string;
  };
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
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type JobListParams = {
  page?: number;
  limit?: number;
  search?: string;
  decision?: string;
  remoteStatus?: string;
  location?: string;
  freshness?: string;
  minScore?: string;
  reviewStatus?: string;
  applicationStatus?: string;
  sortBy?: string;
  queue?: "review";
};

const withToken = (token: string): RequestInit => ({
  headers: { Authorization: `Bearer ${token}` },
});

export const login = (email: string, password: string) =>
  request<AuthSession>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export type DailySelectionJob = {
  rank: number;
  jobId: string;
  title: string;
  company: string;
  location?: string;
  remoteStatus?: string;
  matchScore: number;
  decision: "APPLY" | "REVIEW";
  reasons: string[];
  missingRequirements: string[];
  freshness: "fresh" | "stale" | "unknown";
  officialApplicationUrl?: string;
  applicationStatus: string;
  preparationAvailable: boolean;
  preparationStatus?: string;
  missingInformation?: string[];
  rankingReason: string;
};

export type DailySelection = {
  dateKey: string;
  timezone: string;
  jobs: DailySelectionJob[];
  notificationStatus: string;
};

export const getDailySelection = (token: string) =>
  request<DailySelection>("/dashboard/daily-selection", withToken(token));

export const prepareApplication = (token: string, jobId: string) =>
  request<{ preparation: { id: string; status?: string } }>(`/applications/${encodeURIComponent(jobId)}/prepare`, {
    ...withToken(token),
    method: "POST",
  });

export type BrowserRunState = {
  status?: string;
  reason?: string;
  finalControl?: string;
  sessionAvailable?: boolean;
  fieldsDetected?: number;
  fields?: ReviewField[];
  runId?: string;
};

export const startBrowserRun = (token: string, jobId: string) =>
  request<{ browserRun: BrowserRunState }>(`/applications/${encodeURIComponent(jobId)}/browser-run`, {
    ...withToken(token),
    method: "POST",
  });

export const getBrowserRun = (token: string, jobId: string) =>
  request<{ browserRun: BrowserRunState }>(`/applications/${encodeURIComponent(jobId)}/browser-run`, withToken(token));

export const getDashboardSummary = (token: string) =>
  request<DashboardSummary>("/dashboard/summary", {
    headers: { Authorization: `Bearer ${token}` },
  });

export type DiscoveryRun = {
  status: "queued" | "already_running" | "processing" | "retry" | "completed" | "failed";
  jobId?: string;
};

export const startDiscovery = (token: string) =>
  request<DiscoveryRun>("/jobs/discovery/run", { ...withToken(token), method: "POST" });

export const getDiscoveryRun = (token: string, jobId: string) =>
  request<DiscoveryRun>(`/jobs/discovery/runs/${encodeURIComponent(jobId)}`, withToken(token));

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
  request<{ job: DashboardJob }>(
    `/jobs/${encodeURIComponent(id)}`,
    withToken(token),
  );

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

export type ReviewField = {
  elementId: string;
  type: string;
  label?: string;
  required: boolean;
  currentValue?: string;
  source: string;
  reviewStatus: string;
};

export type ApplicationReview = {
  job: {
    id: string;
    title?: string;
    company?: string;
    location?: string;
    source?: string;
    officialApplicationUrl?: string;
    description?: string;
    freshness?: { status: string; reason: string };
    matchScore?: number;
    matchDecision?: string;
    matchExplanation?: string[];
    requiredSkills?: string[];
  };
  preparation: {
    status?: string;
    tailoredResume?: {
      summary?: string;
      skills?: string[];
      experience?: Array<Record<string, unknown>>;
      filePath?: string;
    };
    resumeChanges?: string[];
    coverLetter?: { status?: string; content?: string; reason?: string };
    generatedAnswers?: Array<{ question?: string; answer?: string; status?: string; source?: string }>;
    missingInformation?: string[];
    warnings?: string[];
  };
  browserRun: {
    id?: string;
    status?: string;
    applicationUrl?: string;
    pagesProcessed?: number;
    fieldsDetected?: number;
    fieldsFilled?: string[];
    fields?: ReviewField[];
    unresolvedFields?: ReviewField[];
    finalControl?: string;
    reason?: string;
    sessionAvailable?: boolean;
  };
  application?: { status?: string };
  canSubmit: boolean;
  blockers: string[];
};

const requestWithStatus = async <T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> => {
  if (!API_URL) throw new Error("NEXT_PUBLIC_API_URL is not configured");
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  return (await response.json()) as ApiResponse<T>;
};

export const getApplicationReview = (token: string, jobId: string) =>
  request<{ review: ApplicationReview }>(`/applications/${encodeURIComponent(jobId)}/review`, withToken(token));

export const updateReviewField = (token: string, jobId: string, elementId: string, value: string) =>
  requestWithStatus<{ field: ReviewField }>(`/applications/${encodeURIComponent(jobId)}/review/fields`, {
    ...withToken(token),
    method: "PATCH",
    body: JSON.stringify({ elementId, value }),
  });

export const submitReviewedApplication = (token: string, jobId: string) =>
  requestWithStatus<{ submission: { status: string; clicked: boolean; confirmationDetected: boolean; reason?: string } }>(
    `/applications/${encodeURIComponent(jobId)}/submit`,
    { ...withToken(token), method: "POST", body: JSON.stringify({ approved: true }) },
  );

export const cancelReviewedApplication = (token: string, jobId: string) =>
  requestWithStatus<{ status: string }>(`/applications/${encodeURIComponent(jobId)}/cancel`, {
    ...withToken(token),
    method: "POST",
  });

export const stopBrowserRun = (token: string, jobId: string) =>
  requestWithStatus<{ status: string }>(`/applications/${encodeURIComponent(jobId)}/browser-run/stop`, {
    ...withToken(token),
    method: "POST",
  });

export type ApplicationHistoryEvent = {
  type: string;
  timestamp: string;
  previousStatus?: string;
  newStatus?: string;
  note?: string;
  source: "system" | "user";
};

export type ApplicationFollowUpView = {
  eligible?: boolean;
  reason?: string;
  eligibleAt?: string;
  status?: string;
  draft?: { subject?: string; body?: string; missingInformation?: string[] };
  preparedAt?: string;
};

export type ApplicationTracking = {
  status?: string;
  appliedDate?: string;
  lastStatusUpdate?: string;
  followUpStatus?: string;
  applicationUrl?: string;
  history?: ApplicationHistoryEvent[];
  submission?: Record<string, unknown>;
  followUp?: ApplicationFollowUpView;
};

export type ApplicationAnalytics = {
  totalApplications: number;
  submitted: number;
  interviews: number;
  offers: number;
  rejected: number;
  withdrawn: number;
  followUpsRequired: number;
  successfullySubmitted: number;
  interviewRate: number;
  offerRate: number;
  rejectionRate: number;
};

export const getApplicationTracking = (token: string, jobId: string) =>
  request<{ application: ApplicationTracking }>(`/applications/${encodeURIComponent(jobId)}/tracking`, withToken(token));

export const updateApplicationStatus = (token: string, jobId: string, status: string, note: string) =>
  requestWithStatus<{ application: ApplicationTracking }>(`/applications/${encodeURIComponent(jobId)}/status`, {
    ...withToken(token),
    method: "PATCH",
    body: JSON.stringify({ status, note }),
  });

export const getApplicationFollowUp = (token: string, jobId: string) =>
  request<{ followUp: ApplicationFollowUpView }>(`/applications/${encodeURIComponent(jobId)}/follow-up`, withToken(token));

export const prepareApplicationFollowUp = (token: string, jobId: string, draft?: string) =>
  requestWithStatus<{ followUp: ApplicationFollowUpView; sent: boolean }>(`/applications/${encodeURIComponent(jobId)}/follow-up`, {
    ...withToken(token),
    method: "POST",
    body: JSON.stringify(draft ? { draft } : {}),
  });

export const getApplicationAnalytics = (token: string) =>
  request<{ analytics: ApplicationAnalytics }>("/applications/analytics", withToken(token));

export const evaluateFollowUps = (token: string) =>
  requestWithStatus<{ updated: number }>("/applications/follow-ups/evaluate", {
    ...withToken(token),
    method: "POST",
  });
