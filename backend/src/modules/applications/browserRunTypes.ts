export type BrowserRunStatus =
  | "RUNNING"
  | "PAUSED_FOR_REVIEW"
  | "LOGIN_REQUIRED"
  | "CAPTCHA_REQUIRED"
  | "OTP_REQUIRED"
  | "TWO_FACTOR_REQUIRED"
  | "MISSING_INFORMATION"
  | "READY_FOR_SUBMISSION"
  | "FAILED"
  | "SUBMITTING"
  | "SUBMITTED"
  | "SUBMISSION_FAILED"
  | "SUBMISSION_UNKNOWN"
  | "CANCELLED"
  | "BROWSER_SESSION_EXPIRED";

export type ReviewFieldSource =
  | "candidate profile"
  | "prepared answer"
  | "user"
  | "generated"
  | "browser-detected";

export type ReviewFieldStatus = "known" | "filled" | "missing" | "requires_review" | "unknown";

export type DetectedApplicationField = {
  elementId: string;
  type: string;
  label?: string;
  name?: string;
  id?: string;
  placeholder?: string;
  value?: string;
  required: boolean;
  options: string[];
  visible?: boolean;
  enabled?: boolean;
  group?: string;
};

export type BrowserReviewItem = {
  reason: string;
  field?: DetectedApplicationField;
};

export type ReviewedApplicationField = DetectedApplicationField & {
  currentValue?: string;
  source: ReviewFieldSource;
  reviewStatus: ReviewFieldStatus;
};

export type BrowserRunResult = {
  status: BrowserRunStatus;
  runId?: string;
  url?: string;
  frameUrl?: string;
  applicationFrameDetected?: boolean;
  fieldsDetected: number;
  fieldsFilled: string[];
  fieldsSkipped: string[];
  fields?: ReviewedApplicationField[];
  finalControl?: string;
  uploads: string[];
  reviewItems: BrowserReviewItem[];
  reason?: string;
  pagesProcessed?: number;
  stopped?: boolean;
};
