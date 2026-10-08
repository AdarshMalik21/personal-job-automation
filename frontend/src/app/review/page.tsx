"use client";

import { useMemo, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { EmptyState, JobCard } from "../../components/JobCard";
import { useWorkspace } from "../../lib/useWorkspace";
import { experienceLabel, filterReview, reviewJobs, reviewReasons, type ReviewFilter } from "../../lib/jobActions";

const empty: ReviewFilter = { role: "", location: "", experience: "", reviewReason: "" };

export default function ReviewPage() {
  const workspace = useWorkspace();
  const [filter, setFilter] = useState<ReviewFilter>(empty);
  const source = reviewJobs(workspace.jobs);
  const jobs = useMemo(() => filterReview(source, filter), [source, filter]);
  const experiences = [...new Set(source.map(experienceLabel))];
  const reasons = [...new Set(source.flatMap(reviewReasons))];

  if (workspace.loading || !workspace.token) return <main className="loading-shell">Loading jobs that need review...</main>;
  if (workspace.error) return <main className="loading-shell"><p className="form-error">{workspace.error}</p></main>;

  return (
    <AppShell onSignOut={workspace.signOut}>
      <main className="assist-page">
        <header className="assist-page-title">
          <h1>Needs Review</h1>
          <p>Jobs where the system needs your decision.</p>
        </header>
        <div className="assist-filters">
          <label>Role<input value={filter.role} onChange={(event) => setFilter({ ...filter, role: event.target.value })} placeholder="Engineer" /></label>
          <label>Location<input value={filter.location} onChange={(event) => setFilter({ ...filter, location: event.target.value })} placeholder="Remote" /></label>
          <label>Experience
            <select value={filter.experience} onChange={(event) => setFilter({ ...filter, experience: event.target.value })}>
              <option value="">Any</option>
              {experiences.map((value) => <option key={value} value={value}>{value.replace("Experience: ", "")}</option>)}
            </select>
          </label>
          <label>Review Reason
            <select value={filter.reviewReason} onChange={(event) => setFilter({ ...filter, reviewReason: event.target.value })}>
              <option value="">Any</option>
              {reasons.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>
        {jobs.length === 0 ? (
          <EmptyState title="Nothing needs review" message="There are no jobs requiring your decision." />
        ) : (
          <div className="assist-cards">
            {jobs.map((job) => <JobCard key={job.id} job={job} token={workspace.token ?? ""} variant="review" />)}
          </div>
        )}
      </main>
    </AppShell>
  );
}
