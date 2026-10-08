"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { getDashboardSummary, getJobStats, type DashboardSummary, type JobStats } from "../../lib/api";
import { useWorkspace } from "../../lib/useWorkspace";

export default function DiagnosticsPage() {
  const workspace = useWorkspace();
  const [summary, setSummary] = useState<DashboardSummary>();
  const [stats, setStats] = useState<JobStats>();

  useEffect(() => {
    if (!workspace.token) return;
    Promise.all([getDashboardSummary(workspace.token), getJobStats(workspace.token)])
      .then(([summaryResult, statsResult]) => {
        setSummary(summaryResult.data);
        setStats(statsResult.data);
      })
      .catch(() => undefined);
  }, [workspace.token]);

  if (workspace.loading || !workspace.token) return <main className="loading-shell">Loading diagnostics...</main>;

  return (
    <AppShell onSignOut={workspace.signOut}>
      <main className="assist-page">
        <header className="assist-page-title">
          <h1>System Diagnostics</h1>
          <p>Operational status. This page is separate from the jobs you act on.</p>
        </header>
        <div className="assist-progress">
          <div><span>System</span><strong>{summary?.systemStatus ?? "Unknown"}</strong></div>
          <div><span>Database</span><strong>{summary?.databaseStatus ?? "Unknown"}</strong></div>
          <div><span>Queue</span><strong>{summary?.redisStatus ?? "Unknown"}</strong></div>
          <div><span>Stored jobs</span><strong>{stats?.totalJobs ?? summary?.totalJobs ?? "—"}</strong></div>
          <div><span>Apply</span><strong>{stats?.applyCount ?? "—"}</strong></div>
          <div><span>Review</span><strong>{stats?.reviewCount ?? "—"}</strong></div>
          <div><span>Skip</span><strong>{stats?.skipCount ?? "—"}</strong></div>
        </div>
      </main>
    </AppShell>
  );
}
