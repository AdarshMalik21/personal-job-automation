export type NaukriPlaceholder = {
  type?: string;
  label?: string;
};

export type NaukriJobRecord = {
  jobId?: string | number;
  title?: string;
  companyName?: string;
  jdURL?: string;
  experienceText?: string;
  tagsAndSkills?: string;
  jobDescription?: string;
  createdDate?: string | number;
  minimumExperience?: number;
  maximumExperience?: number;
  companyApplyJob?: boolean;
  placeholders?: NaukriPlaceholder[];
};

export type NaukriSearchResponse = {
  noOfJobs?: number;
  jobDetails?: NaukriJobRecord[];
  jobs?: NaukriJobRecord[];
};

export class NaukriSourceError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "NaukriSourceError";
    if (statusCode !== undefined) this.statusCode = statusCode;
  }
}
