export type DailyWorkflowJob = {
  jobId: string;
  applicationStatus: string;
  preparationStatus: string;
  missingInformation: string[];
};

export const overlayDailyWorkflow = <T extends { jobId: string; applicationStatus: string }>(
  jobs: readonly T[],
  applications: ReadonlyArray<{ jobId: string; status: string }>,
  preparations: ReadonlyArray<{ jobId: string; status?: string; missingInformation?: string[] }>,
): Array<T & DailyWorkflowJob> => {
  const applicationStatus = new Map(applications.map((item) => [item.jobId, item.status]));
  const preparation = new Map(preparations.map((item) => [item.jobId, item]));
  return jobs.map((job) => {
    const current = preparation.get(job.jobId);
    const missingInformation = (current?.missingInformation ?? []).filter((item) => item.trim().length > 0);
    const preparationStatus =
      current?.status && current.status !== "not_started" ? current.status : "not_started";
    return {
      ...job,
      applicationStatus: applicationStatus.get(job.jobId) ?? job.applicationStatus,
      preparationStatus,
      missingInformation,
    };
  });
};
