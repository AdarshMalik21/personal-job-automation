"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  DashboardJob,
  JobListParams,
  JobStats,
  getJobStats,
  getJobs,
  markJobReviewed,
  skipJob,
} from "../../lib/api";

const tokenKey = "job-automation-token";
const initialFilters: JobListParams = { page: 1, limit: 12, sortBy: "score" };
const scoreOf = (job: DashboardJob) => job.match.matchScore ?? job.match.score ?? 0;
const decisionOf = (job: DashboardJob) => job.match.decision ?? "REVIEW";

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string>();
  const [jobs, setJobs] = useState<DashboardJob[]>([]);
  const [stats, setStats] = useState<JobStats>();
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
    Promise.all([getJobs(token, query), getJobStats(token)])
      .then(([jobsResult, statsResult]) => {
        if (!jobsResult.data || !statsResult.data) throw new Error("Dashboard response was incomplete");
        setJobs(jobsResult.data.jobs);
        setPagination(jobsResult.data.pagination);
        setStats(statsResult.data);
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

  return (
    <main className="dashboard-shell intelligence-shell">
      <header className="topbar"><div><div className="eyebrow">PERSONAL JOB AUTOMATION</div><h1>Job intelligence</h1></div><button className="quiet-button" onClick={signOut}>Sign out</button></header>
      <section className="intelligence-intro"><div><p className="kicker">DECISION QUEUE</p><h2>Find the signal worth your attention.</h2><p>Scores and decisions come from the matching engine. Your review state stays yours.</p></div><div className="pipeline-note">{pagination.total} jobs in view</div></section>
      <section className="metric-grid intelligence-metrics" aria-label="Job metrics">
        <Metric label="Total" value={stats?.totalJobs ?? 0} />
        <Metric label="Apply" value={stats?.applyCount ?? 0} tone="apply" />
        <Metric label="Review" value={stats?.reviewCount ?? 0} tone="review" />
        <Metric label="Skip" value={stats?.skipCount ?? 0} tone="skip" />
        <Metric label="Fresh" value={stats?.freshJobs ?? 0} />
      </section>
      <section className="job-controls" aria-label="Job filters">
        <label className="search-field"><span>Search</span><input value={filters.search ?? ""} onChange={(event) => updateFilter("search", event.target.value)} placeholder="Title, company, skill, location" /></label>
        <Filter label="Decision" value={filters.decision ?? ""} onChange={(value) => updateFilter("decision", value)} options={[["", "All decisions"], ["APPLY", "APPLY"], ["REVIEW", "REVIEW"], ["SKIP", "SKIP"]]} />
        <Filter label="Remote" value={filters.remoteStatus ?? ""} onChange={(value) => updateFilter("remoteStatus", value)} options={[["", "All work modes"], ["remote", "Remote"], ["hybrid", "Hybrid"], ["onsite", "On-site"]]} />
        <Filter label="Score" value={filters.minScore ?? ""} onChange={(value) => updateFilter("minScore", value)} options={[["", "Any score"], ["75", "75+"], ["65", "65+"], ["50", "50+"]]} />
        <Filter label="Freshness" value={filters.freshness ?? ""} onChange={(value) => updateFilter("freshness", value)} options={[["", "All freshness"], ["fresh", "Fresh"], ["stale", "Stale"], ["unknown", "Unknown"]]} />
        <Filter label="Review" value={filters.reviewStatus ?? ""} onChange={(value) => updateFilter("reviewStatus", value)} options={[["", "All review states"], ["unreviewed", "Unreviewed"], ["reviewed", "Reviewed"], ["skipped", "Skipped"]]} />
        <Filter label="Location" value={filters.location ?? ""} onChange={(value) => updateFilter("location", value)} options={[["", "All locations"], ["Delhi NCR", "Delhi NCR"], ["Noida", "Noida"], ["Greater Noida", "Greater Noida"], ["Gurgaon", "Gurgaon"], ["Delhi", "Delhi"], ["Remote India", "Remote India"]]} />
        <Filter label="Sort" value={filters.sortBy ?? "score"} onChange={(value) => updateFilter("sortBy", value)} options={[["score", "Highest score"], ["newest", "Newest"], ["updated", "Recently updated"], ["company", "Company"], ["title", "Title"]]} />
      </section>
      <section className="job-list-header"><div><p className="kicker">DISCOVERED JOBS</p><h3>{loading ? "Refreshing the queue" : `${pagination.total} jobs`}</h3></div><span>{stats ? `${Math.round(stats.averageMatchScore)} average score` : ""}</span></section>
      {loading ? <div className="job-grid">{[1, 2, 3].map((item) => <div className="job-card skeleton" key={item} />)}</div> : jobs.length === 0 ? <EmptyState /> : <div className="job-grid">{jobs.map((job) => <JobCard key={job.id} job={job} onReview={review} />)}</div>}
      <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={(page) => setFilters((current) => ({ ...current, page }))} />
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) { return <article className={`metric-card ${tone ?? ""}`}><span>{label}</span><strong>{value}</strong><small>Current pipeline</small></article>; }
function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) { return <label className="filter-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}</select></label>; }
function JobCard({ job, onReview }: { job: DashboardJob; onReview: (job: DashboardJob, action: "review" | "skip") => Promise<void> }) { const decision = decisionOf(job); return <article className="job-card"><div className="job-card-top"><div><p className="job-company">{job.company}</p><h3>{job.title}</h3></div><span className={`decision-badge ${decision.toLowerCase()}`}>{decision}</span></div><p className="job-meta">{job.location ?? "Location unknown"} · {job.remoteStatus ?? "Work mode unknown"} · {job.freshness?.status ?? "freshness unknown"}</p><div className="job-score"><strong>{scoreOf(job)}</strong><span>/ 100 · {job.match.confidence ?? "unknown"} confidence</span></div><div className="skill-row">{(job.match.skillAnalysis?.exact ?? []).slice(0, 5).map((skill) => <span key={skill} className="skill-chip exact">{skill}</span>)}{(job.match.skillAnalysis?.missingRequired ?? []).slice(0, 2).map((skill) => <span key={skill} className="skill-chip missing">Missing {skill}</span>)}</div><div className="job-card-footer"><span>{job.reviewStatus === "reviewed" ? "Reviewed" : job.reviewStatus === "skipped" ? "Skipped manually" : "Not reviewed"} · Application: {job.applicationStatus.replaceAll("_", " ")}</span><div><Link className="text-button" href={`/jobs/${job.id}`}>View details</Link>{job.officialApplicationUrl && <a className="text-button" href={job.officialApplicationUrl} target="_blank" rel="noreferrer">Open application ↗</a>}<button className="text-button" onClick={() => onReview(job, "review")}>Review</button><button className="text-button muted-action" onClick={() => onReview(job, "skip")}>Skip</button></div></div></article>; }
function EmptyState() { return <div className="empty-state"><strong>No jobs match your current filters.</strong><span>Try removing one or more filters.</span></div>; }
function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) { if (totalPages <= 1) return null; return <nav className="pagination" aria-label="Job pages"><button disabled={page === 1} onClick={() => onChange(page - 1)}>Previous</button><span>Page {page} of {totalPages}</span><button disabled={page === totalPages} onClick={() => onChange(page + 1)}>Next</button></nav>; }
