"use client";

import { useRef, useState } from "react";
import { getDiscoveryRun, startDiscovery } from "../lib/api";
import { formatWhen } from "../lib/jobActions";

export function DiscoveryControl({
  token,
  lastDiscovery,
  onComplete,
  buttonOnly = false,
}: {
  token: string;
  lastDiscovery?: Date;
  onComplete: (completedAt: Date) => void;
  buttonOnly?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const generation = useRef(0);

  const run = async () => {
    if (busy) return;
    const current = generation.current + 1;
    generation.current = current;
    setBusy(true);
    setError("");
    setStatus("Discovery running");
    try {
      const started = await startDiscovery(token);
      if (generation.current !== current) return;
      if (started.data?.status === "already_running") setStatus("Discovery running");
      const jobId = started.data?.jobId;
      if (!jobId) {
        setStatus(started.data?.status === "already_running" ? "Discovery running" : "Discovery could not start");
        return;
      }
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (generation.current !== current) return;
        const result = await getDiscoveryRun(token, jobId);
        const state = result.data?.status;
        if (state === "completed") {
          const completedAt = new Date();
          setStatus("");
          onComplete(completedAt);
          return;
        }
        if (state === "failed") {
          setStatus("");
          setError("Discovery failed");
          return;
        }
      }
      setStatus("Discovery is still running");
    } catch (requestError: unknown) {
      if (generation.current !== current) return;
      setStatus("");
      setError(requestError instanceof Error ? requestError.message : "Discovery could not start");
    } finally {
      if (generation.current === current) setBusy(false);
    }
  };

  const label = error || status || (lastDiscovery ? `Last discovery: ${formatWhen(lastDiscovery)}` : "Last discovery: Not run yet");

  return (
    <div className="assist-discovery">
      <button className="assist-primary" type="button" onClick={run} disabled={busy} aria-busy={busy}>
        {busy ? "Running discovery" : "Run Discovery"}
      </button>
      {buttonOnly ? error && <p className="assist-error">{error}</p> : <p className={error ? "assist-error" : "assist-muted"}>{label}</p>}
    </div>
  );
}
