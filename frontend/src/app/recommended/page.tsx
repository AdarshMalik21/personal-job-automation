"use client";

import { useMemo, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { EmptyState, JobCard } from "../../components/JobCard";
import { useWorkspace } from "../../lib/useWorkspace";
import {
  applicationLabel,
  experienceLabel,
  filterRecommended,
  recommendedJobs,
  type RecommendedFilter,
} from "../../lib/jobActions";

const empty: RecommendedFilter = { role: "", location: "", workMode: "", experience: "", applicationStatus: "" };

export default function RecommendedPage() {
  const workspace = useWorkspace();
  const [filter, setFilter] = useState<RecommendedFilter>(empty);
  const jobs = useMemo(() => filterRecommended(recommendedJobs(workspace.jobs), filter), [workspace.jobs, filter]);
  const source = recommendedJobs(workspace.jobs);
  const experiences = [...new Set(source.map(experienceLabel))];
  const statuses = [...new Set(source.map((job) => applicationLabel(job.applicationStatus)))];
  const modes = [...new Set(source.map((job) => job.remoteStatus ?? "unknown"))];

  if (workspace.loading || !workspace.token) return <main className="loading-shell">Loading recommended jobs...</main>;
  if (workspace.error) return <main className="loading-shell"><p className="form-error">{workspace.error}</p></main>;

  return (
    <AppShell onSignOut={workspace.signOut}>
      <main className="assist-page">
        <header className="assist-page-title">
          <h1>Recommended</h1>
          <p>Jobs that match your experience, skills, role and location.</p>
        </header>
        <div className="assist-filters">
          <label>Role<input value={filter.role} onChange={(event) => setFilter({ ...filter, role: event.target.value })} placeholder="Full stack" /></label>
          <label>Location<input value={filter.location} onChange={(event) => setFilter({ ...filter, location: event.target.value })} placeholder="Delhi" /></label>
          <label>Work Mode
            <select value={filter.workMode} onChange={(event) => setFilter({ ...filter, workMode: event.target.value })}>
              <option value="">Any</option>
              {modes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
            </select>
          </label>
          <label>Experience
            <select value={filter.experience} onChange={(event) => setFilter({ ...filter, experience: event.target.value })}>
              <option value="">Any</option>
              {experiences.map((value) => <option key={value} value={value}>{value.replace("Experience: ", "")}</option>)}
            </select>
          </label>
          <label>Application Status
            <select value={filter.applicationStatus} onChange={(event) => setFilter({ ...filter, applicationStatus: event.target.value })}>
              <option value="">Any</option>
              {statuses.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>
        {jobs.length === 0 ? (
          <EmptyState title="No recommended jobs today" message="Your latest discovery did not find any jobs that currently meet your application criteria." />
        ) : (
          <div className="assist-cards">
            {jobs.map((job) => <JobCard key={job.id} job={job} token={workspace.token ?? ""} variant="recommended" />)}
          </div>
        )}
      </main>
    </AppShell>
  );
}
