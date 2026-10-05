export const PROCESSED_APPLICATION_STATUSES = [
  "submitted",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "follow_up_required",
] as const;

export const isAlreadyAppliedStatus = (status: string): boolean =>
  (PROCESSED_APPLICATION_STATUSES as readonly string[]).includes(status);