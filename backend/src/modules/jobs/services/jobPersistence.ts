import type { Job } from "@personal-job-automation/shared/types";
import { JobModel, type JobDocument } from "../../../models/Job.js";

export type JobRepository = {
  upsert(job: Job): Promise<unknown>;
};

const toPersistence = (job: Job): Record<string, unknown> => ({
  ...job,
  ...(job.postedDate ? { postedDate: new Date(job.postedDate) } : {}),
  ...(job.updatedDate ? { updatedDate: new Date(job.updatedDate) } : {}),
  ...(job.discoveredDate ? { discoveredDate: new Date(job.discoveredDate) } : {}),
});

export class MongooseJobRepository implements JobRepository {
  async upsert(job: Job): Promise<JobDocument> {
    const identityFilter = job.canonicalIdentity.crossSourceKey
      ? { "canonicalIdentity.crossSourceKey": job.canonicalIdentity.crossSourceKey }
      : { source: job.source, externalJobId: job.externalJobId };
    const sourceFilter = job.externalJobId
      ? { source: job.source, externalJobId: job.externalJobId }
      : undefined;
    const filter = sourceFilter
      ? { $or: [sourceFilter, identityFilter] }
      : identityFilter;
    return JobModel.findOneAndUpdate(
      filter,
      { $set: toPersistence(job) },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();
  }
}

export const persistJobs = async (
  jobs: Job[],
  repository: JobRepository = new MongooseJobRepository(),
): Promise<void> => {
  for (const job of jobs) await repository.upsert(job);
};