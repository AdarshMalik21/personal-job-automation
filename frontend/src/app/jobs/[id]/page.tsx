"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardJob, getJob, markJobReviewed, skipJob } from "../../../lib/api";

const tokenKey = "job-automation-token";
const scoreOf = (job: DashboardJob) => job.match.matchScore ?? job.match.score ?? 0;
const textDescription = (value: string | undefined) => value?.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim() ?? "Description unavailable.";

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [job, setJob] = useState<DashboardJob>();
  const [error, setError] = useState("");
  const [token, setToken] = useState<string>();

  useEffect(() => {
    const storedToken = localStorage.getItem(tokenKey);
    if (!storedToken) {
      router.replace("/login");
      return;
    }
    setToken(storedToken);
    getJob(storedToken, params.id).then((result) => {
      if (!result.data) throw new Error("Job response was incomplete");
      setJob(result.data.job);
    }).catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "Unable to load job"));
  }, [params.id, router]);

  if (error) return <main className="loading-shell"><p className="form-error">{error}</p></main>;
  if (!job || !token) return <main className="loading-shell">Loading job intelligence...</main>;

  const match = job.match;
  const update = async (action: "review" | "skip") => {
    const result = action === "review" ? await markJobReviewed(token, job.id) : await skipJob(token, job.id);
    if (result.data) setJob(result.data.job);
  };
  const breakdown = match.scoreBreakdown ?? {};
  const skills = match.skillAnalysis ?? {};

  return <main className="dashboard-shell detail-shell">
    <header className="topbar"><div><Link className="back-link" href="/dashboard">← Back to jobs</Link><p className="eyebrow">JOB INTELLIGENCE</p><h1>{job.title}</h1></div><div className="detail-actions">{job.officialApplicationUrl && <a className="primary-button" href={job.officialApplicationUrl} target="_blank" rel="noreferrer">Apply on company site ↗</a>}<Link className="primary-button" href={`/jobs/${job.id}/review`}>Review application</Link><button className="quiet-button" onClick={() => update("review")}>Mark reviewed</button><button className="quiet-button" onClick={() => update("skip")}>Skip</button></div></header>
    <section className="detail-hero"><div><p className="job-company">{job.company}</p><p className="job-meta">{job.location ?? "Location unknown"} · {job.remoteStatus ?? "Work mode unknown"} · {job.employmentType ?? "Employment type unknown"}</p><p className="detail-dates">Published {job.postedDate ? new Date(job.postedDate).toLocaleDateString() : "unknown"} · Updated {job.updatedDate ? new Date(job.updatedDate).toLocaleDateString() : "unknown"}</p><p className="detail-dates">Freshness: {job.freshness?.status ?? "unknown"} · Review: {job.reviewStatus ?? "unreviewed"} · Application: {job.applicationStatus.replaceAll("_", " ")} · Open status: {job.openStatus ?? "unknown"}</p></div><div className="detail-score"><strong>{scoreOf(job)}</strong><span>/ 100</span><b className={`decision-badge ${(match.decision ?? "REVIEW").toLowerCase()}`}>{match.decision ?? "REVIEW"}</b><small>{match.confidence ?? "unknown"} confidence</small></div></section>
    <div className="detail-grid"><section className="detail-main"><Panel title="Why this job matches"><ul className="reason-list">{(match.reasons ?? []).map((reason) => <li key={reason}>{reason}</li>)}</ul></Panel><Panel title="Full job description"><p className="description-text">{textDescription(job.description)}</p></Panel><Panel title="Skills"><SkillGroup label="Exact matches" values={skills.exact} tone="exact" /><SkillGroup label="Related matches" values={skills.related} tone="related" /><SkillGroup label="Transferable" values={skills.transferable} tone="related" /><SkillGroup label="Missing required" values={skills.missingRequired} tone="missing" /><SkillGroup label="Missing preferred" values={skills.missingPreferred} tone="missing" /><SkillGroup label="Unknown" values={skills.unknown} tone="unknown" /></Panel></section><aside className="detail-side"><Panel title="Score breakdown"><Breakdown label="Role relevance" value={breakdown.roleRelevance} max={20} /><Breakdown label="Required skills" value={breakdown.requiredSkillCoverage} max={30} /><Breakdown label="Preferred skills" value={breakdown.preferredSkillCoverage} max={10} /><Breakdown label="Experience fit" value={breakdown.experienceFit} max={15} /><Breakdown label="Location fit" value={breakdown.locationCompatibility} max={15} /><Breakdown label="Core stack" value={breakdown.coreStackAlignment} max={5} /><Breakdown label="Confidence" value={breakdown.analysisConfidence} max={5} /></Panel><Panel title="Experience"><p><strong>Status:</strong> {match.experienceAnalysis?.status ?? "Unknown"}</p><p>{match.experienceAnalysis?.reason ?? "No analysis available."}</p>{match.experienceAnalysis?.candidateYears !== undefined && <p><strong>Candidate:</strong> {match.experienceAnalysis.candidateYears}+ years</p>}</Panel><Panel title="Location"><p><strong>Status:</strong> {match.locationAnalysis?.status ?? "Unknown"}</p><p>{match.locationAnalysis?.reason ?? "No analysis available."}</p></Panel>{(match.hardFilterFailures?.length ?? 0) > 0 && <Panel title="Hard filter failures"><ul className="failure-list">{match.hardFilterFailures?.map((failure) => <li key={failure}>{failure}</li>)}</ul></Panel>}</aside></div>
  </main>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="detail-panel"><p className="kicker">{title.toUpperCase()}</p>{children}</section>; }
function SkillGroup({ label, values, tone }: { label: string; values?: string[]; tone: string }) { if (!values?.length) return null; return <div className="skill-group"><span>{label}</span><div>{values.map((value) => <span className={`skill-chip ${tone}`} key={value}>{value}</span>)}</div></div>; }
function Breakdown({ label, value, max }: { label: string; value?: number; max: number }) { const actual = value ?? 0; return <div className="breakdown-row"><span>{label}</span><strong>{Math.round(actual)} / {max}</strong><div><i style={{ width: `${Math.min(100, Math.max(0, (actual / max) * 100))}%` }} /></div></div>; }
