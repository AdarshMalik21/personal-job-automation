"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardSummary, getDashboardSummary } from "../../lib/api";

const tokenKey = "job-automation-token";

export default function DashboardPage() {
    const router = useRouter();
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        const token = localStorage.getItem(tokenKey);
        if (!token) {
            router.replace("/login");
            return;
        }
        getDashboardSummary(token).then((result) => {
            if (!result.data) throw new Error("Dashboard response was incomplete");
            setSummary(result.data);
        }).catch((requestError: unknown) => {
            localStorage.removeItem(tokenKey);
            setError(requestError instanceof Error ? requestError.message : "Unable to load dashboard");
            router.replace("/login");
        });
    }, [router]);

    const signOut = () => {
        localStorage.removeItem(tokenKey);
        router.replace("/login");
    };

    if (error) return <main className="loading-shell">{error}</main>;
    if (!summary) return <main className="loading-shell">Loading workspace...</main>;

    return (
        <main className="dashboard-shell">
            <header className="topbar"><div><div className="eyebrow">PERSONAL JOB AUTOMATION</div><h1>Control room</h1></div><button className="quiet-button" onClick={signOut}>Sign out</button></header>
            <section className="intro"><div><p className="kicker">Sunday, October 4, 2026</p><h2>Good morning. Your signal is clear.</h2><p>Phase 1 is online. The system is ready to become useful without getting in your way.</p></div><div className={`status-pill ${summary.systemStatus}`}><span />{summary.systemStatus === "healthy" ? "All systems operational" : "Service setup in progress"}</div></section>
            <section className="metric-grid" aria-label="System metrics">
                <article className="metric-card accent"><span>System status</span><strong>{summary.systemStatus}</strong><small>API and service connectivity</small></article>
                <article className="metric-card"><span>Database</span><strong>{summary.databaseStatus}</strong><small>MongoDB connection</small></article>
                <article className="metric-card"><span>Redis</span><strong>{summary.redisStatus}</strong><small>Connection foundation</small></article>
                <article className="metric-card"><span>Tracked jobs</span><strong>{summary.totalJobs}</strong><small>Discovery starts in Phase 2</small></article>
                <article className="metric-card"><span>Applications</span><strong>{summary.totalApplications}</strong><small>History is retained indefinitely</small></article>
            </section>
            <section className="next-section"><div><p className="kicker">FOUNDATION STATUS</p><h3>Your workspace is ready for the next layer.</h3></div><p>Authentication, shared models, health checks, and service connections are established. No automation runs until you choose to add it.</p></section>
        </main>
    );
}
