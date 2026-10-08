"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { DiscoveryControl } from "../../components/DiscoveryControl";
import { EmptyState, JobCard } from "../../components/JobCard";
import { countApplications } from "../../lib/useWorkspace";
import { useWorkspace } from "../../lib/useWorkspace";
import {
  blockingInconsistencies,
  latestDiscovery,
  recommendedJobs,
  reviewJobs,
} from "../../lib/jobActions";

const progress = [
  ["prepared", "Prepared"],
  ["ready_for_review", "Ready for Review"],
  ["submitted", "Submitted"],
  ["interview", "Interview"],
  ["follow_up_required", "Follow-up Required"],
] as const;

export default function DashboardPage() {
  const workspace = useWorkspace();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const recommended = recommendedJobs(workspace.jobs);
  const review = reviewJobs(workspace.jobs);
  const problems = blockingInconsistencies(workspace.jobs);
  const lastDiscovery = workspace.discoveredAt ?? latestDiscovery(workspace.jobs);
  const applicationTotal = progress.reduce((sum, [status]) => sum + (counts[status] ?? 0), 0);

  useEffect(() => {
    if (!workspace.token) return;
    Promise.all(progress.map(async ([status]) => [status, await countApplications(workspace.token ?? "", status)] as const))
      .then((entries) => setCounts(Object.fromEntries(entries)))
      .catch(() => setCounts({}));
  }, [workspace.token, workspace.jobs]);

  if (workspace.error) {
    return <main className="loading-shell"><p className="form-error">{workspace.error}</p></main>;
  }
  if (workspace.loading || !workspace.token) return <main className="loading-shell">Loading your jobs...</main>;

  return (
    <AppShell onSignOut={workspace.signOut}>
      <main className="assist-page">
        <header className="assist-header">
          <h1>Job Assistant</h1>
          <DiscoveryControl
            token={workspace.token}
            lastDiscovery={lastDiscovery}
            onComplete={async (completedAt) => {
              workspace.setDiscoveredAt(completedAt);
              await workspace.reload(workspace.token ?? "");
            }}
          />
        </header>

        {problems.length > 0 && (
          <section className="assist-alert" role="alert">
            {problems.map((problem) => (
              <p key={`${problem.company}-${problem.title}`}>
                Backend matching data is inconsistent: {problem.title} at {problem.company} is {problem.decision} despite a hard experience mismatch.
              </p>
            ))}
          </section>
        )}

        <section className="assist-summary" aria-label="Action summary">
          <Link href="/recommended"><span>Recommended</span><strong>{recommended.length}</strong></Link>
          <Link href="/review"><span>Needs Review</span><strong>{review.length}</strong></Link>
          <Link href="/applications"><span>Applications</span><strong>{applicationTotal}</strong></Link>
          <Link href="/applications?status=follow_up_required"><span>Follow-ups</span><strong>{counts.follow_up_required ?? 0}</strong></Link>
        </section>

        <section className="assist-section">
          <div className="assist-section-head">
            <h2>Recommended Jobs</h2>
            <p>Jobs that match your experience, skills, role and location.</p>
          </div>
          {recommended.length === 0 ? (
            <EmptyState
              title="No recommended jobs today"
              message="Your latest discovery did not find any jobs that currently meet your application criteria."
              action={<DiscoveryControl token={workspace.token} buttonOnly lastDiscovery={lastDiscovery} onComplete={async (completedAt) => { workspace.setDiscoveredAt(completedAt); await workspace.reload(workspace.token ?? ""); }} />}
            />
          ) : (
            <div className="assist-cards">
              {recommended.map((job) => <JobCard key={job.id} job={job} token={workspace.token ?? ""} variant="recommended" />)}
            </div>
          )}
        </section>

        <section className="assist-section">
          <div className="assist-section-head">
            <h2>Needs Review</h2>
            <p>Jobs where the system needs your decision.</p>
          </div>
          {review.length === 0 ? (
            <EmptyState title="Nothing needs review" message="There are no jobs requiring your decision." />
          ) : (
            <div className="assist-cards">
              {review.map((job) => <JobCard key={job.id} job={job} token={workspace.token ?? ""} variant="review" />)}
            </div>
          )}
        </section>

        <section className="assist-section">
          <div className="assist-section-head">
            <h2>Application Progress</h2>
          </div>
          {applicationTotal === 0 ? (
            <EmptyState title="No applications yet" message="Your application activity will appear here." />
          ) : (
            <div className="assist-progress">
              {progress.map(([status, label]) => (
                <Link key={status} href={`/applications?status=${status}`}>
                  <span>{label}</span>
                  <strong>{counts[status] ?? 0}</strong>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
