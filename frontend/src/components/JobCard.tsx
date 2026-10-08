"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { DashboardJob } from "../lib/api";
import { prepareApplication, startBrowserRun } from "../lib/api";
import { beginApplicationReview, createRunGuard } from "../lib/browserFlow";
import {
  applicationLabel,
  experienceLabel,
  matchLabel,
  matchReasons,
  placeLabel,
  postedLabel,
  recommendedAction,
  reviewReasons,
} from "../lib/jobActions";

export function JobCard({
  job,
  token,
  variant,
}: {
  job: DashboardJob;
  token: string;
  variant: "recommended" | "review";
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retryBrowser, setRetryBrowser] = useState(false);
  const guard = useRef(createRunGuard());
  const action = recommendedAction(job);
  const prepare = async () => {
    if (!action.prepare && !retryBrowser) {
      window.location.assign(action.href ?? `/jobs/${job.id}`);
      return;
    }
    setError("");
    await guard.current(async () => {
      setBusy(true);
      try {
        const outcome = await beginApplicationReview({
          prepare: () => retryBrowser ? Promise.resolve() : prepareApplication(token, job.id),
          startBrowser: () => startBrowserRun(token, job.id),
        });
        if (outcome.status === "prepare_failed") {
          setRetryBrowser(false);
          setError(outcome.message);
          return;
        }
        if (outcome.status === "browser_failed") {
          setRetryBrowser(true);
          setError(outcome.message);
          return;
        }
        window.location.assign(`/jobs/${job.id}/review`);
      } finally {
        setBusy(false);
      }
    });
  };

  return (
    <article className="assist-card">
      <p className="assist-company">{job.company}</p>
      <h3>{job.title}</h3>
      <p className="assist-meta">{placeLabel(job)}</p>
      <p>{experienceLabel(job)}</p>
      {variant === "recommended" && <p className="assist-score">{matchLabel(job)}</p>}
      {variant === "recommended" && <p className="assist-meta">{postedLabel(job)}</p>}
      <div className="assist-why">
        <p>{variant === "recommended" ? "Why this matches" : "Why review"}</p>
        <ul>
          {(variant === "recommended" ? matchReasons(job) : reviewReasons(job)).map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      </div>
      <p className="assist-status">Status: {applicationLabel(job.applicationStatus)}</p>
      {error && <p className="assist-error">{error}</p>}
      {variant === "review" ? (
        <Link className="assist-primary" href={`/jobs/${job.id}`}>Review</Link>
      ) : action.prepare ? (
        <button className="assist-primary" type="button" onClick={prepare} disabled={busy}>{busy ? "Preparing application..." : retryBrowser ? "Retry Browser Run" : action.label}</button>
      ) : (
        <Link className="assist-primary" href={action.href ?? `/jobs/${job.id}`}>{action.label}</Link>
      )}
    </article>
  );
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return (
    <div className="assist-empty">
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}
