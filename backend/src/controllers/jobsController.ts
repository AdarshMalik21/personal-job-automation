import type { RequestHandler } from "express";
import { isValidObjectId } from "mongoose";
import { ApplicationModel } from "../models/Application.js";
import { JobModel } from "../models/Job.js";
import { evaluateFreshness } from "../modules/jobs/services/freshness.js";
import {
  buildJobFilter,
  buildFreshnessFilter,
  parseJobListQuery,
  type JobListQuery,
} from "../services/jobQuery.js";
import { trackingSummary, type TrackedApplication } from "../modules/applications/applicationTracking.js";
import { PROCESSED_APPLICATION_STATUSES } from "../services/jobApplicationStatus.js";

const notFound = (response: Parameters<RequestHandler>[1]) => {
  response.status(404).json({ success: false, message: "Job not found" });
};

export const applicationStatuses = async (jobIds: string[]) => {
  const applications = await ApplicationModel.find({ jobId: { $in: jobIds } })
    .select("jobId status")
    .lean();
  return new Map(
    applications.map((application) => [
      String(application.jobId),
      application.status,
    ]),
  );
};

export const applicationStatus = async (jobId: string): Promise<string> =>
  (await applicationStatuses([jobId])).get(jobId) ?? "not_applied";

export const serializeJob = (
  job: Record<string, any>,
  applicationStatus?: string,
  tracking?: ReturnType<typeof trackingSummary>,
) => ({
  ...job,
  applicationStatus: applicationStatus ?? tracking?.status ?? "not_applied",
  ...(tracking ? { tracking } : {}),
  ...(job.reviewStatus ? { reviewStatus: job.reviewStatus } : {}),
  freshness: evaluateFreshness({
    postedDate: job.postedDate,
    updatedDate: job.updatedDate,
  }),
  openStatus: job.match?.openStatus ?? "unknown",
  match: job.match ?? {},
});

const applicationRecords = async (jobIds: string[]) => {
  const applications = await ApplicationModel.find({ jobId: { $in: jobIds } })
    .select("jobId status appliedDate updatedAt history followUp")
    .lean();
  return new Map(applications.map((application) => {
    const summary = trackingSummary(application as TrackedApplication);
    return [String(application.jobId), { status: application.status, tracking: summary }] as const;
  }));
};

export const listJobs: RequestHandler = async (request, response, next) => {
  try {
    const query = parseJobListQuery(request.query);
    const filter = buildJobFilter(query);
    const applicationIds = query.applicationStatus
      ? await ApplicationModel.find({ status: query.applicationStatus }).distinct("jobId")
      : undefined;
    const listFilter = applicationIds
      ? Object.keys(filter).length ? { $and: [filter, { _id: { $in: applicationIds } }] } : { _id: { $in: applicationIds } }
      : filter;
    const [jobs, total] = await Promise.all([
      JobModel.find(listFilter)
        .sort(query.sort)
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      JobModel.countDocuments(listFilter),
    ]);
    const records = await applicationRecords(jobs.map((job) => String(job._id)));
    response.json({
      success: true,
      data: {
        jobs: jobs.map((job) => {
          const record = records.get(String(job._id));
          return serializeJob({ ...job, id: String(job._id) }, record?.status, record?.tracking);
        }),
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
    const records = await applicationRecords([String(job._id)]);
    const record = records.get(String(job._id));
    response.json({
      success: true,
      data: {
        job: serializeJob({ ...job, id: String(job._id) }, record?.status, record?.tracking),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const stats: RequestHandler = async (_request, response, next) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [
      total,
      fresh,
      apply,
      review,
      skip,
      high,
      medium,
      low,
      average,
      discoveredToday,
      alreadyApplied,
    ] = await Promise.all([
      JobModel.countDocuments(),
      JobModel.countDocuments(buildFreshnessFilter("fresh")),
      JobModel.countDocuments({ "match.decision": "APPLY" }),
      JobModel.countDocuments({ "match.decision": "REVIEW" }),
      JobModel.countDocuments({ "match.decision": "SKIP" }),
      JobModel.countDocuments({ "match.confidence": "high" }),
      JobModel.countDocuments({ "match.confidence": "medium" }),
      JobModel.countDocuments({ "match.confidence": "low" }),
      JobModel.aggregate([
        {
          $match: {
            $or: [
              { "match.matchScore": { $type: "number" } },
              { "match.score": { $type: "number" } },
            ],
          },
        },
        {
          $project: {
            value: { $ifNull: ["$match.matchScore", "$match.score"] },
          },
        },
        { $group: { _id: null, value: { $avg: "$value" } } },
      ]),
      JobModel.countDocuments({ discoveredDate: { $gte: startOfDay } }),
      ApplicationModel.countDocuments({
        status: { $in: PROCESSED_APPLICATION_STATUSES },
      }),
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

const updateReviewStatus =
  (status: "reviewed" | "skipped"): RequestHandler =>
  async (request, response, next) => {
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
      response.json({
        success: true,
        data: {
          job: serializeJob(
            { ...job, id: String(job._id) },
            await applicationStatus(String(job._id)),
          ),
        },
      });
    } catch (error) {
      next(error);
    }
  };

export const markReviewed = updateReviewStatus("reviewed");
export const markSkipped = updateReviewStatus("skipped");
