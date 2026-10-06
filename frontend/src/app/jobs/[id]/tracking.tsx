"use client";

import { useEffect, useState } from "react";
import {
  ApplicationFollowUpView,
  ApplicationTracking,
  getApplicationFollowUp,
  getApplicationTracking,
  prepareApplicationFollowUp,
  updateApplicationStatus,
} from "../../../lib/api";

const statuses = ["interview", "offer", "rejected", "withdrawn", "follow_up_required"];

export function ApplicationTrackingPanel({ token, jobId }: { token: string; jobId: string }) {
  const [tracking, setTracking] = useState<ApplicationTracking>();
  const [followUp, setFollowUp] = useState<ApplicationFollowUpView>();
  const [status, setStatus] = useState("interview");
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      const [trackingResult, followUpResult] = await Promise.all([
        getApplicationTracking(token, jobId),
        getApplicationFollowUp(token, jobId),
      ]);
      setTracking(trackingResult.data?.application);
      setFollowUp(followUpResult.data?.followUp);
      setDraft(followUpResult.data?.followUp.draft?.body ?? "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No application is recorded for this job yet.");
    }
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, [jobId, token]);

  if (!tracking) return <section className="detail-panel"><p className="kicker">APPLICATION TRACKING</p><p>{message || "Loading application tracking..."}</p></section>;

  const saveStatus = async () => {
    const result = await updateApplicationStatus(token, jobId, status, note);
    setMessage(result.success ? "Status updated. Nothing was submitted." : result.message ?? "Status update failed.");
    if (result.success) await load();
  };
  const saveDraft = async () => {
    const result = await prepareApplicationFollowUp(token, jobId, draft);
    setMessage(result.success ? "Follow-up draft saved. No email was sent." : result.message ?? "Follow-up was not prepared.");
    if (result.success) await load();
  };

  return <section className="detail-panel">
    <p className="kicker">APPLICATION TRACKING</p>
    <p>Status: {tracking.status?.replaceAll("_", " ")}{tracking.appliedDate ? ` · Submitted ${new Date(tracking.appliedDate).toLocaleDateString()}` : ""}{tracking.lastStatusUpdate ? ` · Last update ${new Date(tracking.lastStatusUpdate).toLocaleDateString()}` : ""}</p>
    <p>Follow-up: {followUp?.status ?? tracking.followUpStatus ?? "none"}{followUp?.eligible ? " · eligible" : ""}{followUp?.reason ? ` · ${followUp.reason}` : ""}</p>
    {message && <p className="review-meta">{message}</p>}
    <label className="filter-field"><span>Update status</span>
      <select value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>
    </label>
    <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note" />
    <button className="quiet-button" onClick={saveStatus}>Save status</button>
    <ul className="reason-list">{(tracking.history ?? []).map((event, index) => <li key={`${event.timestamp}-${index}`}>{event.type}{event.note ? ` — ${event.note}` : ""} · {event.source} · {new Date(event.timestamp).toLocaleString()}</li>)}</ul>
    <p className="kicker">FOLLOW-UP DRAFT</p>
    {(followUp?.draft?.missingInformation ?? []).length > 0 && <p>Needs information: {followUp?.draft?.missingInformation?.join(", ")}</p>}
    <textarea className="tracking-draft" value={draft} onChange={(event) => setDraft(event.target.value)} rows={10} />
    <button className="quiet-button" onClick={saveDraft}>Save follow-up draft</button>
  </section>;
}
