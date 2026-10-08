"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getJob, prepareApplication, type DashboardJob } from "../../../lib/api";
import {
  applicationLabel,
  detailAction,
  exclusionReason,
  experienceLabel,
  isRecommended,
  matchReasons,
  needsReview,
  placeLabel,
  plainDescription,
  postedLabel,
  requirementLines,
  reviewReasons,
} from "../../../lib/jobActions";

const tokenKey = "job-automation-token";

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [job, setJob] = useState<DashboardJob>();
  const [token, setToken] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem(tokenKey);
    if (!storedToken) {
      router.replace("/login");
      return;
    }
    setToken(storedToken);
    getJob(storedToken, params.id)
      .then((result) => {
        if (!result.data) throw new Error("Job response was incomplete");
        setJob(result.data.job);
      })
      .catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "Unable to load job"));
  }, [params.id, router]);

  if (error) return <main className="loading-shell"><p className="form-error">{error}</p></main>;
  if (!job || !token) return <main className="loading-shell">Loading job...</main>;

  const actionable = isRecommended(job) || needsReview(job) || job.applicationStatus !== "not_applied";
  const action = detailAction(job);
  const reasons = needsReview(job) ? reviewReasons(job) : isRecommended(job) ? matchReasons(job) : [exclusionReason(job)];
  const run = async () => {
    if (!action.prepare) {
      router.push(action.href ?? `/jobs/${job.id}/review`);
      return;
    }
    setBusy(true);
    try {
      await prepareApplication(token, job.id);
      router.push(`/jobs/${job.id}/review`);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Preparation failed");
      setBusy(false);
    }
  };

  return (
    <main className="assist-page assist-detail">
      <Link className="assist-back" href="/dashboard">Back to dashboard</Link>
      <header className="assist-detail-top">
        <div>
          <p className="assist-company">{job.company}</p>
          <h1>{job.title}</h1>
          <p className="assist-meta">{placeLabel(job)}</p>
          <p>{experienceLabel(job)}</p>
          <p className="assist-meta">{postedLabel(job)}</p>
          <p className="assist-status">Status: {applicationLabel(job.applicationStatus)}</p>
        </div>
        {actionable && <button className="assist-primary" type="button" onClick={run} disabled={busy}>{busy ? "Preparing" : action.label}</button>}
      </header>
      <section>
        <h2>{needsReview(job) ? "Why this needs review" : isRecommended(job) ? "Why this job matches you" : "Why this job is excluded"}</h2>
        <ul className="assist-reasons">{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </section>
      <section>
        <h2>Requirements</h2>
        <ul className="assist-reasons">{requirementLines(job).map((line) => <li key={line}>{line}</li>)}</ul>
      </section>
      <section>
        <h2>Job Description</h2>
        <p className="assist-description">{plainDescription(job.description)}</p>
      </section>
      <section>
        <h2>Application</h2>
        <p className="assist-status">Status: {applicationLabel(job.applicationStatus)}</p>
      </section>
    </main>
  );
}
