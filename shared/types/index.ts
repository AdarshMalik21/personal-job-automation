export type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
};

export type RemotePreference = "remote" | "hybrid" | "onsite" | "any";

export type JobSource =
  | "company"
  | "greenhouse"
  | "lever"
  | "ashby"
  | "linkedin"
  | "naukri"
  | "indeed"
  | "wellfound"
  | "other";
export type RemoteStatus = RemotePreference | "unknown";
export type IdentityConfidence = "strong" | "probable" | "weak" | "unknown";

export type CanonicalIdentity = {
  key: string;
  strongKey?: string;
  crossSourceKey: string;
  confidence: IdentityConfidence;
  components: {
    normalizedCompany: string;
    normalizedTitle: string;
    normalizedLocation?: string;
    normalizedEmploymentType?: string;
  };
};

export type CandidateProfile = {
  id?: string;
  isActive: boolean;
  personal: {
    firstName?: string;
    lastName?: string;
    professionalSummary?: string;
  };
  contact: {
    email?: string;
    phone?: string;
    website?: string;
    linkedin?: string;
    github?: string;
  };
  location?: {
    city?: string;
    region?: string;
    country?: string;
  };
  yearsOfExperience?: number;
  experience: Array<Record<string, unknown>>;
  education: Array<Record<string, unknown>>;
  skills: string[];
  technologies: string[];
  projects: Array<Record<string, unknown>>;
  certifications: Array<Record<string, unknown>>;
  resume?: {
    fileName?: string;
    storageKey?: string;
    version?: string;
  };
  preferredRoles: string[];
  preferredLocations: string[];
  remotePreference: RemotePreference;
  verifiedInformation: Record<string, unknown>;
  relatedTechnology: string[];
  unknownInformation: string[];
};

export type JobStatus = "discovered" | "verified" | "archived" | "closed";
export type JobReviewStatus = "unreviewed" | "reviewed" | "skipped";

export type Job = {
  id?: string;
  title: string;
  normalizedTitle: string;
  company: string;
  normalizedCompany: string;
  description?: string;
  location?: string;
  normalizedLocation?: string;
  remoteStatus?: RemoteStatus;
  employmentType?: string;
  experienceRequirement?: string;
  requiredSkills: string[];
  preferredSkills: string[];
  relatedSkills: string[];
  source: JobSource;
  sourceUrl?: string;
  officialApplicationUrl?: string;
  externalJobId?: string;
  postedDate?: string;
  updatedDate?: string;
  discoveredDate?: string;
  lastVerifiedDate?: string;
  status: JobStatus;
  reviewStatus?: JobReviewStatus;
  reviewedAt?: string;
  canonicalIdentity: CanonicalIdentity;
  deduplication?: Record<string, unknown>;
  match?: {
    score?: number;
    matchScore?: number;
    decision?: "APPLY" | "REVIEW" | "SKIP";
    confidence?: "high" | "medium" | "low";
    reasoning?: string;
    qualificationStatus?: string;
    roleAnalysis?: Record<string, unknown>;
    experienceAnalysis?: Record<string, unknown>;
    locationAnalysis?: Record<string, unknown>;
    skillAnalysis?: Record<string, unknown>;
    reasons?: string[];
    hardFilterFailures?: string[];
    scoreBreakdown?: Record<string, number>;
  };
  analysis?: Record<string, unknown>;
};

export type ApplicationStatus =
  | "prepared"
  | "ready_for_review"
  | "submitted"
  | "failed"
  | "rejected"
  | "interview"
  | "offer"
  | "withdrawn"
  | "follow_up_required";

export type Application = {
  id?: string;
  jobId: string;
  candidateProfileId: string;
  status: ApplicationStatus;
  applicationUrl?: string;
  appliedDate?: string;
  resumeUsed?: Record<string, unknown>;
  coverLetter?: string;
  generatedAnswers: Array<Record<string, unknown>>;
  formFields: Record<string, unknown>;
  submission?: Record<string, unknown>;
  failure?: Record<string, unknown>;
  followUpDate?: string;
  followUpStatus?: string;
  lastStatusCheck?: string;
};

export type AuthSession = {
  token: string;
  user: {
    email: string;
    role: "admin";
  };
};
