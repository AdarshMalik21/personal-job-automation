import type { RequestHandler } from "express";
import { isValidObjectId } from "mongoose";
import { ApplicationModel } from "../models/Application.js";
import { JobModel } from "../models/Job.js";
import { evaluateFreshness } from "../modules/jobs/services/freshness.js";
import {
  buildJobFilter,
  parseJobListQuery,
  type JobListQuery,
} from "../services/jobQuery.js";

const notFound = (response: Parameters<RequestHandler>[1]) => {
  response.status(404).json({ success: false, message: "Job not found" });
};

const applicationStatuses = async (jobIds: string[]) => {
  const applications = await ApplicationModel.find({ jobId: { $in: jobIds } })
    .select("jobId status")
    .lean();
  return new Map(applications.map((application) => [String(application.jobId), application.status]));
};

const serializeJob = (job: Record<string, any>, applicationStatus?: string) => ({
  ...job,
  applicationStatus: applicationStatus ?? "not_applied",
  freshness: evaluateFreshness({ postedDate: job.postedDate, updatedDate: job.updatedDate }),
  openStatus: job.match?.openStatus ?? "unknown",
  match: job.match ?? {},
});

export const listJobs: RequestHandler = async (request, response, next) => {
  try {
    const query = parseJobListQuery(request.query);
    const filter = buildJobFilter(query);
    const [jobs, total] = await Promise.all([
      JobModel.find(filter)
        .sort(query.sort)
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      JobModel.countDocuments(filter),
    ]);
    const statuses = await applicationStatuses(jobs.map((job) => String(job._id)));
    response.json({
      success: true,
      data: {
        jobs: jobs.map((job) => serializeJob({ ...job, id: String(job._id) }, statuses.get(String(job._id)))),
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit),
        },
        query,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getJob: RequestHandler = async (request, response, next) => {
  try {
    if (!isValidObjectId(request.params.id)) {
      notFound(response);
      return;
    }
    const job = await JobModel.findById(request.params.id).lean();
    if (!job) {
      notFound(response);
      return;
    }
    const statuses = await applicationStatuses([String(job._id)]);
    response.json({
      success: true,
      data: { job: serializeJob({ ...job, id: String(job._id) }, statuses.get(String(job._id))) },
    });
  } catch (error) {
    next(error);
  }
};

export const stats: RequestHandler = async (_request, response, next) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [total, fresh, apply, review, skip, high, medium, low, average, discoveredToday, alreadyApplied] = await Promise.all([
      JobModel.countDocuments(),
      JobModel.countDocuments({ $or: [{ "match.freshness": "fresh" }, { "match.freshnessStatus": "fresh" }] }),
      JobModel.countDocuments({ "match.decision": "APPLY" }),
      JobModel.countDocuments({ "match.decision": "REVIEW" }),
      JobModel.countDocuments({ "match.decision": "SKIP" }),
      JobModel.countDocuments({ "match.confidence": "high" }),
      JobModel.countDocuments({ "match.confidence": "medium" }),
      JobModel.countDocuments({ "match.confidence": "low" }),
      JobModel.aggregate([{ $match: { $or: [{ "match.matchScore": { $type: "number" } }, { "match.score": { $type: "number" } }] } }, { $project: { value: { $ifNull: ["$match.matchScore", "$match.score"] } } }, { $group: { _id: null, value: { $avg: "$value" } } }]),
      JobModel.countDocuments({ discoveredDate: { $gte: startOfDay } }),
      ApplicationModel.countDocuments({ status: { $in: ["submitted", "interview", "offer"] } }),
    ]);
    response.json({
      success: true,
      data: {
        totalJobs: total,
        freshJobs: fresh,
        applyCount: apply,
        reviewCount: review,
        skipCount: skip,
        highConfidence: high,
        mediumConfidence: medium,
        lowConfidence: low,
        averageMatchScore: average[0]?.value ?? 0,
        jobsDiscoveredToday: discoveredToday,
        alreadyApplied,
      },
    });
  } catch (error) {
    next(error);
  }
};

const updateReviewStatus = (status: "reviewed" | "skipped"): RequestHandler => async (request, response, next) => {
  try {
    if (!isValidObjectId(request.params.id)) {
      notFound(response);
      return;
    }
    const job = await JobModel.findByIdAndUpdate(
      request.params.id,
      { $set: { reviewStatus: status, reviewedAt: new Date() } },
      { new: true },
    ).lean();
    if (!job) {
      notFound(response);
      return;
    }
    response.json({ success: true, data: { job: serializeJob({ ...job, id: String(job._id) }) } });
  } catch (error) {
    next(error);
  }
};

export const markReviewed = updateReviewStatus("reviewed");
export const markSkipped = updateReviewStatus("skipped");