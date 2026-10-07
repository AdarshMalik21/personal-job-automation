"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ApplicationAnalytics,
  DashboardJob,
  JobListParams,
  JobStats,
  evaluateFollowUps,
  DailySelection,
  getApplicationAnalytics,
  getDailySelection,
  getJobStats,
  getJobs,
  markJobReviewed,
  prepareApplication,
  skipJob,
} from "../../lib/api";

const tokenKey = "job-automation-token";
const submittedStatuses = new Set([
  "submitted",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "follow_up_required",
  "submission_failed",
  "submission_unknown",
]);
const preparedStatuses = new Set(["preparing", "ready_for_review", "needs_information"]);
const initialFilters: JobListParams = { page: 1, limit: 12, sortBy: "score" };
const scoreOf = (job: DashboardJob) => job.match.matchScore ?? job.match.score ?? 0;
const decisionOf = (job: DashboardJob) => job.match.decision ?? "REVIEW";

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string>();
  const [jobs, setJobs] = useState<DashboardJob[]>([]);
  const [stats, setStats] = useState<JobStats>();
  const [analytics, setAnalytics] = useState<ApplicationAnalytics>();
  const [daily, setDaily] = useState<DailySelection>();
  const [dailyMessage, setDailyMessage] = useState("");
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [filters, setFilters] = useState<JobListParams>(initialFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const storedToken = localStorage.getItem(tokenKey);
    if (!storedToken) {
      router.replace("/login");
      return;
    }
    setToken(storedToken);
    const params = new URLSearchParams(window.location.search);
    setFilters({
      ...initialFilters,
      ...(params.get("search") ? { search: params.get("search") ?? "" } : {}),
      ...(params.get("decision") ? { decision: params.get("decision") ?? "" } : {}),
      ...(params.get("remoteStatus") ? { remoteStatus: params.get("remoteStatus") ?? "" } : {}),
      ...(params.get("freshness") ? { freshness: params.get("freshness") ?? "" } : {}),
      ...(params.get("reviewStatus") ? { reviewStatus: params.get("reviewStatus") ?? "" } : {}),
      ...(params.get("location") ? { location: params.get("location") ?? "" } : {}),
      ...(params.get("minScore") ? { minScore: params.get("minScore") ?? "" } : {}),
    });
  }, [router]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError("");
    const query = { ...filters, page: filters.page ?? 1 };
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== "" && key !== "page" && key !== "limit") params.set(key, String(value));
    });
    window.history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
    Promise.all([getJobs(token, query), getJobStats(token), getApplicationAnalytics(token), getDailySelection(token)])
      .then(([jobsResult, statsResult, analyticsResult, dailyResult]) => {
        if (!jobsResult.data || !statsResult.data || !analyticsResult.data || !dailyResult.data) throw new Error("Dashboard response was incomplete");
        setJobs(jobsResult.data.jobs);
        setPagination(jobsResult.data.pagination);
        setStats(statsResult.data);
        setAnalytics(analyticsResult.data.analytics);
        setDaily(dailyResult.data);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.message.includes("session")) {
          localStorage.removeItem(tokenKey);
          router.replace("/login");
          return;
        }
        setError(requestError instanceof Error ? requestError.message : "Unable to load jobs");
      })
      .finally(() => setLoading(false));
  }, [filters, router, token]);

  const updateFilter = (key: keyof JobListParams, value: string) => {
    setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  };

  const prepare = async (jobId: string) => {
    if (!token) return;
    setDailyMessage("");
    try {
      await prepareApplication(token, jobId);
      router.push(`/jobs/${jobId}/review`);
    } catch (requestError: unknown) {
      setDailyMessage(requestError instanceof Error ? requestError.message : "Preparation failed");
    }
  };

  const review = async (job: DashboardJob, action: "review" | "skip") => {
    if (!token) return;
    const result = action === "review"
      ? await markJobReviewed(token, job.id)
      : await skipJob(token, job.id);
    if (result.data) {
      setJobs((current) => current.map((item) => item.id === job.id ? result.data!.job : item));
    }
  };

  const signOut = () => {
    localStorage.removeItem(tokenKey);
    router.replace("/login");
  };

  if (error) return <main className="loading-shell"><div><p className="form-error">{error}</p><button className="primary-button" onClick={() => setFilters((current) => ({ ...current }))}>Try again</button></div></main>;

  const filtersActive = Boolean(
    filters.search || filters.decision || filters.remoteStatus || filters.minScore
    || filters.freshness || filters.reviewStatus || filters.applicationStatus || filters.location,
  );
  const sortLabel = sortLabels[filters.sortBy ?? "score"] ?? "highest score";

  return (
    <main className="dashboard-shell intelligence-shell">
      <header className="dash-header">
        <div>
          <h1>Job intelligence</h1>
          <p>Scores and decisions come from the matching engine. Your review state stays yours.</p>
        </div>
        <button className="quiet-button" onClick={signOut}>Sign out</button>
      </header>
      <section aria-label="Job metrics">
        <div className="stat-grid">
          <Metric label="Total jobs" value={stats?.totalJobs ?? 0} />
          <Metric label="Apply" value={stats?.applyCount ?? 0} tone="apply" />
          <Metric label="Review" value={stats?.reviewCount ?? 0} tone="review" />
          <Metric label="Skip" value={stats?.skipCount ?? 0} tone="skip" />
          <Metric label="Fresh" value={stats?.freshJobs ?? 0} />
        </div>
      </section>
      <section className="filter-panel" aria-label="Job filters">
        <label className="search-field"><span>Search</span><input value={filters.search ?? ""} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Title, company, skill, location" /></label>
        <Filter label="Decision" value={filters.decision ?? ""} onChange={(value) => updateFilter("decision", value)} options={[["", "All decisions"], ["APPLY", "APPLY"], ["REVIEW", "REVIEW"], ["SKIP", "SKIP"]]} />
        <Filter label="Remote" value={filters.remoteStatus ?? ""} onChange={(value) => updateFilter("remoteStatus", value)} options={[["", "All work modes"], ["remote", "Remote"], ["hybrid", "Hybrid"], ["onsite", "On-site"]]} />
        <Filter label="Score" value={filters.minScore ?? ""} onChange={(value) => updateFilter("minScore", value)} options={[["", "Any score"], ["75", "75+"], ["65", "65+"], ["50", "50+"]]} />
        <Filter label="Freshness" value={filters.freshness ?? ""} onChange={(value) => updateFilter("freshness", value)} options={[["", "All freshness"], ["fresh", "Fresh"], ["stale", "Stale"], ["unknown", "Unknown"]]} />
        <Filter label="Review" value={filters.reviewStatus ?? ""} onChange={(value) => updateFilter("reviewStatus", value)} options={[["", "All review states"], ["unreviewed", "Unreviewed"], ["reviewed", "Reviewed"], ["skipped", "Skipped"]]} />
        <Filter label="Application" value={filters.applicationStatus ?? ""} onChange={(value) => updateFilter("applicationStatus", value)} options={[["", "All application statuses"], ["submitted", "Submitted"], ["interview", "Interview"], ["offer", "Offer"], ["rejected", "Rejected"], ["withdrawn", "Withdrawn"], ["follow_up_required", "Follow-up required"], ["submission_failed", "Submission failed"], ["submission_unknown", "Submission unknown"], ["cancelled", "Cancelled"]]} />
        <Filter label="Location" value={filters.location ?? ""} onChange={(value) => updateFilter("location", value)} options={[["", "All locations"], ["Delhi NCR", "Delhi NCR"], ["Noida", "Noida"], ["Greater Noida", "Greater Noida"], ["Gurgaon", "Gurgaon"], ["Delhi", "Delhi"], ["Remote India", "Remote India"]]} />
        <Filter label="Sort" value={filters.sortBy ?? "score"} onChange={(value) => updateFilter("sortBy", value)} options={[["score", "Highest score"], ["newest", "Newest"], ["updated", "Recently updated"], ["company", "Company"], ["title", "Title"]]} />
      </section>
      <section className="analytics-panel" aria-label="Application tracking">
        <div className="section-heading">
          <h2>Applications</h2>
          {token && <button className="quiet-button" onClick={async () => { await evaluateFollowUps(token); setFilters((current) => ({ ...current })); }}>Check follow-ups</button>}
        </div>
        <div className="stat-grid">
          <Metric label="Applications" value={analytics?.totalApplications ?? 0} />
          <Metric label="Submitted" value={analytics?.submitted ?? 0} />
          <Metric label="Interviews" value={analytics?.interviews ?? 0} />
          <Metric label="Offers" value={analytics?.offers ?? 0} />
          <Metric label="Rejected" value={analytics?.rejected ?? 0} />
          <Metric label="Withdrawn" value={analytics?.withdrawn ?? 0} />
          <Metric label="Follow-ups" value={analytics?.followUpsRequired ?? 0} />
        </div>
        <div className="rate-row">
          <div className="rate-chip"><span>Interview rate</span><strong>{percent(analytics?.interviewRate)}</strong></div>
          <div className="rate-chip"><span>Offer rate</span><strong>{percent(analytics?.offerRate)}</strong></div>
          <div className="rate-chip"><span>Rejection rate</span><strong>{percent(analytics?.rejectionRate)}</strong></div>
          <p className="rate-note">Rates use successfully submitted applications as the denominator.</p>
        </div>
      </section>
      <section className="jobs-panel" aria-label="Today's best matches">
        <div className="section-heading">
          <h2>Today&apos;s Best Matches</h2>
          <p>{daily ? `${daily.dateKey} · ${daily.jobs.length} selected` : "Loading today's selection"}</p>
        </div>
        {dailyMessage && <p className="form-error">{dailyMessage}</p>}
        {!daily || daily.jobs.length === 0 ? (
          <div className="empty-state">
            <strong>No daily matches yet.</strong>
            <span>The weekday 08:00 run ranks discovered jobs and keeps the best 10.</span>
          </div>
        ) : (
          <div className="daily-list">
            {daily.jobs.map((job) => {
              const preparationStatus = job.preparationStatus ?? "not_started";
              const submitted = submittedStatuses.has(job.applicationStatus);
              const prepared = preparedStatuses.has(preparationStatus);
              const missing = job.missingInformation ?? [];
              return (
              <article className="daily-row" key={job.jobId}>
                <strong className="daily-rank">{job.rank}</strong>
                <div>
                  <h3><Link href={`/jobs/${job.jobId}`}>{job.title}</Link></h3>
                  <p>{job.company} · {job.location ?? "Location unknown"} · {job.remoteStatus ?? "Work mode unknown"}</p>
                  <p>{job.freshness} · {preparationStatus.replaceAll("_", " ")} · {job.applicationStatus.replaceAll("_", " ")}</p>
                  {preparationStatus === "needs_information" && missing.length > 0 && (
                    <p className="daily-missing">Missing: {missing.join(", ")}</p>
                  )}
                </div>
                <div className="job-row-score"><strong>{job.matchScore}</strong><span>/100</span></div>
                <span className={`decision-badge ${job.decision.toLowerCase()}`}>{job.decision}</span>
                <span className={`fresh-badge ${job.freshness}`}>{job.freshness}</span>
                <div className="job-row-actions">
                  <Link className="text-button" href={`/jobs/${job.jobId}`}>View Job</Link>
                  {submitted ? (
                    <Link className="text-button" href={`/jobs/${job.jobId}`}>Track Application</Link>
                  ) : prepared ? (
                    <Link className="text-button" href={`/jobs/${job.jobId}/review`}>Review Application</Link>
                  ) : (
                    <button className="text-button" onClick={() => prepare(job.jobId)}>Prepare Application</button>
                  )}
                </div>
              </article>
              );
            })}
          </div>
        )}
      </section>
      <section className="jobs-panel" aria-label="Discovered jobs">
        <div className="job-list-header">
          <h2>Discovered jobs</h2>
          <p className="jobs-context">
            {loading ? "Refreshing the queue" : `${pagination.total} jobs`}
            {stats ? ` · ${Math.round(stats.averageMatchScore)} average score` : ""}
            {` · Sorted by ${sortLabel}`}
            {filtersActive ? " · Filters applied" : ""}
          </p>
        </div>
        {loading ? (
          <div className="job-list">{[1, 2, 3].map((item) => <div className="job-row skeleton" key={item} />)}</div>
        ) : jobs.length === 0 ? (
          <div className="job-list"><EmptyState filtered={filtersActive && (stats?.totalJobs ?? 0) > 0} /></div>
        ) : (
          <div className="job-list">
            <div className="job-list-labels" aria-hidden="true">
              <span>Role</span>
              <span>Location</span>
              <span>Score</span>
              <span>Decision</span>
              <span>Freshness</span>
              <span>Application</span>
              <span />
            </div>
            {jobs.map((job) => <JobCard key={job.id} job={job} onReview={review} />)}
          </div>
        )}
        <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={(page) => setFilters((current) => ({ ...current, page }))} />
      </section>
    </main>
  );
}

const sortLabels: Record<string, string> = {
  score: "highest score",
  newest: "newest",
  updated: "recently updated",
  company: "company",
  title: "title",
};
function percent(rate: number | undefined) { return `${Math.round((rate ?? 0) * 100)}%`; }
function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) { return <article className={`stat-card ${tone ?? ""}`}><span>{label}</span><strong>{value}</strong></article>; }
function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) { return <label className="filter-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([option, text]) => <option key={option || "all"} value={option}>{text}</option>)}</select></label>; }
function JobCard({ job, onReview }: { job: DashboardJob; onReview: (job: DashboardJob, action: "review" | "skip") => Promise<void> }) {
  const decision = decisionOf(job);
  const freshness = job.freshness?.status ?? "unknown";
  const reviewLabel = job.reviewStatus === "reviewed" ? "Reviewed" : job.reviewStatus === "skipped" ? "Skipped manually" : "Not reviewed";
  const trackingNotes = [
    job.tracking?.appliedDate ? `Submitted ${new Date(job.tracking.appliedDate).toLocaleDateString()}` : "",
    job.tracking?.lastStatusUpdate ? `Updated ${new Date(job.tracking.lastStatusUpdate).toLocaleDateString()}` : "",
    job.tracking ? `Follow-up ${job.tracking.followUpStatus ?? "none"}` : "",
  ].filter(Boolean).join(" · ");
  return (
    <article className="job-row">
      <div className="job-row-main">
        <h3><Link href={`/jobs/${job.id}`}>{job.title}</Link></h3>
        <p className="job-row-company">{job.company}</p>
        <div className="skill-row">
          {(job.match.skillAnalysis?.exact ?? []).slice(0, 5).map((skill) => <span key={skill} className="skill-chip exact">{skill}</span>)}
          {(job.match.skillAnalysis?.missingRequired ?? []).slice(0, 2).map((skill) => <span key={skill} className="skill-chip missing">Missing {skill}</span>)}
        </div>
      </div>
      <div className="job-row-meta">
        <strong>{job.location ?? "Location unknown"}</strong>
        <span>{job.remoteStatus ?? "Work mode unknown"}</span>
      </div>
      <div className="job-row-score" title={`${job.match.confidence ?? "unknown"} confidence`}>
        <strong>{scoreOf(job)}</strong>
        <span>/100</span>
      </div>
      <span className={`decision-badge ${decision.toLowerCase()}`}>{decision}</span>
      <span className={`fresh-badge ${freshness}`}>{freshness}</span>
      <div className="job-row-status">
        <strong>{job.applicationStatus.replaceAll("_", " ")}</strong>
        <small>{reviewLabel}{trackingNotes ? ` · ${trackingNotes}` : ""}</small>
      </div>
      <div className="job-row-actions">
        <Link className="text-button" href={`/jobs/${job.id}`}>View details</Link>
        {job.officialApplicationUrl && <a className="text-button" href={job.officialApplicationUrl} target="_blank" rel="noreferrer">Open application</a>}
        <button className="text-button" onClick={() => onReview(job, "review")}>Review</button>
        <button className="text-button muted-action" onClick={() => onReview(job, "skip")}>Skip</button>
      </div>
    </article>
  );
}
function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="empty-state">
      <strong>{filtered ? "No jobs match your current filters." : "No jobs have been discovered yet."}</strong>
      <span>{filtered ? "Clear one or more filters to see more of the pipeline." : "Jobs will appear here after they are ingested."}</span>
    </div>
  );
}
function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) { if (totalPages <= 1) return null; return <nav className="pagination" aria-label="Job pages"><button disabled={page === 1} onClick={() => onChange(page - 1)}>Previous</button><span>Page {page} of {totalPages}</span><button disabled={page === totalPages} onClick={() => onChange(page + 1)}>Next</button></nav>; }
