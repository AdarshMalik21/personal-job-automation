import type { Page } from "playwright";
import {
  clickFinalControl,
  findFinalControl,
  isFinalSubmissionControl,
  pageSecurityStatus,
  writeApplicationField,
} from "./applicationRunner.js";
import { pageText, selectApplicationFrame } from "./applicationPageInspector.js";
import type { ReviewedApplicationField } from "./browserRunTypes.js";

export type SubmissionAttempt = {
  status:
    | "SUBMITTED"
    | "SUBMISSION_FAILED"
    | "SUBMISSION_UNKNOWN"
    | "CANCELLED"
    | "CAPTCHA_REQUIRED"
    | "OTP_REQUIRED"
    | "TWO_FACTOR_REQUIRED"
    | "LOGIN_REQUIRED";
  clicked: boolean;
  confirmationDetected: boolean;
  url?: string;
  reason?: string;
  error?: string;
};

export const isSubmissionConfirmation = (text: string): boolean =>
  /thank you for applying|application (has been |was )?submitted|we(?:'ve| have) received your application|application received|successfully submitted|your application has been sent/.test(
    text,
  );

const stoppedAttempt = (): SubmissionAttempt => ({
  status: "CANCELLED",
  clicked: false,
  confirmationDetected: false,
  reason: "Browser run stopped by user",
});

export const submitHeldApplication = async (
  page: Page,
  input: {
    isStopped: () => boolean;
    fields: ReviewedApplicationField[];
    expectedControl?: string;
  },
): Promise<SubmissionAttempt> => {
  if (input.isStopped()) return stoppedAttempt();
  const surface = await selectApplicationFrame(page);
  const security = pageSecurityStatus(await pageText(surface).catch(() => ""));
  if (
    security === "CAPTCHA_REQUIRED" ||
    security === "OTP_REQUIRED" ||
    security === "TWO_FACTOR_REQUIRED" ||
    security === "LOGIN_REQUIRED"
  ) {
    return {
      status: security,
      clicked: false,
      confirmationDetected: false,
      url: page.url(),
      reason: "Security challenge detected; it was not bypassed",
    };
  }
  for (const field of input.fields) {
    if (!field.currentValue || field.type === "file" || field.type === "checkbox") continue;
    const verified = await writeApplicationField(surface, field, field.currentValue);
    if (field.required && !verified) {
      return {
        status: "SUBMISSION_FAILED",
        clicked: false,
        confirmationDetected: false,
        url: page.url(),
        reason: `Edited value for ${field.label ?? field.elementId} could not be verified in the browser`,
      };
    }
  }
  if (input.isStopped()) return stoppedAttempt();
  const liveControl = await findFinalControl(surface);
  if (!liveControl || !isFinalSubmissionControl(liveControl)) {
    return {
      status: "SUBMISSION_FAILED",
      clicked: false,
      confirmationDetected: false,
      url: page.url(),
      reason: "Final submission control is no longer present",
    };
  }
  if (
    input.expectedControl &&
    input.expectedControl !== "Submit" &&
    liveControl.trim().toLowerCase() !== input.expectedControl.trim().toLowerCase()
  ) {
    return {
      status: "SUBMISSION_FAILED",
      clicked: false,
      confirmationDetected: false,
      url: page.url(),
      reason: "Final submission control changed",
    };
  }
  try {
    const clicked = await clickFinalControl(surface, liveControl);
    if (!clicked) {
      return {
        status: "SUBMISSION_FAILED",
        clicked: false,
        confirmationDetected: false,
        url: page.url(),
        reason: "Final submission control could not be clicked",
      };
    }
  } catch (error) {
    return {
      status: "SUBMISSION_FAILED",
      clicked: false,
      confirmationDetected: false,
      url: page.url(),
      error: error instanceof Error ? error.message : "Final submission click failed",
      reason: "Final submission click failed",
    };
  }
  try {
    if (typeof surface.waitForLoadState === "function") {
      await surface.waitForLoadState("domcontentloaded", { timeout: 10_000 });
    }
  } catch {
    await page.waitForTimeout?.(1_000).catch(() => undefined);
  }
  const confirmationText = [
    await pageText(page).catch(() => ""),
    await pageText(surface).catch(() => ""),
  ].join(" ");
  const confirmationDetected = isSubmissionConfirmation(confirmationText);
  return {
    status: confirmationDetected ? "SUBMITTED" : "SUBMISSION_UNKNOWN",
    clicked: true,
    confirmationDetected,
    url: page.url(),
    reason: confirmationDetected
      ? "Submission confirmation detected"
      : "Final control was clicked, but submission was not confirmed",
  };
};

export const submissionRuntime = {
  submit: submitHeldApplication,
};
