import type {
  CanonicalIdentity,
  Job,
  JobSource,
} from "@personal-job-automation/shared/types";

export type CanonicalJob = Job;

export type CanonicalIdentityInput = {
  source: JobSource;
  externalJobId?: string;
  officialApplicationUrl?: string;
  normalizedCompany: string;
  normalizedTitle: string;
  normalizedLocation?: string;
  normalizedEmploymentType?: string;
};

export type CanonicalJobIdentity = CanonicalIdentity;
