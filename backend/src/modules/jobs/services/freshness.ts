export type FreshnessStatus = "fresh" | "stale" | "unknown";

export type FreshnessResult = {
  status: FreshnessStatus;
  reason: string;
  date?: string;
};

export type FreshnessOptions = {
  now?: Date;
  freshWithinDays?: number;
};

const parseDate = (value: string | Date | undefined): Date | undefined => {
  if (value === undefined) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

export const evaluateFreshness = (
  dates: { postedDate?: string | Date; updatedDate?: string | Date },
  options: FreshnessOptions = {},
): FreshnessResult => {
  const date = parseDate(dates.updatedDate) ?? parseDate(dates.postedDate);
  if (!date) {
    return { status: "unknown", reason: "No valid source date is available" };
  }

  const now = options.now ?? new Date();
  const freshWithinDays = options.freshWithinDays ?? 30;
  if (!Number.isFinite(freshWithinDays) || freshWithinDays < 0) {
    throw new Error("freshWithinDays must be a non-negative finite number");
  }
  const ageMs = now.getTime() - date.getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  if (ageDays <= freshWithinDays) {
    return {
      status: "fresh",
      reason: `Source date is within ${freshWithinDays} days`,
      date: date.toISOString(),
    };
  }
  return {
    status: "stale",
    reason: `Source date is older than ${freshWithinDays} days`,
    date: date.toISOString(),
  };
};
