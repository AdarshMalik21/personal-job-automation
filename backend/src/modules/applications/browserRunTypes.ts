export type BrowserRunStatus =
  | "RUNNING"
  | "PAUSED_FOR_REVIEW"
  | "LOGIN_REQUIRED"
  | "CAPTCHA_REQUIRED"
  | "OTP_REQUIRED"
  | "TWO_FACTOR_REQUIRED"
  | "MISSING_INFORMATION"
  | "READY_FOR_SUBMISSION"
  | "FAILED";

export type DetectedApplicationField = {
  elementId: string;
  type: string;
  label?: string;
  name?: string;
  id?: string;
  placeholder?: string;
  required: boolean;
  options: string[];
};

export type BrowserReviewItem = {
  reason: string;
  field?: DetectedApplicationField;
};

export type BrowserRunResult = {
  status: BrowserRunStatus;
  url?: string;
  fieldsDetected: number;
  fieldsFilled: string[];
  fieldsSkipped: string[];
  uploads: string[];
  reviewItems: BrowserReviewItem[];
  reason?: string;
};
