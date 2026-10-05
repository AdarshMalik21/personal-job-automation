import type { JobSource } from "@personal-job-automation/shared/types";

export type RawJobInput = {
  source: JobSource;
  externalJobId?: string;
  title: string;
  company: string;
  description?: string;
  location?: string;
  remoteStatus?: string;
  employmentType?: string;
  experienceRequirement?: string;
  requiredSkills?: string[];
  preferredSkills?: string[];
  relatedSkills?: string[];
  sourceUrl?: string;
  officialApplicationUrl?: string;
  postedDate?: string | Date;
  updatedDate?: string | Date;
};
