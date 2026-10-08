"use client";

import { AppShell } from "../../../components/AppShell";
import { useWorkspace } from "../../../lib/useWorkspace";
import { excludedJobs, exclusionReason, experienceLabel } from "../../../lib/jobActions";

export default function ExcludedJobsPage() {
  const workspace = useWorkspace();
  const jobs = excludedJobs(workspace.jobs);

  if (workspace.loading || !workspace.token) return <main className="loading-shell">Loading excluded jobs...</main>;
  if (workspace.error) return <main className="loading-shell"><p className="form-error">{workspace.error}</p></main>;

  return (
    <AppShell onSignOut={workspace.signOut}>
      <main className="assist-page">
        <header className="assist-page-title">
          <h1>Excluded Jobs</h1>
          <p>Jobs that are not part of your action list. This page is for checking why a job was left out.</p>
        </header>
        {jobs.length === 0 ? <p className="assist-muted">No excluded jobs.</p> : (
          <div className="assist-list">
            {jobs.map((job) => (
              <article key={job.id} className="assist-row">
                <div>
                  <h3>{job.title}</h3>
                  <p className="assist-company">{job.company}</p>
                  <p>{exclusionReason(job)}</p>
                  <p>{experienceLabel(job)}</p>
                  <p className="assist-meta">Discovered {job.discoveredDate ? new Date(job.discoveredDate).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "on an unknown date"}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
