export type BrowserFlowResult =
  | { status: "ready" }
  | { status: "prepare_failed"; message: string }
  | { status: "browser_failed"; message: string };

const browserRunOf = (result: unknown): { status?: string; reason?: string } | undefined => {
  if (!result || typeof result !== "object") return undefined;
  const data = (result as { data?: { browserRun?: { status?: string; reason?: string } } }).data;
  return data?.browserRun;
};

export const beginApplicationReview = async (actions: {
  prepare: () => Promise<unknown>;
  startBrowser: () => Promise<unknown>;
}): Promise<BrowserFlowResult> => {
  try {
    await actions.prepare();
  } catch (error) {
    return {
      status: "prepare_failed",
      message: error instanceof Error && error.message ? error.message : "Application preparation requires additional information.",
    };
  }
  try {
    const result = await actions.startBrowser();
    const run = browserRunOf(result);
    if (run?.status === "FAILED") {
      return { status: "browser_failed", message: run.reason?.trim() || "Unable to start browser automation." };
    }
    return { status: "ready" };
  } catch (error) {
    return {
      status: "browser_failed",
      message: error instanceof Error && error.message ? error.message : "Unable to start browser automation.",
    };
  }
};

export const createRunGuard = () => {
  let running = false;
  return async (task: () => Promise<void>): Promise<boolean> => {
    if (running) return false;
    running = true;
    try {
      await task();
      return true;
    } finally {
      running = false;
    }
  };
};

export type ReviewPresentation = {
  heading: string;
  detail: string;
  browser: string;
  showStart: boolean;
  startLabel: "Start Browser Run" | "Restart Browser Run" | "Retry Browser Run";
  allowSubmit: boolean;
  allowFieldEdit: boolean;
};

export const reviewPresentation = (input: {
  status?: string;
  sessionAvailable?: boolean;
  canSubmit?: boolean;
  finalControl?: string;
  reason?: string;
}): ReviewPresentation => {
  const status = input.status ?? "NOT_STARTED";
  const live = input.sessionAvailable === true;
  if (status === "RUNNING" || status === "SUBMITTING") {
    return {
      heading: "Preparing application...",
      detail: "The browser is opening the application page and safely filling the detected fields. Please wait.",
      browser: "Working",
      showStart: false,
      startLabel: "Start Browser Run",
      allowSubmit: false,
      allowFieldEdit: false,
    };
  }
  if (status === "BROWSER_SESSION_EXPIRED" || (status === "PAUSED_FOR_REVIEW" && !live) || (status === "READY_FOR_SUBMISSION" && !live)) {
    return {
      heading: "Browser session expired",
      detail: "Your application preparation is still saved. The live browser session is no longer available.",
      browser: "Unavailable",
      showStart: true,
      startLabel: "Restart Browser Run",
      allowSubmit: false,
      allowFieldEdit: false,
    };
  }
  if (status === "FAILED") {
    return {
      heading: "Browser automation failed",
      detail: input.reason?.trim() || "Unable to start browser automation.",
      browser: "Unavailable",
      showStart: true,
      startLabel: "Retry Browser Run",
      allowSubmit: false,
      allowFieldEdit: false,
    };
  }
  if (status === "READY_FOR_SUBMISSION" && live) {
    return {
      heading: "Application is ready for final submission.",
      detail: input.finalControl ? `Final submission control: ${input.finalControl}` : "Final submission control: Not detected",
      browser: "Connected",
      showStart: true,
      startLabel: "Restart Browser Run",
      allowSubmit: input.canSubmit === true,
      allowFieldEdit: true,
    };
  }
  if (status === "PAUSED_FOR_REVIEW" && live) {
    return {
      heading: "Application ready for review.",
      detail: input.finalControl ? `Final submission control: ${input.finalControl}` : "Final submission control: Not detected",
      browser: "Connected",
      showStart: false,
      startLabel: "Start Browser Run",
      allowSubmit: input.canSubmit === true,
      allowFieldEdit: true,
    };
  }
  return {
    heading: "Browser automation has not started.",
    detail: "Start the browser when you are ready to review this application. Nothing is submitted.",
    browser: "Not started",
    showStart: true,
    startLabel: "Start Browser Run",
    allowSubmit: false,
    allowFieldEdit: false,
  };
};
