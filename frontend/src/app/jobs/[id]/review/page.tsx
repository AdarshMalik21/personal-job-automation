"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApplicationReview,
  cancelReviewedApplication,
  getApplicationReview,
  getBrowserRun,
  prepareApplication,
  startBrowserRun,
  stopBrowserRun,
  submitReviewedApplication,
  updateReviewField,
} from "../../../../lib/api";
import { beginApplicationReview, createRunGuard, reviewPresentation } from "../../../../lib/browserFlow";

const tokenKey = "job-automation-token";
const text = (value: string | undefined) =>
  value?.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim() ?? "";

export default function ApplicationReviewPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [token, setToken] = useState<string>();
  const [review, setReview] = useState<ApplicationReview>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const guard = useRef(createRunGuard());
  const prepared = useRef(false);

  const load = useCallback(async (storedToken: string) => {
    const result = await getApplicationReview(storedToken, params.id);
    if (!result.data) throw new Error("Review response was incomplete");
    setReview(result.data.review);
  }, [params.id]);

  useEffect(() => {
    const storedToken = localStorage.getItem(tokenKey);
    if (!storedToken) {
      router.replace("/login");
      return;
    }
    setToken(storedToken);
    load(storedToken).catch((requestError: unknown) => {
      setError(requestError instanceof Error ? requestError.message : "Unable to load review");
    });
  }, [load, router]);

  useEffect(() => {
    if (!token || review?.browserRun.status !== "RUNNING") return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      getBrowserRun(token, params.id)
        .then((result) => {
          const status = result.data?.browserRun.status;
          if (!status || status === "RUNNING") return;
          load(token).catch(() => undefined);
        })
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [load, params.id, review?.browserRun.status, token]);

  const prepareForReview = async () => {
    const storedToken = token ?? localStorage.getItem(tokenKey);
    if (!storedToken) return;
    setError("");
    const started = await guard.current(async () => {
      setBusy(true);
      try {
        const outcome = await beginApplicationReview({
          prepare: async () => {
            if (prepared.current) return;
            await prepareApplication(storedToken, params.id);
            prepared.current = true;
          },
          startBrowser: () => startBrowserRun(storedToken, params.id),
        });
        if (outcome.status === "prepare_failed") {
          setError(outcome.message);
          return;
        }
        if (outcome.status === "browser_failed") {
          setError(outcome.message);
          return;
        }
        await load(storedToken);
      } finally {
        setBusy(false);
      }
    });
    if (!started) return;
  };
  if (!review || !token) {
    if (error) {
      const retry = /browser|automation|opened/i.test(error);
      return (
        <main className="loading-shell">
          <div>
            <p className="form-error">{error}</p>
            <p>{retry ? "The application preparation is still saved." : "Prepare the application before reviewing its fields. Nothing is submitted."}</p>
            <button className="primary-button" type="button" disabled={busy} onClick={prepareForReview}>{retry ? "Retry Browser Run" : "Prepare application"}</button>
            <Link className="text-button" href={`/jobs/${params.id}`}>View Job</Link>
          </div>
        </main>
      );
    }
    return <main className="loading-shell">Loading application review...</main>;
  }

  const view = reviewPresentation({
    status: review.browserRun.status,
    sessionAvailable: review.browserRun.sessionAvailable,
    canSubmit: review.canSubmit,
    finalControl: review.browserRun.finalControl,
    reason: review.browserRun.reason,
  });
  const startBrowser = async () => {
    setError("");
    setNotice("");
    await guard.current(async () => {
      setBusy(true);
      try {
        const result = await startBrowserRun(token, params.id);
        if (result.data?.browserRun.status === "FAILED") {
          setError(result.data.browserRun.reason?.trim() || "Unable to start browser automation.");
        }
        await load(token);
      } catch (requestError: unknown) {
        setError(requestError instanceof Error ? requestError.message : "Unable to start browser automation.");
      } finally {
        setBusy(false);
      }
    });
  };

  const job = review.job;
  const cover = review.preparation.coverLetter;
  const resume = review.preparation.tailoredResume;
  const fields = review.browserRun.fields ?? [];
  const saveField = async (elementId: string, value: string) => {
    setNotice("");
    const result = await updateReviewField(token, params.id, elementId, value);
    const expired = /expired/i.test(result.message ?? "");
    setNotice(result.success ? "Field saved for this application." : expired ? "Session expired — restart browser automation to continue editing." : result.message ?? "Field was not synchronized.");
    await load(token).catch(() => undefined);
  };
  const cancel = async () => {
    setBusy(true);
    const result = await cancelReviewedApplication(token, params.id);
    setNotice(result.success ? "Application cancelled. Nothing was submitted." : result.message ?? "Cancel failed.");
    setConfirming(false);
    await load(token).catch(() => undefined);
    setBusy(false);
  };
  const stop = async () => {
    setBusy(true);
    const result = await stopBrowserRun(token, params.id);
    setNotice(result.success ? "Browser run stopped. Nothing was submitted." : result.message ?? "Stop failed.");
    setConfirming(false);
    await load(token).catch(() => undefined);
    setBusy(false);
  };
  const confirmSubmit = async () => {
    setBusy(true);
    const result = await submitReviewedApplication(token, params.id);
    setNotice(result.message ?? result.data?.submission.reason ?? result.data?.submission.status ?? "Submission finished.");
    setConfirming(false);
    await load(token).catch(() => undefined);
    setBusy(false);
  };

  return <main className="dashboard-shell detail-shell review-shell">
    <header className="topbar">
      <div>
        <Link className="back-link" href={`/jobs/${params.id}`}>← Back to job</Link>
        <p className="eyebrow">APPLICATION REVIEW</p>
        <h1>{job.title}</h1>
        <p className="review-meta">Opening this page does not submit the application.</p>
      </div>
      <div className="detail-actions">
        {review.browserRun.sessionAvailable && <button className="danger-button" onClick={stop} disabled={busy}>Stop browser</button>}
        <button className="quiet-button" onClick={cancel} disabled={busy || review.application?.status === "submitted"}>Cancel</button>
        {view.showStart && <button className="primary-button" type="button" onClick={startBrowser} disabled={busy}>{view.startLabel}</button>}
        <button className="primary-button" disabled={!view.allowSubmit || busy} onClick={() => setConfirming(true)}>Approve & Submit Application</button>
      </div>
    </header>
    {error && <p className="form-error">{error}</p>}
    {notice && <p className="review-meta">{notice}</p>}
    <section className="review-card">
      <p className="kicker">BROWSER</p>
      <h2>{view.heading}</h2>
      <p>{view.detail}</p>
      <p>Browser: {view.browser}</p>
      <p>Final submission control: {review.browserRun.finalControl ?? "Not detected"}</p>
      <p>{review.browserRun.fieldsDetected ?? fields.length} fields captured · {(review.browserRun.unresolvedFields ?? []).length} require review</p>
    </section>
    <div className="review-grid">
      <div>
        <section className="review-card">
          <p className="kicker">JOB</p>
          <h2>{job.company}</h2>
          <p>{job.title} · {job.location ?? "Location unknown"} · {job.source}</p>
          <p>Match {job.matchScore ?? "unknown"} · {job.matchDecision ?? "unknown"} · Freshness {job.freshness?.status ?? "unknown"}</p>
          {job.officialApplicationUrl && <a href={job.officialApplicationUrl} target="_blank" rel="noreferrer">Open official application</a>}
          <ul>{(job.matchExplanation ?? []).map((reason) => <li key={reason}>{reason}</li>)}</ul>
          {(job.requiredSkills ?? []).length > 0 && <p>Requirements: {job.requiredSkills?.join(", ")}</p>}
          <p>{text(job.description) || "Description unavailable."}</p>
        </section>
        <section className="review-card">
          <p className="kicker">RESUME</p>
          <p>{resume?.filePath ?? "No resume file is attached."}</p>
          {resume?.summary && <p>{resume.summary}</p>}
          {(resume?.skills ?? []).length > 0 && <p>Skills: {resume?.skills?.join(", ")}</p>}
          <ul>{(review.preparation.resumeChanges ?? []).map((change) => <li key={change}>{change}</li>)}</ul>
        </section>
        <section className="review-card">
          <p className="kicker">COVER LETTER</p>
          {cover?.status === "not_required" && <p>Not required</p>}
          {cover?.status === "needs_information" && <p>Cover letter required — action needed</p>}
          {cover?.status === "ready_for_review" && <p>{cover.content}</p>}
          {!cover?.status && <p>Not required</p>}
        </section>
        <section className="review-card">
          <p className="kicker">APPLICATION FIELDS</p>
          <p className="review-meta">{review.browserRun.fieldsDetected ?? fields.length} detected · {review.browserRun.pagesProcessed ?? 0} pages · {review.browserRun.status}</p>
          {fields.map((item) => <FieldEditor key={item.elementId} field={item} disabled={!view.allowFieldEdit || busy} onSave={saveField} />)}
          {fields.length === 0 && <p>No browser fields have been captured yet.</p>}
        </section>
      </div>
      <aside>
        <section className="review-card">
          <p className="kicker">APPROVAL</p>
          <p>Final control: {review.browserRun.finalControl ?? "Not detected"}</p>
          <p>{review.browserRun.reason}</p>
          <p>Browser session: {review.browserRun.sessionAvailable ? "available" : "unavailable"}</p>
          {view.showStart && <button className="primary-button" type="button" onClick={startBrowser} disabled={busy}>{view.startLabel}</button>}
          {review.blockers.length > 0 && <ul className="blocker-list">{review.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
          <button className="primary-button" disabled={!view.allowSubmit || busy} onClick={() => setConfirming(true)}>Approve & Submit Application</button>
        </section>
        <section className="review-card">
          <p className="kicker">MISSING INFORMATION</p>
          {(review.preparation.missingInformation ?? []).length === 0 ? (
            <p>No missing application information is recorded.</p>
          ) : (
            <ul>{(review.preparation.missingInformation ?? []).map((item) => <li key={item}>{item}</li>)}</ul>
          )}
        </section>
        <section className="review-card">
          <p className="kicker">PREPARED ANSWERS</p>
          <ul>{(review.preparation.generatedAnswers ?? []).map((answer) => <li key={answer.question}>{answer.question}: {answer.answer ?? answer.status}</li>)}</ul>
          {(review.preparation.warnings ?? []).map((warning) => <p key={warning}>{warning}</p>)}
        </section>
      </aside>
    </div>
    {confirming && <div className="confirm-dialog" role="dialog" aria-modal="true">
      <section className="confirm-card">
        <h2>You are about to submit this application to {job.company} for {job.title}.</h2>
        <p>{job.officialApplicationUrl}</p>
        <p>Resume: {resume?.filePath ?? "prepared text only, no file upload"}</p>
        <p>Cover letter: {cover?.status === "ready_for_review" ? "included" : cover?.status === "needs_information" ? "Cover letter required — action needed" : "Not required"}</p>
        <p>{fields.length} fields · {(review.browserRun.unresolvedFields ?? []).length} unresolved</p>
        <p>Final control: {review.browserRun.finalControl ?? "Not detected"}</p>
        <div className="detail-actions">
          <button className="quiet-button" onClick={() => setConfirming(false)} disabled={busy}>Go back</button>
          <button className="danger-button" onClick={confirmSubmit} disabled={busy || !view.allowSubmit}>Confirm submission</button>
        </div>
      </section>
    </div>}
  </main>;
}

function FieldEditor({
  field,
  disabled,
  onSave,
}: {
  field: NonNullable<ApplicationReview["browserRun"]["fields"]>[number];
  disabled: boolean;
  onSave: (elementId: string, value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(field.currentValue ?? "");
  const unresolved = field.reviewStatus === "requires_review" || field.reviewStatus === "missing" || (field.required && field.reviewStatus === "unknown");
  return <article className={`field-row${unresolved ? " unresolved" : ""}`}>
    <div className="field-head">
      <strong>{field.label ?? field.elementId}</strong>
      <span className="field-status">{field.required ? "required" : "optional"} · {field.type} · {field.reviewStatus} · {field.source}</span>
    </div>
    {field.type === "file" ? <p>{field.currentValue ?? "No file selected"}</p> : <form className="field-edit" onSubmit={(event) => { event.preventDefault(); void onSave(field.elementId, value); }}>
      <input aria-label={field.label ?? field.elementId} value={value} disabled={disabled} onChange={(event) => setValue(event.target.value)} />
      <button className="quiet-button" type="submit" disabled={disabled}>Save</button>
    </form>}
  </article>;
}
