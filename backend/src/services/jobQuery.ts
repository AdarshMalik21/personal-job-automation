import type { FilterQuery } from "mongoose";
import type { JobDocument } from "../models/Job.js";
import { DEFAULT_FRESH_WITHIN_DAYS } from "../modules/jobs/services/freshness.js";

export type JobListQuery = {
  page: number;
  limit: number;
  search?: string;
  decision?: "APPLY" | "REVIEW" | "SKIP";
  status?: string;
  reviewStatus?: "unreviewed" | "reviewed" | "skipped";
  remoteStatus?: string;
  location?: string;
  freshness?: "fresh" | "stale" | "unknown";
  minScore?: number;
  maxScore?: number;
  sort: Record<string, 1 | -1>;
};

const decisions = new Set(["APPLY", "REVIEW", "SKIP"]);
const reviewStatuses = new Set(["unreviewed", "reviewed", "skipped"]);
const freshnessStatuses = new Set(["fresh", "stale", "unknown"]);
const sortFields: Record<string, Record<string, 1 | -1>> = {
  score: { "match.matchScore": -1, "match.score": -1, postedDate: -1 },
  newest: { postedDate: -1, discoveredDate: -1 },
  updated: { updatedDate: -1, postedDate: -1 },
  company: { normalizedCompany: 1, normalizedTitle: 1 },
  title: { normalizedTitle: 1, normalizedCompany: 1 },
};

const value = (input: unknown): string | undefined => {
  if (typeof input !== "string") return undefined;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const numberValue = (input: unknown, name: string): number | undefined => {
  const text = value(input);
  if (text === undefined) return undefined;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number`);
  return parsed;
};

export const parseJobListQuery = (input: Record<string, unknown>): JobListQuery => {
  const page = Math.max(1, Math.floor(numberValue(input.page, "page") ?? 1));
  const limit = Math.min(50, Math.max(1, Math.floor(numberValue(input.limit, "limit") ?? 20)));
  const decision = value(input.decision);
  const reviewStatus = value(input.reviewStatus);
  const search = value(input.search);
  const status = value(input.status);
  const remoteStatus = value(input.remoteStatus);
  const location = value(input.location);
  const freshness = value(input.freshness);
  const minScore = numberValue(input.minScore, "minScore");
  const maxScore = numberValue(input.maxScore, "maxScore");
  const sortBy = value(input.sortBy) ?? "score";
  const sortOrder = value(input.sortOrder) === "asc" ? 1 : -1;
  if (decision && !decisions.has(decision)) throw new Error("decision is invalid");
  if (reviewStatus && !reviewStatuses.has(reviewStatus)) throw new Error("reviewStatus is invalid");
  if (freshness && !freshnessStatuses.has(freshness)) throw new Error("freshness is invalid");
  const parsedDecision = decision as Exclude<JobListQuery["decision"], undefined> | undefined;
  const parsedReviewStatus = reviewStatus as Exclude<JobListQuery["reviewStatus"], undefined> | undefined;
  const parsedFreshness = freshness as Exclude<JobListQuery["freshness"], undefined> | undefined;
  if (!sortFields[sortBy]) throw new Error("sortBy is invalid");
  return {
    page,
    limit,
    ...(search ? { search } : {}),
    ...(parsedDecision ? { decision: parsedDecision } : {}),
    ...(status ? { status } : {}),
    ...(parsedReviewStatus ? { reviewStatus: parsedReviewStatus } : {}),
    ...(remoteStatus ? { remoteStatus } : {}),
    ...(location ? { location } : {}),
    ...(parsedFreshness ? { freshness: parsedFreshness } : {}),
    ...(minScore !== undefined ? { minScore } : {}),
    ...(maxScore !== undefined ? { maxScore } : {}),
    sort: Object.fromEntries(Object.entries(sortFields[sortBy]).map(([field, direction]) => [field, (direction * sortOrder) as 1 | -1])),
  };
};

export const buildFreshnessFilter = (
  freshness: NonNullable<JobListQuery["freshness"]>,
  now = new Date(),
): FilterQuery<JobDocument> => {
  const cutoff = new Date(
    now.getTime() - DEFAULT_FRESH_WITHIN_DAYS * 24 * 60 * 60 * 1000,
  );
  const missingUpdatedDate = {
    $or: [{ updatedDate: { $exists: false } }, { updatedDate: null }],
  };
  const missingPostedDate = {
    $or: [{ postedDate: { $exists: false } }, { postedDate: null }],
  };
  if (freshness === "fresh") {
    return {
      $or: [
        { updatedDate: { $gte: cutoff } },
        { $and: [missingUpdatedDate, { postedDate: { $gte: cutoff } }] },
      ],
    };
  }
  if (freshness === "stale") {
    return {
      $or: [
        { updatedDate: { $lt: cutoff } },
        { $and: [missingUpdatedDate, { postedDate: { $lt: cutoff } }] },
      ],
    };
  }
  return { $and: [missingUpdatedDate, missingPostedDate] };
};

const escapeRegex = (input: string): string => input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const buildJobFilter = (query: JobListQuery): FilterQuery<JobDocument> => {
  const filter: FilterQuery<JobDocument> = {};
  const and: FilterQuery<JobDocument>[] = [];
  if (query.decision) and.push({ "match.decision": query.decision });
  if (query.status) and.push({ status: query.status });
  if (query.reviewStatus) and.push({ reviewStatus: query.reviewStatus });
  if (query.remoteStatus) and.push({ remoteStatus: query.remoteStatus });
  if (query.location) and.push({ $or: [{ location: new RegExp(escapeRegex(query.location), "i") }, { normalizedLocation: new RegExp(escapeRegex(query.location), "i") }] });
  if (query.freshness) and.push(buildFreshnessFilter(query.freshness));
  if (query.search) {
    const search = new RegExp(escapeRegex(query.search), "i");
    and.push({ $or: [{ title: search }, { company: search }, { description: search }, { location: search }, { requiredSkills: search }, { preferredSkills: search }] });
  }
  if (query.minScore !== undefined || query.maxScore !== undefined) {
    const range: Record<string, number> = {};
    if (query.minScore !== undefined) range.$gte = query.minScore;
    if (query.maxScore !== undefined) range.$lte = query.maxScore;
    and.push({ $or: [{ "match.matchScore": range }, { "match.score": range }] });
  }
  if (and.length === 1) return and[0]!;
  if (and.length > 1) filter.$and = and;
  return filter;
};