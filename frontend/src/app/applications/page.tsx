"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { EmptyState } from "../../components/JobCard";
import { getJobs, type DashboardJob } from "../../lib/api";
import { applicationLabel, experienceLabel, placeLabel } from "../../lib/jobActions";
import { useWorkspace } from "../../lib/useWorkspace";

const statuses = [
  ["prepared", "Prepared"],
  ["ready_for_review", "Ready for Review"],
  ["submitted", "Submitted"],
  ["interview", "Interview"],
  ["follow_up_required", "Follow-up Required"],
] as const;

export default function ApplicationsPage() {
  const workspace = useWorkspace();
  const [status, setStatus] = useState<(typeof statuses)[number][0]>("prepared");
  const [jobs, setJobs] = useState<DashboardJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const selected = new URLSearchParams(window.location.search).get("status");
    if (statuses.some(([value]) => value === selected)) setStatus(selected as (typeof statuses)[number][0]);
  }, []);

  useEffect(() => {
    if (!workspace.token) return;
    setLoading(true);
    getJobs(workspace.token, { applicationStatus: status, limit: 50, page: 1, sortBy: "newest" })
      .then((result) => setJobs(result.data?.jobs ?? []))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [workspace.token, status]);

  if (workspace.loading || !workspace.token) return <main className="loading-shell">Loading applications...</main>;

  return (
    <AppShell onSignOut={workspace.signOut}>
      <main className="assist-page">
        <header className="assist-page-title">
          <h1>Applications</h1>
          <p>Your application activity.</p>
        </header>
        <div className="assist-progress">
          {statuses.map(([value, label]) => (
            <button key={value} type="button" className={value === status ? "active" : ""} onClick={() => {
              setStatus(value);
              window.history.replaceState(null, "", `/applications?status=${value}`);
            }}>
              <span>{label}</span>
            </button>
          ))}
        </div>
        {loading ? <p className="assist-muted">Loading...</p> : jobs.length === 0 ? (
          <EmptyState title="No applications yet" message="Your application activity will appear here." />
        ) : (
          <div className="assist-list">
            {jobs.map((job) => (
              <article key={job.id} className="assist-row">
                <div>
                  <p className="assist-company">{job.company}</p>
                  <h3>{job.title}</h3>
                  <p className="assist-meta">{placeLabel(job)}</p>
                  <p>{experienceLabel(job)}</p>
                  <p className="assist-status">Status: {applicationLabel(job.applicationStatus)}</p>
                </div>
                <Link className="assist-primary" href={`/jobs/${job.id}`}>Track Application</Link>
              </article>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
