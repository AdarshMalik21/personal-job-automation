import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { beginApplicationReview, createRunGuard, reviewPresentation } from "./browserFlow.js";

describe("application browser flow", () => {
  it("calls browser run only after preparation succeeds", async () => {
    const calls: string[] = [];
    const result = await beginApplicationReview({
      prepare: async () => { calls.push("prepare"); },
      startBrowser: async () => { calls.push("browser"); },
    });
    assert.equal(result.status, "ready");
    assert.deepEqual(calls, ["prepare", "browser"]);
  });

  it("does not start the browser when preparation fails", async () => {
    let started = 0;
    const result = await beginApplicationReview({
      prepare: async () => { throw new Error("Application preparation requires additional information."); },
      startBrowser: async () => { started += 1; },
    });
    assert.equal(result.status, "prepare_failed");
    if (result.status === "prepare_failed") assert.equal(result.message, "Application preparation requires additional information.");
    assert.equal(started, 0);
  });

  it("reports a browser failure without treating the session as ready", async () => {
    const thrown = await beginApplicationReview({
      prepare: async () => undefined,
      startBrowser: async () => { throw new Error("Unable to start browser automation."); },
    });
    assert.equal(thrown.status, "browser_failed");
    const reported = await beginApplicationReview({
      prepare: async () => undefined,
      startBrowser: async () => ({ data: { browserRun: { status: "FAILED", reason: "The application page could not be opened." } } }),
    });
    assert.equal(reported.status, "browser_failed");
    if (reported.status === "browser_failed") assert.equal(reported.message, "The application page could not be opened.");
  });

  it("ignores a second click while a browser run is starting", async () => {
    let started = 0;
    const guard = createRunGuard();
    let release: () => void = () => undefined;
    const first = guard(() => new Promise((resolve) => { release = resolve; started += 1; }));
    const second = await guard(async () => { started += 1; });
    release();
    assert.equal(await first, true);
    assert.equal(second, false);
    assert.equal(started, 1);
  });

  it("shows review, approval, and restart states from the backend status", () => {
    const paused = reviewPresentation({ status: "PAUSED_FOR_REVIEW", sessionAvailable: true, canSubmit: false, finalControl: "Submit" });
    assert.equal(paused.heading, "Application ready for review.");
    assert.equal(paused.browser, "Connected");
    assert.equal(paused.allowSubmit, false);
    const ready = reviewPresentation({ status: "READY_FOR_SUBMISSION", sessionAvailable: true, canSubmit: true, finalControl: "Submit application" });
    assert.equal(ready.allowSubmit, true);
    const expired = reviewPresentation({ status: "BROWSER_SESSION_EXPIRED", sessionAvailable: false });
    assert.equal(expired.startLabel, "Restart Browser Run");
    assert.equal(expired.allowSubmit, false);
    assert.equal(expired.allowFieldEdit, false);
    const failed = reviewPresentation({ status: "FAILED", reason: "The application page could not be opened." });
    assert.equal(failed.detail, "The application page could not be opened.");
    assert.equal(failed.startLabel, "Retry Browser Run");
    assert.equal(failed.allowSubmit, false);
    const running = reviewPresentation({ status: "RUNNING", sessionAvailable: false });
    assert.equal(running.heading, "Preparing application...");
    assert.equal(running.showStart, false);
    assert.equal(running.allowSubmit, false);
    const idle = reviewPresentation({});
    assert.equal(idle.heading, "Browser automation has not started.");
    assert.equal(idle.startLabel, "Start Browser Run");
    const unsafeReady = reviewPresentation({ status: "READY_FOR_SUBMISSION", sessionAvailable: true, canSubmit: false, finalControl: "Submit application" });
    assert.equal(unsafeReady.allowSubmit, false);
  });
});