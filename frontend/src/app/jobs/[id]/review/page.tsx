"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ApplicationReview,
  cancelReviewedApplication,
  getApplicationReview,
  prepareApplication,
  stopBrowserRun,
  submitReviewedApplication,
  updateReviewField,
} from "../../../../lib/api";

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

  const prepareForReview = async () => {
    const storedToken = token ?? localStorage.getItem(tokenKey);
    if (!storedToken) return;
    setBusy(true);
    setError("");
    try {
      await prepareApplication(storedToken, params.id);
      await load(storedToken);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Preparation failed");
    } finally {
      setBusy(false);
    }
  };

  if (error && /preparation/i.test(error)) {
    return (
      <main className="loading-shell">
        <div>
          <p className="form-error">{error}</p>
          <p>Prepare the application before reviewing its fields. Nothing is submitted.</p>
          <button className="primary-button" type="button" disabled={busy} onClick={prepareForReview}>Prepare application</button>
          <Link className="text-button" href={`/jobs/${params.id}`}>View Job</Link>
        </div>
      </main>
    );
  }
  if (error) return <main className="loading-shell"><p className="form-error">{error}</p></main>;
  if (!review || !token) return <main className="loading-shell">Loading application review...</main>;

  const job = review.job;
  const cover = review.preparation.coverLetter;
  const resume = review.preparation.tailoredResume;
  const fields = review.browserRun.fields ?? [];
  const saveField = async (elementId: string, value: string) => {
    setNotice("");
    const result = await updateReviewField(token, params.id, elementId, value);
    setNotice(result.success ? "Field saved for this application." : result.message ?? "Field was not synchronized.");
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
        <button className="primary-button" disabled={!review.canSubmit || busy} onClick={() => setConfirming(true)}>Approve & Submit Application</button>
      </div>
    </header>
    {notice && <p className="review-meta">{notice}</p>}
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
          {fields.map((item) => <FieldEditor key={item.elementId} field={item} onSave={saveField} />)}
          {fields.length === 0 && <p>No browser fields have been captured yet.</p>}
        </section>
      </div>
      <aside>
        <section className="review-card">
          <p className="kicker">APPROVAL</p>
          <p>Final control: {review.browserRun.finalControl ?? "Not detected"}</p>
          <p>{review.browserRun.reason}</p>
          <p>Browser session: {review.browserRun.sessionAvailable ? "available" : "unavailable"}</p>
          {review.blockers.length > 0 && <ul className="blocker-list">{review.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
          <button className="primary-button" disabled={!review.canSubmit || busy} onClick={() => setConfirming(true)}>Approve & Submit Application</button>
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
          <button className="danger-button" onClick={confirmSubmit} disabled={busy || !review.canSubmit}>Confirm submission</button>
        </div>
      </section>
    </div>}
  </main>;
}

function FieldEditor({
  field,
  onSave,
}: {
  field: NonNullable<ApplicationReview["browserRun"]["fields"]>[number];
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
      <input aria-label={field.label ?? field.elementId} value={value} onChange={(event) => setValue(event.target.value)} />
      <button className="quiet-button" type="submit">Save</button>
    </form>}
  </article>;
}
